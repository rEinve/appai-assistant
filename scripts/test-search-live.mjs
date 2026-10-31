import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import { Pool } from 'pg';

if (!process.env.DATABASE_URL || !process.env.BETTER_AUTH_SECRET || !process.env.serperApiKey) {
  throw new Error('Configure local member authentication and a Serper key before testing live search.');
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
const origin = 'http://localhost:4200';
const email = `search-${randomUUID().slice(0, 12)}@example.test`;
let child;
let baseURL;
let ownerId;
let authUserId;

async function freePort() {
  const socket = createServer();
  await new Promise((resolve, reject) => socket.listen(0, '127.0.0.1', resolve).once('error', reject));
  const { port } = socket.address();
  await new Promise((resolve, reject) => socket.close((error) => error ? reject(error) : resolve()));
  return port;
}

async function request(path, { body, cookie } = {}) {
  const response = await fetch(`${baseURL}${path}`, {
    method: 'POST',
    headers: { origin, 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(18_000),
  });
  const data = await response.json();
  const sessionCookie = (response.headers.getSetCookie?.() ?? []).map((value) => value.split(';', 1)[0]).find((value) => /session_token=/.test(value));
  return { status: response.status, data, cookie: sessionCookie };
}

try {
  const port = await freePort();
  baseURL = `http://127.0.0.1:${port}`;
  child = spawn(process.execPath, ['dist/api/apps/api/src/server.js'], {
    env: { ...process.env, APP_PORT: String(port), BETTER_AUTH_URL: baseURL, WEB_APP_ORIGIN: origin, NODE_ENV: 'test' },
    stdio: 'ignore',
  });
  let ready = false;
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`API exited with ${child.exitCode}.`);
    try { ready = (await fetch(`${baseURL}/health`)).ok; } catch { /* Starting. */ }
    if (ready) break;
    await delay(100);
  }
  assert.ok(ready, 'temporary API must start');

  const denied = await request('/api/v1/discovery/search', { body: { query: 'laptop shops Arusha' } });
  assert.equal(denied.status, 401, 'search must require a member session');

  const inviteCode = randomUUID() + randomUUID();
  await pool.query('INSERT INTO member_invites (email, token_digest, expires_at) VALUES ($1, $2, now() + interval \'1 hour\')',
    [email, createHash('sha256').update(inviteCode).digest('hex')]);
  const signUp = await request('/api/auth/sign-up/email', {
    body: { name: 'Search Test', email, password: 'Search-test-Password-49!', inviteCode },
  });
  assert.equal(signUp.status, 200, `invite-only enrollment: ${signUp.status}`);
  assert.ok(signUp.cookie, 'enrollment must create a session');
  const cookie = signUp.cookie;
  const profileResponse = await fetch(`${baseURL}/api/v1/me`, { headers: { origin, cookie } });
  assert.equal(profileResponse.status, 200);
  ownerId = (await profileResponse.json()).member.id;
  authUserId = (await pool.query('SELECT id FROM "user" WHERE email = $1', [email])).rows[0].id;

  const invalid = await request('/api/v1/discovery/search', { cookie, body: { query: 'x' } });
  assert.equal(invalid.status, 400, 'short search query must be rejected before provider access');
  const search = await request('/api/v1/discovery/search', { cookie, body: { query: 'laptop retailers Arusha Tanzania' } });
  if (search.status === 503 && search.data.code === 'SEARCH_PROVIDER_UNAUTHORIZED') {
    console.log('BLOCKED: authenticated search reached Serper, which rejected the configured key (403).');
    process.exitCode = 2;
  } else {
    assert.equal(search.status, 200, `live search: HTTP ${search.status}, code ${search.data.code ?? 'none'}`);
    assert.ok(Array.isArray(search.data.results));
    assert.ok(search.data.results.length <= 3);
    assert.ok(search.data.results.every((result) => /^https?:\/\//.test(result.url) && result.title));
    assert.ok(search.data.fetchedAt);
    console.log(`PASS: authenticated live search returned ${search.data.results.length} unverified source links.`);
  }
} finally {
  if (child && child.exitCode === null) {
    child.kill('SIGTERM');
    await new Promise((resolve) => child.once('exit', resolve));
  }
  try {
    if (ownerId) await pool.query('DELETE FROM users WHERE id = $1', [ownerId]);
    if (authUserId) await pool.query('DELETE FROM "user" WHERE id = $1', [authUserId]);
    await pool.query('DELETE FROM member_invites WHERE email = $1', [email]);
  } finally { await pool.end(); }
}
