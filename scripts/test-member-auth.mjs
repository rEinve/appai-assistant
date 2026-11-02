import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { readFile, readdir } from 'node:fs/promises';
import { createServer } from 'node:net';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { readFile as readSource } from 'node:fs/promises';
import { Pool } from 'pg';

const databaseUrl = process.env['DATABASE_URL'];
const secret = process.env['BETTER_AUTH_SECRET'];
if (!databaseUrl || !secret || secret.length < 32) {
  throw new Error('Set DATABASE_URL and a BETTER_AUTH_SECRET (32+ characters) in .env before running test:auth.');
}

const root = dirname(fileURLToPath(import.meta.url));
const pool = new Pool({ connectionString: databaseUrl, max: 3 });
const serverFile = join(root, '..', 'dist', 'api', 'apps', 'api', 'src', 'server.js');
const migrationDir = join(root, '..', 'packages', 'persistence', 'migrations');
const origins = 'http://localhost:4200';
const suffix = randomUUID().replaceAll('-', '').slice(0, 12);
const emails = [`m1a-${suffix}-one@example.test`, `m1a-${suffix}-two@example.test`];
const passwords = ['M1A-correct-horse-92!', 'M1A-river-planet-47!'];
const tokens = [];
let child;
let baseURL;

async function freePort() {
  const socket = createServer();
  await new Promise((resolve, reject) => socket.listen(0, '127.0.0.1', resolve).once('error', reject));
  const { port } = socket.address();
  await new Promise((resolve, reject) => socket.close((error) => error ? reject(error) : resolve()));
  return port;
}

