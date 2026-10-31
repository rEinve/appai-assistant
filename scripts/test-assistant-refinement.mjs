import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import { Pool } from 'pg';

if (!process.env.DATABASE_URL || !process.env.BETTER_AUTH_SECRET || !(process.env.GOOGLE_KEY || process.env.GEMINI_API_KEY)) {
  throw new Error('Configure local database, member authentication, and a Gemini key before running live assistant acceptance.');
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
const origin = 'http://localhost:4200';
const email = `assistant-${randomUUID().slice(0, 12)}@example.test`;
const password = 'Assistant-test-Password-49!';
const prompt = 'Find a laptop for no more than USD 250 by 15 November 2030 at 17:00.';
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

async function request(path, { method = 'GET', body, cookie, headers = {} } = {}) {
  const response = await fetch(`${baseURL}${path}`, {
    method,
    headers: { origin, ...(body ? { 'content-type': 'application/json' } : {}), ...(cookie ? { cookie } : {}), ...headers },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(30_000),
  });
  const data = await response.json();
  const cookieHeader = (response.headers.getSetCookie?.() ?? []).map((value) => value.split(';', 1)[0]).find((value) => /session_token=/.test(value));
  return { status: response.status, data, cookie: cookieHeader };
}

function expectStatus(result, status, label) {
  assert.equal(result.status, status, `${label}: HTTP ${result.status}, code ${result.data?.code ?? 'none'}`);
}

async function cleanup() {
  if (ownerId) {
    await pool.query('DELETE FROM audit_events WHERE owner_id = $1', [ownerId]);
    await pool.query('DELETE FROM api_idempotency WHERE actor_id = $1', [ownerId]);
    await pool.query('DELETE FROM procurement_instructions WHERE owner_id = $1', [ownerId]);
    await pool.query('DELETE FROM user_settings WHERE owner_id = $1', [ownerId]);
    await pool.query('DELETE FROM users WHERE id = $1', [ownerId]);
  }
  if (authUserId) await pool.query('DELETE FROM "user" WHERE id = $1', [authUserId]);
  await pool.query('DELETE FROM member_invites WHERE email = $1', [email]);
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

  const inviteCode = randomUUID() + randomUUID();
  await pool.query('INSERT INTO member_invites (email, token_digest, expires_at) VALUES ($1, $2, now() + interval \'1 hour\')',
    [email, createHash('sha256').update(inviteCode).digest('hex')]);
  const signUp = await request('/api/auth/sign-up/email', { method: 'POST', body: { name: 'Assistant Test', email, password, inviteCode } });
  expectStatus(signUp, 200, 'invite-only enrollment');
  assert.ok(signUp.cookie, 'enrollment must create a member session');
  const cookie = signUp.cookie;
  const profile = await request('/api/v1/me', { cookie });
  expectStatus(profile, 200, 'member profile');
  ownerId = profile.data.member.id;
  authUserId = (await pool.query('SELECT id FROM "user" WHERE email = $1', [email])).rows[0].id;

  const settings = await request('/api/v1/settings', {
    method: 'POST', cookie, headers: { 'Idempotency-Key': randomUUID() },
    body: { timezone: 'UTC', currency: 'USD', currencyScale: 2 },
  });
  expectStatus(settings, 201, 'account settings');

  const explicit = await request('/api/v1/assistant/refine', { method: 'POST', cookie, body: { description: prompt } });
  expectStatus(explicit, 200, 'explicit amount and deadline extraction');
  const proposal = explicit.data.proposal;
  assert.equal(Number(proposal.maximumTotal), 250, 'maximum must match the stated amount');
  assert.equal(proposal.validUntilLocal, '2030-11-15T17:00', 'deadline must use the account local timezone');
  assert.ok(proposal.summary?.trim(), 'proposal must include a summary');

  const saved = await request('/api/v1/instructions', {
    method: 'POST', cookie, headers: { 'Idempotency-Key': randomUUID() },
    body: { description: prompt, memberCategory: 'PERSONAL', maximumTotal: proposal.maximumTotal,
      validFromLocal: proposal.validFromLocal ?? '', validUntilLocal: proposal.validUntilLocal ?? '' },
  });
  expectStatus(saved, 201, 'member-confirmed draft save');
  const stored = await pool.query(
    'SELECT prompt_text, max_total_minor::text AS maximum, valid_until, state, structured_constraints FROM procurement_instructions WHERE id = $1 AND owner_id = $2',
    [saved.data.instruction.id, ownerId],
  );
  assert.equal(stored.rowCount, 1);
  assert.equal(stored.rows[0].prompt_text, prompt, 'original wording must be preserved');
  assert.equal(stored.rows[0].maximum, '25000', 'accepted amount must be stored in exact minor units');
  assert.equal(stored.rows[0].valid_until.toISOString(), '2030-11-15T17:00:00.000Z');
  assert.equal(stored.rows[0].state, 'DRAFT');
  assert.equal(stored.rows[0].structured_constraints.description, prompt);

  const missing = await request('/api/v1/assistant/refine', { method: 'POST', cookie, body: { description: 'Find me a laptop.' } });
  expectStatus(missing, 200, 'missing constraints extraction');
  assert.equal(missing.data.proposal.maximumTotal, null, 'missing amount must remain null');
  assert.equal(missing.data.proposal.validUntilLocal, null, 'missing deadline must remain null');
  assert.ok(missing.data.proposal.questions.length > 0, 'assistant should ask for consequential missing details');

  const clarified = await request('/api/v1/assistant/refine', {
    method: 'POST', cookie,
    body: { description: 'Find me a laptop.', clarifications: [{ questions: missing.data.proposal.questions, reply: 'Maximum USD 800; I need it by 15 November 2030 at 17:00.' }] },
  });
  expectStatus(clarified, 200, 'clarification extraction');
  assert.equal(Number(clarified.data.proposal.maximumTotal), 800);
  assert.equal(clarified.data.proposal.validUntilLocal, '2030-11-15T17:00');

  console.log('PASS: explicit extraction, confirmed draft persistence, missing constraints, and clarification extraction.');
} finally {
  if (child && child.exitCode === null) {
    child.kill('SIGTERM');
    await new Promise((resolve) => child.once('exit', resolve));
  }
  try { await cleanup(); } finally { await pool.end(); }
}
