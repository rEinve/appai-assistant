import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { access, readFile, writeFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { Pool } from 'pg';

const root = process.cwd();
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const node = process.execPath;
const apiPort = process.env['APP_PORT'] ?? '4300';
const apiUrl = `http://127.0.0.1:${apiPort}`;
const children = new Set();

function parseEnvFile(contents) {
  const values = {};
  for (const line of contents.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)\s*$/);
    if (match) values[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2');
  }
  return values;
}

async function prepareEnvironment() {
  try {
    await access(`${root}/.env`);
  } catch {
    const template = await readFile(`${root}/.env.example`, 'utf8');
    const secret = randomBytes(48).toString('base64url');
    const localEnv = template.replace(/^BETTER_AUTH_SECRET=.*$/m, `BETTER_AUTH_SECRET=${secret}`);
    await writeFile(`${root}/.env`, localEnv, { mode: 0o600, flag: 'wx' });
    console.log('Created a private .env with a generated local authentication secret.');
  }

  const fileEnv = parseEnvFile(await readFile(`${root}/.env`, 'utf8'));
  for (const key of ['DATABASE_URL', 'BETTER_AUTH_URL', 'BETTER_AUTH_SECRET', 'APP_USE_DOCKER_DB']) {
    if (process.env[key] === undefined && fileEnv[key] !== undefined) process.env[key] = fileEnv[key];
  }
  if (!process.env['DATABASE_URL'] || !process.env['BETTER_AUTH_URL'] || (process.env['BETTER_AUTH_SECRET'] ?? '').length < 32) {
    throw new Error('Set DATABASE_URL, BETTER_AUTH_URL, and a BETTER_AUTH_SECRET of at least 32 characters in .env.');
  }
  if (process.env['DATABASE_URL'].includes('YOUR_LOCAL_PG_')) {
    throw new Error('Set DATABASE_URL in .env to a database, user, and password for your installed PostgreSQL server.');
  }
}

async function databaseIsReady() {
  const pool = new Pool({ connectionString: process.env['DATABASE_URL'], max: 1, connectionTimeoutMillis: 1200 });
  try {
    await pool.query('SELECT 1');
    return true;
  } catch {
    return false;
  } finally {
    await pool.end();
  }
}

function run(command, args, label) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: root, env: process.env, stdio: 'inherit' });
    child.once('error', reject);
    child.once('exit', (code) => code === 0 ? resolve() : reject(new Error(`${label} exited with status ${code ?? 'unknown'}.`)));
  });
}

async function waitForDatabase() {
  if (await databaseIsReady()) return;
  const databaseHost = new URL(process.env['DATABASE_URL']).hostname;
  if (!['localhost', '127.0.0.1', '::1'].includes(databaseHost)) {
    throw new Error(`Cannot connect to the configured PostgreSQL server (${databaseHost}). Check DATABASE_URL and start that database.`);
  }

  if (process.env['APP_USE_DOCKER_DB'] !== 'true') {
    throw new Error(`Cannot connect to PostgreSQL at ${databaseHost}. Start your installed PostgreSQL service and check DATABASE_URL (including database, user, and password). Docker is optional; set APP_USE_DOCKER_DB=true only if you want the Compose database.`);
  }

  console.log('Starting the optional Docker PostgreSQL service…');
  await run('docker', ['compose', 'up', '-d', 'db'], 'Docker Compose');
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (await databaseIsReady()) return;
    await delay(1000);
  }
  throw new Error('PostgreSQL did not become ready. Check Docker Compose and the local database logs.');
}

async function waitForAPI(api) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (api.exitCode !== null) throw new Error(`The local API exited with status ${api.exitCode}.`);
    try {
      const response = await fetch(`${apiUrl}/health`, { signal: AbortSignal.timeout(1000) });
      if (response.ok) {
        const health = await response.json();
        if (health.memberAuthAvailable) return;
        throw new Error('The API started without member authentication. Check DATABASE_URL and BETTER_AUTH settings in .env.');
      }
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('The API started')) throw error;
    }
    await delay(200);
  }
  throw new Error('The local API did not become ready at ' + apiUrl + '.');
}

function stopChildren() {
  for (const child of children) if (child.exitCode === null) child.kill('SIGTERM');
}

try {
  await prepareEnvironment();
  await waitForDatabase();
  console.log('Applying local database migrations…');
  await run(npm, ['run', 'db:migrate'], 'Database migration');
  await run(npm, ['run', 'build:api'], 'API build');
  await run(npm, ['run', 'build:worker'], 'Worker build');

  const apiFile = `${root}/dist/api/apps/api/src/server.js`;
  const api = spawn(node, ['--env-file-if-exists=.env', apiFile], { cwd: root, env: process.env, stdio: 'inherit' });
  children.add(api);
  await waitForAPI(api);
  const workerFile = `${root}/dist/worker/apps/worker/src/worker.js`;
  const worker = spawn(node, ['--env-file-if-exists=.env', workerFile], { cwd: root, env: process.env, stdio: 'inherit' });
  children.add(worker);

  if (!existsSync(`${root}/dist/appai-website/index.html`)) {
    console.log('Building website production bundle for live testing…');
    await run(npm, ['run', 'build'], 'Website build');
  }

  console.log('Member API and durable worker are ready. Live testing site at http://localhost:4200 (tunnel & Nginx).');
  console.log('For active development with hot-reload, run: npm run dev (http://localhost:4201).');

  const web = spawn(npm, ['run', 'start:web'], { cwd: root, env: process.env, stdio: 'inherit' });
  children.add(web);
  const stop = () => stopChildren();
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
  await new Promise((resolve, reject) => {
    api.once('exit', (code) => {
      stopChildren();
      code === 0 ? resolve() : reject(new Error(`The local API exited with status ${code ?? 'unknown'}.`));
    });
    worker.once('exit', (code) => {
      stopChildren();
      code === 0 ? resolve() : reject(new Error(`The local worker exited with status ${code ?? 'unknown'}.`));
    });
    web.once('exit', (code) => {
      stopChildren();
      code === 0 ? resolve() : reject(new Error(`The Angular dev server exited with status ${code ?? 'unknown'}.`));
    });
    api.once('error', reject);
    worker.once('error', reject);
    web.once('error', reject);
  });
} catch (error) {
  stopChildren();
  console.error(`\nLocal Appai startup failed: ${error instanceof Error ? error.message : String(error)}`);
  if (error instanceof Error && /permission denied|docker API/i.test(error.message)) {
    console.error('Start or repair Docker Desktop/OrbStack access, then run npm start again.');
  }
  process.exitCode = 1;
}