async function request(path, { method = 'GET', body, cookie, origin = origins } = {}) {
  const response = await fetch(`${baseURL}${path}`, {
    method,
    headers: {
      ...(body ? { 'content-type': 'application/json' } : {}),
      ...(cookie ? { cookie } : {}),
      ...(origin ? { origin } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await response.text();
  let json;
  try { json = text ? JSON.parse(text) : null; } catch { json = text; }
  const setCookie = response.headers.getSetCookie?.() ?? [];
  const sessionCookie = setCookie.map((item) => item.split(';', 1)[0]).filter((item) => /session_token=/.test(item)).join('; ');
  return { response, json, sessionCookie, setCookie };
}

async function waitForAPI() {
  for (let i = 0; i < 50; i += 1) {
    if (child.exitCode !== null) throw new Error(`API exited early with status ${child.exitCode}.`);
    try {
      const response = await fetch(`${baseURL}/health`);
      if (response.ok) return;
    } catch { /* API is still starting. */ }
    await delay(100);
  }
  throw new Error('Timed out waiting for the member API.');
}

async function invite(email) {
  const token = randomUUID() + randomUUID();
  const digest = (await import('node:crypto')).createHash('sha256').update(token).digest('hex');
  await pool.query(
    `INSERT INTO member_invites (email, token_digest, expires_at)
     VALUES ($1, $2, now() + interval '1 hour')`,
    [email, digest],
  );
  tokens.push(digest);
  return token;
}

async function main() {
  const migrationFiles = (await readdir(migrationDir)).filter((file) => /^\d+_.*\.sql$/.test(file)).sort();
  for (const file of migrationFiles) await pool.query(await readFile(join(migrationDir, file), 'utf8'));
  // Keep repeated local acceptance runs independent while preserving any pre-existing loopback counters.
  const savedRateLimits = await pool.query('SELECT id, key, count, "lastRequest" FROM "rateLimit" WHERE key LIKE $1', ['127.0.0.1|/%']);
  await pool.query('DELETE FROM "rateLimit" WHERE key LIKE $1', ['127.0.0.1|/%']);

  const port = await freePort();
  baseURL = `http://127.0.0.1:${port}`;
  child = spawn(process.execPath, [serverFile], {
    cwd: join(root, '..'),
    env: { ...process.env, APP_PORT: String(port), WEB_APP_ORIGIN: origins, NODE_ENV: 'test' },
    stdio: 'ignore',
  });
  try {
    await waitForAPI();
    const health = await (await fetch(`${baseURL}/health`)).json();
    assert.equal(health.memberAuthAvailable, true, 'auth configuration should be available');

    const denied = await request('/api/v1/me');
    assert.equal(denied.response.status, 401, `unauthenticated profile access must fail closed (received ${denied.response.status}: ${JSON.stringify(denied.json)})`);

    const authCookies = [];
    for (let i = 0; i < emails.length; i += 1) {
      const code = await invite(emails[i]);
      const signup = await request('/api/auth/sign-up/email', {
        method: 'POST',
        body: { name: `M1A Member ${i + 1}`, email: emails[i], password: passwords[i], inviteCode: code },
      });
      assert.equal(signup.response.status, 200, `invited enrollment ${i + 1} should succeed (${JSON.stringify(signup.json)})`);
      assert.ok(signup.sessionCookie, 'sign-up should set a session cookie');
      authCookies.push(signup.sessionCookie);
    }

    const profileOne = await request('/api/v1/me', { cookie: authCookies[0] });
    const profileTwo = await request('/api/v1/me', { cookie: authCookies[1] });
    assert.equal(profileOne.response.status, 200);
    assert.equal(profileTwo.response.status, 200);
    assert.equal(profileOne.json.member.email, emails[0]);
    assert.equal(profileTwo.json.member.email, emails[1]);
    assert.notEqual(profileOne.json.member.id, profileTwo.json.member.id, 'members must have distinct owner IDs');
    const spoofedOwner = await request(`/api/v1/me?ownerId=${encodeURIComponent(profileTwo.json.member.id)}`, { cookie: authCookies[0] });
    assert.equal(spoofedOwner.json.member.id, profileOne.json.member.id, 'owner identity must come from the authenticated session, never a caller-supplied ID');

    const oneAuthUser = await pool.query('SELECT id FROM "user" WHERE email = $1', [emails[0]]);
    const mapped = await pool.query('SELECT id FROM users WHERE identity_provider_subject = $1', [oneAuthUser.rows[0].id]);
    assert.equal(mapped.rowCount, 1, 'one auth identity must map to one application member');
    await request('/api/v1/me', { cookie: authCookies[0] });
    const remapped = await pool.query('SELECT count(*)::int AS n FROM users WHERE identity_provider_subject = $1', [oneAuthUser.rows[0].id]);
    assert.equal(remapped.rows[0].n, 1, 'repeated authenticated requests must remain idempotent');

    const badOrigin = await request('/api/auth/sign-in/email', {
      method: 'POST', origin: 'https://attacker.invalid',
      body: { email: emails[0], password: passwords[0] },
    });
    assert.ok(badOrigin.response.status >= 400, 'cross-origin sign-in must be rejected');

    const appColumns = await pool.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema = current_schema() AND table_name = 'users'`,
    );
    const appColumnNames = appColumns.rows.map((row) => row.column_name);
    assert.ok(!appColumnNames.some((name) => /password|token|secret|session/i.test(name)), 'application member table must not store passwords, tokens, secrets, or sessions');

    const authUserIds = [oneAuthUser.rows[0].id];
    const secondAuthUser = await pool.query('SELECT id FROM "user" WHERE email = $1', [emails[1]]);
    authUserIds.push(secondAuthUser.rows[0].id);
    const idleSignIn = await request('/api/auth/sign-in/email', {
      method: 'POST', body: { email: emails[1], password: passwords[1] },
    });
    assert.equal(idleSignIn.response.status, 200, 'second member should sign in');
    const idleSession = await pool.query('SELECT id FROM "session" WHERE "userId" = $1 ORDER BY "createdAt" DESC LIMIT 1', [authUserIds[1]]);
    await pool.query('UPDATE "session" SET "expiresAt" = now() - interval \'1 second\' WHERE id = $1', [idleSession.rows[0].id]);
    const idleExpiry = await request('/api/v1/me', { cookie: idleSignIn.sessionCookie });
    assert.equal(idleExpiry.response.status, 401, 'idle session expiry must be enforced');

    const session = await pool.query('SELECT id FROM "session" WHERE "userId" = $1 ORDER BY "createdAt" DESC LIMIT 1', [authUserIds[0]]);
    assert.equal(session.rowCount, 1, 'database-backed auth session should exist');
    await pool.query('UPDATE "session" SET "createdAt" = now() - interval \'9 hours\' WHERE id = $1', [session.rows[0].id]);
    const absoluteExpiry = await request('/api/v1/me', { cookie: authCookies[0] });
    assert.equal(absoluteExpiry.response.status, 401, 'absolute session lifetime must be enforced');
    const revoked = await pool.query('SELECT count(*)::int AS n FROM "session" WHERE id = $1', [session.rows[0].id]);
    assert.equal(revoked.rows[0].n, 0, 'expired absolute session must be revoked in PostgreSQL');

    const disableUser = await pool.query('SELECT id FROM "user" WHERE email = $1', [emails[1]]);
    await pool.query('UPDATE users SET active = false WHERE identity_provider_subject = $1', [disableUser.rows[0].id]);
    const disabled = await request('/api/v1/me', { cookie: authCookies[1] });
    assert.equal(disabled.response.status, 401, 'disabled application account must lose access');
    await pool.query('UPDATE users SET active = true WHERE identity_provider_subject = $1', [disableUser.rows[0].id]);

    const stale = await pool.query('SELECT id FROM "session" WHERE "userId" = $1 LIMIT 1', [authUserIds[1]]);
    assert.equal(stale.rowCount, 0, 'disabled-account access should revoke existing auth sessions');

    const fresh = await request('/api/auth/sign-in/email', {
      method: 'POST', body: { email: emails[1], password: passwords[1] },
    });
    assert.equal(fresh.response.status, 200, 'a valid password should sign in');
    const signout = await request('/api/auth/sign-out', { method: 'POST', cookie: fresh.sessionCookie });
    assert.equal(signout.response.status, 200, 'sign-out should complete');
    const afterSignout = await request('/api/v1/me', { cookie: fresh.sessionCookie });
    assert.equal(afterSignout.response.status, 401, 'sign-out must revoke the session');

    const newCode = await invite(`m1a-${suffix}-no-invite@example.test`);
    const wrongEmail = await request('/api/auth/sign-up/email', {
      method: 'POST', body: { name: 'Wrong recipient', email: `m1a-${suffix}-other@example.test`, password: passwords[0], inviteCode: newCode },
    });
    assert.ok(wrongEmail.response.status >= 400, 'invitation must be email-bound');

    let limited = false;
    for (let i = 0; i < 7; i += 1) {
      const attempt = await request('/api/auth/sign-in/email', {
        method: 'POST', body: { email: `missing-${suffix}@example.test`, password: 'incorrect-password-92!' },
      });
      if (attempt.response.status === 429) limited = true;
    }
    assert.ok(limited, 'repeated sign-in attempts must be rate limited');

    const componentSource = await readSource(join(root, '..', 'src', 'App.tsx'), 'utf8');
    assert.doesNotMatch(componentSource, /localStorage|sessionStorage/, 'browser code must not persist credentials or session tokens');
    const memberSources = componentSource + await readSource(join(root, '..', 'apps', 'api', 'src', 'auth.ts'), 'utf8') + await readSource(join(root, '..', 'apps', 'api', 'src', 'server.ts'), 'utf8');
    assert.doesNotMatch(memberSources, /openai|anthropic|model context|system prompt/i, 'member auth/profile path must not forward member credentials or profile data to a model');

    const failClosedPort = await freePort();
    const failClosedURL = `http://127.0.0.1:${failClosedPort}`;
    const failClosedEnv = { ...process.env, APP_PORT: String(failClosedPort), NODE_ENV: 'test' };
    delete failClosedEnv['DATABASE_URL'];
    delete failClosedEnv['BETTER_AUTH_SECRET'];
    delete failClosedEnv['BETTER_AUTH_URL'];
    const failClosedChild = spawn(process.execPath, [serverFile], { cwd: join(root, '..'), env: failClosedEnv, stdio: 'ignore' });
    try {
      for (let i = 0; i < 50; i += 1) {
        try {
          const response = await fetch(`${failClosedURL}/health`);
          if (response.ok) break;
        } catch { /* Wait for startup. */ }
        await delay(100);
      }
      const closedHealth = await (await fetch(`${failClosedURL}/health`)).json();
      assert.equal(closedHealth.memberAuthAvailable, false, 'missing auth config must remain unavailable');
      const closedProfile = await fetch(`${failClosedURL}/api/v1/me`);
      assert.equal(closedProfile.status, 503, 'protected API must fail closed when auth config is missing');
      const closedAuth = await fetch(`${failClosedURL}/api/auth/sign-in/email`, { method: 'POST' });
      assert.equal(closedAuth.status, 503, 'sign-in must fail closed when auth config is missing');
    } finally {
      failClosedChild.kill('SIGTERM');
      await new Promise((resolve) => failClosedChild.once('exit', resolve));
    }

    const productionPort = await freePort();
    const productionURL = `http://127.0.0.1:${productionPort}`;
    const productionChild = spawn(process.execPath, [serverFile], {
      cwd: join(root, '..'),
      env: { ...process.env, APP_PORT: String(productionPort), NODE_ENV: 'production', BETTER_AUTH_URL: 'http://localhost:4300', WEB_APP_ORIGIN: origins },
      stdio: 'ignore',
    });
    try {
      for (let i = 0; i < 50; i += 1) {
        try {
          const response = await fetch(`${productionURL}/health`);
          if (response.ok) break;
        } catch { /* Wait for startup. */ }
        await delay(100);
      }
      const productionHealth = await (await fetch(`${productionURL}/health`)).json();
      assert.equal(productionHealth.memberAuthAvailable, false, 'production auth must reject non-HTTPS origins');
    } finally {
      productionChild.kill('SIGTERM');
      await new Promise((resolve) => productionChild.once('exit', resolve));
    }

    console.log('M1-A member auth acceptance passed: invite-only enrollment, cookie session, owner identity isolation, unauthenticated denial, CSRF origin check, idle and absolute expiry, account disable revocation, sign-out, invite binding, rate limiting, missing-config and insecure-production fail-closed behavior, and credential/token storage boundaries.');
  } finally {
    if (child && child.exitCode === null) {
      child.kill('SIGTERM');
      await new Promise((resolve) => child.once('exit', resolve));
    }
    const authUsers = await pool.query('SELECT id FROM "user" WHERE email = ANY($1)', [emails]);
    const authIds = authUsers.rows.map((row) => row.id);
    if (authIds.length) {
      // The application identity may own immutable audit history; preserve it after auth fixture teardown.
      await pool.query('DELETE FROM "user" WHERE id = ANY($1)', [authIds]);
    }
    if (tokens.length) await pool.query('DELETE FROM member_invites WHERE token_digest = ANY($1)', [tokens]);
    await pool.query('DELETE FROM "rateLimit" WHERE key LIKE $1', ['127.0.0.1|/%']);
    for (const row of savedRateLimits.rows) {
      await pool.query(
        `INSERT INTO "rateLimit" (id, key, count, "lastRequest") VALUES ($1, $2, $3, $4)
         ON CONFLICT (key) DO UPDATE SET id = EXCLUDED.id, count = EXCLUDED.count, "lastRequest" = EXCLUDED."lastRequest"`,
        [row.id, row.key, row.count, row.lastRequest],
      );
    }
    await pool.end();
  }
}

await main();
