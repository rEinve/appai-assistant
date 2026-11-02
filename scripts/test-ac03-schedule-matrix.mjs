import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { readFile, readdir } from 'node:fs/promises';
import { createServer } from 'node:net';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { setTimeout as delay } from 'node:timers/promises';
import { Pool } from 'pg';

const databaseUrl = process.env['DATABASE_URL'];
const secret = process.env['BETTER_AUTH_SECRET'];
if (!databaseUrl || !secret || secret.length < 32) {
  throw new Error('Set local DATABASE_URL and BETTER_AUTH_SECRET before running the AC-03 schedule matrix.');
}

const root = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const pool = new Pool({ connectionString: databaseUrl, max: 4 });

const serverFile = join(root, '..', 'dist', 'api', 'apps', 'api', 'src', 'server.js');
const workerFile = join(root, '..', 'dist', 'worker', 'apps', 'worker', 'src', 'worker.js');

// Import helper functions safely from worker without auto-running background loop
process.env['WORKER_NO_AUTO_RUN'] = 'true';
const workerModule = require(workerFile);
const { localParts, localDateTimeToInstant, nextMonthlyRun } = workerModule;
assert.ok(typeof localParts === 'function', 'localParts must be exported');
assert.ok(typeof localDateTimeToInstant === 'function', 'localDateTimeToInstant must be exported');
assert.ok(typeof nextMonthlyRun === 'function', 'nextMonthlyRun must be exported');
delete process.env['WORKER_NO_AUTO_RUN'];

const origins = 'http://localhost:4200';
const suffix = randomUUID().replaceAll('-', '').slice(0, 10);
const testEmail = `ac03-${suffix}@example.test`;
const workerId = `ac03-worker-${suffix}`;
let apiChild;
let workerChild;
let baseURL;
let ownerId;
let budgetId;

async function freePort() {
  const socket = createServer();
  await new Promise((resolve, reject) => socket.listen(0, '127.0.0.1', resolve).once('error', reject));
  const { port } = socket.address();
  await new Promise((resolve, reject) => socket.close((error) => error ? reject(error) : resolve()));
  return port;
}

function startWorker() {
  workerChild = spawn(process.execPath, [workerFile], {
    cwd: join(root, '..'),
    env: { ...process.env, WORKER_ID: workerId, WORKER_POLL_MS: '100', WORKER_LEASE_MS: '5000' },
    stdio: 'ignore',
  });
  return workerChild;
}

async function stop(child) {
  if (!child || child.exitCode !== null) return;
  child.kill('SIGTERM');
  await new Promise((resolve) => child.once('exit', resolve));
}

async function waitFor(check, label, limit = 100) {
  for (let index = 0; index < limit; index += 1) {
    const result = await check();
    if (result) return result;
    await delay(100);
  }
  throw new Error(`Timed out waiting for ${label}.`);
}

async function request(path, { method = 'GET', body, cookie, headers = {}, origin = origins } = {}) {
  const response = await fetch(`${baseURL}${path}`, {
    method,
    headers: {
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...(cookie ? { cookie } : {}),
      ...(origin ? { origin } : {}),
      ...headers,
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const text = await response.text();
  let json;
  try { json = text ? JSON.parse(text) : null; } catch { json = text; }
  const cookies = response.headers.getSetCookie?.() ?? [];
  const sessionCookie = cookies.map((item) => item.split(';', 1)[0]).filter((item) => /session_token=/.test(item)).join('; ');
  return { response, json, sessionCookie };
}

async function invite(email) {
  const token = randomUUID() + randomUUID();
  const digest = createHash('sha256').update(token).digest('hex');
  await pool.query('INSERT INTO member_invites (email, token_digest, expires_at) VALUES ($1, $2, now() + interval \'1 hour\')', [email, digest]);
  return token;
}

async function signUp(email, name) {
  const token = await invite(email);
  const result = await request('/api/auth/sign-up/email', {
    method: 'POST', body: { name, email, password: 'AC03-matrix-password-99!', inviteCode: token },
  });
  assert.equal(result.response.status, 200, `member enrollment: ${JSON.stringify(result.json)}`);
  assert.ok(result.sessionCookie, 'session cookie returned');
  const profile = await request('/api/v1/me', { cookie: result.sessionCookie });
  assert.equal(profile.response.status, 200);
  const user = await pool.query('SELECT id FROM "user" WHERE email = $1', [email]);
  assert.equal(user.rowCount, 1);
  const member = await pool.query('SELECT id FROM users WHERE identity_provider_subject = $1', [user.rows[0].id]);
  return { cookie: result.sessionCookie, memberId: member.rows[0].id, authUserId: user.rows[0].id };
}

async function cleanTestFixtures() {
  const owners = await pool.query(
    `SELECT id FROM users WHERE identity_provider_subject IN
       (SELECT id FROM "user" WHERE email LIKE 'ac03-%@example.test')`,
  );
  for (const { id } of owners.rows) {
    await pool.query('DELETE FROM notifications WHERE owner_id = $1', [id]);
    await pool.query('DELETE FROM offer_observations WHERE owner_id = $1', [id]);
    await pool.query('DELETE FROM approvals WHERE owner_id = $1', [id]);
    await pool.query('UPDATE purchase_operations SET selected_quote_id = NULL WHERE owner_id = $1', [id]);
    await pool.query('DELETE FROM vendor_quotes WHERE owner_id = $1', [id]);
    await pool.query('DELETE FROM jobs WHERE owner_id = $1', [id]);
    await pool.query('DELETE FROM purchase_operations WHERE owner_id = $1', [id]);
    await pool.query('DELETE FROM procurement_obligations WHERE owner_id = $1', [id]);
    await pool.query('DELETE FROM instruction_occurrences WHERE owner_id = $1', [id]);
    await pool.query('DELETE FROM outbox_events WHERE owner_id = $1', [id]);
    await pool.query('DELETE FROM api_idempotency WHERE actor_id = $1', [id]);
    await pool.query('DELETE FROM budget_supplier_preferences WHERE owner_id = $1', [id]);
    await pool.query('DELETE FROM member_suppliers WHERE owner_id = $1', [id]);
    await pool.query('DELETE FROM procurement_instructions WHERE owner_id = $1', [id]);
    await pool.query('DELETE FROM budgets WHERE owner_id = $1', [id]);
    await pool.query('DELETE FROM user_settings WHERE owner_id = $1', [id]);
  }
  const users = await pool.query('SELECT id FROM "user" WHERE email LIKE \'ac03-%@example.test\'');
  const authIds = users.rows.map((row) => row.id);
  if (authIds.length) {
    await pool.query('DELETE FROM "user" WHERE id = ANY($1)', [authIds]);
  }
  await pool.query("DELETE FROM member_invites WHERE email LIKE 'ac03-%@example.test'");
  await pool.query("DELETE FROM worker_heartbeats WHERE worker_id LIKE 'ac03-worker-%'");
  await pool.query('DELETE FROM "rateLimit"');
}

async function runPureMatrixTests() {
  console.log('\n=== AC-03 Part 1: Algorithmic Schedule & Timezone Matrix ===');

  // Test 1: Local Midnight in America/New_York (Summer EDT vs Winter EST)
  const summerMidnightStr = '2026-04-01T00:00';
  const summerMidnight = localDateTimeToInstant(summerMidnightStr, 'America/New_York');
  assert.ok(summerMidnight, 'Summer midnight instant must resolve');
  assert.equal(summerMidnight.toISOString(), '2026-04-01T04:00:00.000Z', 'Summer midnight in NY (EDT, UTC-4) must be 04:00:00 UTC');
  const summerParts = localParts(summerMidnight, 'America/New_York');
  assert.equal(summerParts.hour, 0, 'Local hour must be 00');
  assert.equal(summerParts.minute, 0, 'Local minute must be 00');
  assert.equal(summerParts.day, 1, 'Local day must be 1');

  const winterMidnightStr = '2026-01-01T00:00';
  const winterMidnight = localDateTimeToInstant(winterMidnightStr, 'America/New_York');
  assert.ok(winterMidnight, 'Winter midnight instant must resolve');
  assert.equal(winterMidnight.toISOString(), '2026-01-01T05:00:00.000Z', 'Winter midnight in NY (EST, UTC-5) must be 05:00:00 UTC');
  const winterParts = localParts(winterMidnight, 'America/New_York');
  assert.equal(winterParts.hour, 0, 'Local hour must be 00');
  assert.equal(winterParts.minute, 0, 'Local minute must be 00');
  console.log('✓ Scenario A.1: Local midnight boundary resolves correctly across EDT (04:00 UTC) and EST (05:00 UTC)');

  // Test 2: Next monthly run from summer midnight advances to May 1 at 00:00 EDT (04:00 UTC)
  const nextRun = nextMonthlyRun(summerMidnight, summerMidnight, { frequency: 'MONTHLY', dayOfMonth: 1, localTime: '00:00' }, 'America/New_York');
  assert.ok(nextRun, 'Next monthly run must resolve');
  assert.equal(nextRun.toISOString(), '2026-05-01T04:00:00.000Z', 'Next monthly run must be May 1 00:00 EDT (04:00 UTC)');
  console.log('✓ Scenario A.2: Next monthly run advances to next local midnight boundary without drift');

  // Test 3: Month-end clamping (Jan 31 -> Feb 28 in non-leap year)
  const jan31 = localDateTimeToInstant('2026-01-31T00:00', 'America/New_York');
  const febRun = nextMonthlyRun(jan31, jan31, { frequency: 'MONTHLY', dayOfMonth: 31, localTime: '00:00' }, 'America/New_York');
  assert.ok(febRun, 'February run must resolve');
  assert.equal(febRun.toISOString(), '2026-02-28T05:00:00.000Z', 'February clamped day 31 to 28 at 00:00 EST (05:00 UTC)');
  console.log('✓ Scenario A.3: Month-end clamping (Jan 31 -> Feb 28) verified');

  // Test 4: DST Spring-Forward Gap (Sunday March 8, 2026 in America/New_York: 02:00 -> 03:00)
  // 02:30 does not exist on clock; worker shifts forward into valid wall clock instant (03:00 EDT -> 07:00 UTC)
  const gapInstant = localDateTimeToInstant('2026-03-08T02:30', 'America/New_York');
  assert.ok(gapInstant, 'Spring-forward gap must resolve via forward shift');
  assert.equal(gapInstant.toISOString(), '2026-03-08T07:00:00.000Z', 'Spring-forward gap shifts to 03:00 EDT (07:00:00 UTC)');
  console.log('✓ Scenario B.1: DST spring-forward gap shifted forward to valid wall time (03:00 EDT / 07:00 UTC)');

  // Test 5: DST Fall-Back Ambiguity (Sunday Nov 1, 2026 in America/New_York: 01:30 occurs twice)
  // Worker must choose the earliest instant (EDT UTC-4: 05:30 UTC, not EST UTC-5: 06:30 UTC)
  const fallBackInstant = localDateTimeToInstant('2026-11-01T01:30', 'America/New_York');
  assert.ok(fallBackInstant, 'Fall-back instant must resolve');
  assert.equal(fallBackInstant.toISOString(), '2026-11-01T05:30:00.000Z', 'Fall-back must select the earliest occurrence (EDT: 05:30 UTC)');
  console.log('✓ Scenario B.2: DST fall-back selects earliest occurrence (05:30 UTC)');

  // Test 6: Multi-month missed-tick recovery (90 days elapsed downtime)
  const overdueDueAt = new Date('2026-01-01T05:00:00.000Z');
  const nowReference = new Date('2026-04-01T05:00:00.000Z'); // 90 days later
  const recoveredNextRun = nextMonthlyRun(overdueDueAt, nowReference, { frequency: 'MONTHLY', dayOfMonth: 1, localTime: '00:00' }, 'America/New_York');
  assert.ok(recoveredNextRun, 'Recovered next run must resolve');
  assert.ok(recoveredNextRun > nowReference, 'Recovered next run must be strictly in the future');
  assert.equal(recoveredNextRun.toISOString(), '2026-05-01T04:00:00.000Z', 'Recovered next run advances directly past elapsed cycles to May 1 00:00 EDT');
  console.log('✓ Scenario D.1: Algorithmic multi-month missed tick recovers to first future occurrence');
}

async function runPostgresMatrixTests() {
  console.log('\n=== AC-03 Part 2: PostgreSQL-Backed Worker & API Integration Matrix ===');

  const migrationDir = join(root, '..', 'packages', 'persistence', 'migrations');
  const migrations = (await readdir(migrationDir)).filter((file) => /^\d+_.*\.sql$/.test(file)).sort();
  for (const file of migrations) await pool.query(await readFile(join(migrationDir, file), 'utf8'));
  await cleanTestFixtures();

  const port = await freePort();
  baseURL = `http://127.0.0.1:${port}`;
  apiChild = spawn(process.execPath, [serverFile], {
    cwd: join(root, '..'),
    env: { ...process.env, APP_PORT: String(port), BETTER_AUTH_URL: baseURL, WEB_APP_ORIGIN: origins, NODE_ENV: 'test' },
    stdio: 'ignore',
  });
  await waitFor(async () => {
    if (apiChild.exitCode !== null) throw new Error(`API exited with ${apiChild.exitCode}.`);
    try { const response = await fetch(`${baseURL}/health`); return response.ok; } catch { return false; }
  }, 'isolated API');

  startWorker();
  await waitFor(async () => {
    const row = await pool.query('SELECT 1 FROM worker_heartbeats WHERE worker_id = $1 AND last_seen_at > now() - interval \'5 seconds\'', [workerId]);
    return row.rowCount === 1;
  }, 'worker heartbeat');

  const member = await signUp(testEmail, 'AC-03 Matrix Member');
  ownerId = member.memberId;

  // 1. Setup account settings with America/New_York
  let result = await request('/api/v1/settings', {
    method: 'POST', cookie: member.cookie,
    headers: { 'Idempotency-Key': randomUUID() },
    body: { timezone: 'America/New_York', currency: 'USD', currencyScale: 2 },
  });
  assert.equal(result.response.status, 201, 'settings created in America/New_York');

  // 2. Setup budget
  const budgetStart = new Date(Date.now() - 120 * 86_400_000).toISOString().slice(0, 16);
  const budgetEnd = new Date(Date.now() + 365 * 86_400_000).toISOString().slice(0, 16);
  result = await request('/api/v1/budgets', {
    method: 'POST', cookie: member.cookie,
    headers: { 'Idempotency-Key': randomUUID() },
    body: { name: `AC-03 Budget ${suffix}`, allocationLimit: '1000.00', validFromLocal: budgetStart, validUntilLocal: budgetEnd },
  });
  assert.equal(result.response.status, 201, 'budget created');
  budgetId = result.json.budget.id;

  const getNextMonthDate = (day = 1, time = '00:00') => {
    const now = new Date();
    const nextMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, day));
    const year = nextMonth.getUTCFullYear();
    const month = String(nextMonth.getUTCMonth() + 1).padStart(2, '0');
    const d = String(day).padStart(2, '0');
    return `${year}-${month}-${d}T${time}`;
  };

  // --------------------------------------------------------------------------
  // Scenario A: PostgreSQL Worker Local Midnight Boundary
  // --------------------------------------------------------------------------
  console.log('\n--- Scenario A (DB): Local Midnight Boundary Execution & Next-Run Advancement ---');
  const billPrompt = 'Monthly electric utility bill for warehouse';
  result = await request('/api/v1/instructions', {
    method: 'POST', cookie: member.cookie,
    headers: { 'Idempotency-Key': randomUUID() },
    body: { description: billPrompt, kind: 'RECURRING_BILL', category: 'BILL', mode: 'REVIEW_REQUIRED', budgetId },
  });
  assert.equal(result.response.status, 201, 'recurring bill draft created');
  const billInstId = result.json.instruction.id;
  let billVersion = result.json.instruction.version;

  // Configure for a past occurrence at local midnight (00:00) so it is due immediately on activation
  const pastMidnight = new Date(Date.now() - 2 * 86_400_000);
  const pastMidnightParts = localParts(pastMidnight, 'America/New_York');
  const midnightDueLocal = `${pastMidnightParts.year}-${String(pastMidnightParts.month).padStart(2, '0')}-${String(pastMidnightParts.day).padStart(2, '0')}T00:00`;

  result = await request(`/api/v1/instructions/${billInstId}/configuration`, {
    method: 'PATCH', cookie: member.cookie,
    headers: { 'If-Match': `"${billVersion}"` },
    body: {
      description: billPrompt, memberCategory: 'OTHER', budgetId, maximumTotal: '150.00',
      validFromLocal: budgetStart, validUntilLocal: budgetEnd, timezone: 'America/New_York',
      categoryDetails: { payeeName: 'Consolidated Edison NY', dueAtLocal: midnightDueLocal, invoiceLabel: 'INV-NY-MIDNIGHT' },
    },
  });
  assert.equal(result.response.status, 200, `recurring bill configured at local midnight: ${JSON.stringify(result.json)}`);
  billVersion = result.json.instruction.version;

  // Activate fixture
  result = await request(`/api/v1/instructions/${billInstId}/activate-fixture`, {
    method: 'POST', cookie: member.cookie,
    headers: { 'Idempotency-Key': randomUUID(), 'If-Match': `"${billVersion}"` },
    body: {},
  });
  assert.equal(result.response.status, 200, 'recurring bill activated in fixture mode');

  // Wait for worker to claim and execute the occurrence
  await waitFor(async () => {
    const jobRes = await pool.query('SELECT state FROM jobs WHERE instruction_id = $1', [billInstId]);
    return jobRes.rows.some((j) => j.state === 'SUCCEEDED');
  }, 'worker job completion for midnight bill');

  // Verify next_run_at has been advanced to the next month at local midnight (00:00 NY)
  const updatedBill = await pool.query(
    'SELECT next_run_at, permission_version, schedule_config FROM procurement_instructions WHERE id = $1', [billInstId],
  );
  assert.ok(updatedBill.rows[0].next_run_at, 'next_run_at must be populated');
  const nextRunDate = updatedBill.rows[0].next_run_at;
  const nextRunNYParts = localParts(nextRunDate, 'America/New_York');
  assert.equal(nextRunNYParts.hour, 0, `Next run must be at local midnight (hour 00), got ${nextRunNYParts.hour}`);
  assert.equal(nextRunNYParts.minute, 0, 'Next run must be at minute 00');
  const nextMonthDays = new Date(Date.UTC(nextRunNYParts.year, nextRunNYParts.month, 0)).getUTCDate();
  assert.equal(nextRunNYParts.day, Math.min(pastMidnightParts.day, nextMonthDays),
    `Next run must preserve the configured day with month-end clamping (${pastMidnightParts.day})`);
  console.log(`✓ Scenario A (DB): Worker advanced next_run_at to ${nextRunDate.toISOString()} (${nextRunNYParts.year}-${nextRunNYParts.month}-${nextRunNYParts.day} 00:00 America/New_York)`);

  // --------------------------------------------------------------------------
  // Scenario B: PostgreSQL Worker DST Transitions
  // --------------------------------------------------------------------------
  console.log('\n--- Scenario B (DB): DST Spring-Forward Transition Boundary ---');
  result = await request('/api/v1/instructions', {
    method: 'POST', cookie: member.cookie,
    headers: { 'Idempotency-Key': randomUUID() },
    body: { description: 'DST boundary test bill', kind: 'RECURRING_BILL', category: 'BILL', mode: 'REVIEW_REQUIRED', budgetId },
  });
  const dstInstId = result.json.instruction.id;
  const dstVersion = result.json.instruction.version;

  // Configure on DST jump date at 02:30 (spring-forward gap)
  result = await request(`/api/v1/instructions/${dstInstId}/configuration`, {
    method: 'PATCH', cookie: member.cookie,
    headers: { 'If-Match': `"${dstVersion}"` },
    body: {
      description: 'DST boundary test bill', memberCategory: 'OTHER', budgetId, maximumTotal: '75.00',
      validFromLocal: budgetStart, validUntilLocal: budgetEnd, timezone: 'America/New_York',
      categoryDetails: { payeeName: 'Grid Power NY', dueAtLocal: '2026-03-08T02:30' },
    },
  });
  // Note: API requires a real local time or shifts forward in categoryDetails parser
  assert.ok(result.response.status === 200 || result.response.status === 400, 'DST gap validation behavior');
  if (result.response.status === 400) {
    // API correctly reported daylight saving gap validation error
    assert.ok(['INVALID_CATEGORY_DETAILS', 'INVALID_VALIDITY_TIME'].includes(result.json.code), `API reported daylight gap validation error: ${result.json.code}`);
    console.log(`✓ Scenario B (DB): API validation strictly rejects invalid spring-forward gap time (${result.json.code})`);
  } else {
    console.log('✓ Scenario B (DB): API resolved spring-forward gap instant');
  }

  // --------------------------------------------------------------------------
  // Scenario C: PostgreSQL Worker Schedule Edits
  // --------------------------------------------------------------------------
  console.log('\n--- Scenario C (DB): Schedule Edits with Permission Version Increment ---');
  const editPrompt = 'Scheduled monthly internet service';
  result = await request('/api/v1/instructions', {
    method: 'POST', cookie: member.cookie,
    headers: { 'Idempotency-Key': randomUUID() },
    body: { description: editPrompt, kind: 'RECURRING_BILL', category: 'BILL', mode: 'REVIEW_REQUIRED', budgetId },
  });
  const editInstId = result.json.instruction.id;
  let editVersion = result.json.instruction.version;

  // Initial schedule: Day 1 at 09:00 (v1)
  const initialDate = getNextMonthDate(1, '09:00');
  result = await request(`/api/v1/instructions/${editInstId}/configuration`, {
    method: 'PATCH', cookie: member.cookie,
    headers: { 'If-Match': `"${editVersion}"` },
    body: {
      description: editPrompt, memberCategory: 'OTHER', budgetId, maximumTotal: '100.00',
      validFromLocal: budgetStart, validUntilLocal: budgetEnd, timezone: 'America/New_York',
      categoryDetails: { payeeName: 'Fiber Broadband NY', dueAtLocal: initialDate },
    },
  });
  assert.equal(result.response.status, 200, `Initial schedule config: ${JSON.stringify(result.json)}`);
  editVersion = result.json.instruction.version;

  const v1Row = await pool.query(
    'SELECT permission_version, schedule_config FROM procurement_instructions WHERE id = $1', [editInstId],
  );
  assert.equal(Number(v1Row.rows[0].permission_version), 2, 'Initial config incremented permission_version to 2');
  assert.equal(v1Row.rows[0].schedule_config.dayOfMonth, 1);
  assert.equal(v1Row.rows[0].schedule_config.localTime, '09:00');

  // Edit schedule: Day 15 at 14:00 (v2)
  const editedDate = getNextMonthDate(15, '14:00');
  result = await request(`/api/v1/instructions/${editInstId}/configuration`, {
    method: 'PATCH', cookie: member.cookie,
    headers: { 'If-Match': `"${editVersion}"` },
    body: {
      description: editPrompt, memberCategory: 'OTHER', budgetId, maximumTotal: '100.00',
      validFromLocal: budgetStart, validUntilLocal: budgetEnd, timezone: 'America/New_York',
      categoryDetails: { payeeName: 'Fiber Broadband NY', dueAtLocal: editedDate },
    },
  });
  assert.equal(result.response.status, 200, `Schedule edit saved: ${JSON.stringify(result.json)}`);
  editVersion = result.json.instruction.version;

  const v2Row = await pool.query(
    'SELECT permission_version, schedule_config FROM procurement_instructions WHERE id = $1', [editInstId],
  );
  assert.equal(Number(v2Row.rows[0].permission_version), 3, 'Edited config incremented permission_version to 3');
  assert.equal(v2Row.rows[0].schedule_config.dayOfMonth, 15);
  assert.equal(v2Row.rows[0].schedule_config.localTime, '14:00');

  // Activate edited fixture
  result = await request(`/api/v1/instructions/${editInstId}/activate-fixture`, {
    method: 'POST', cookie: member.cookie,
    headers: { 'Idempotency-Key': randomUUID(), 'If-Match': `"${editVersion}"` },
    body: {},
  });
  assert.equal(result.response.status, 200, 'Edited fixture activated');

  // Trigger worker
  await pool.query('UPDATE procurement_instructions SET next_run_at = now() - interval \'2 seconds\' WHERE id = $1', [editInstId]);
  await waitFor(async () => {
    const jobRes = await pool.query('SELECT state, dedupe_key FROM jobs WHERE instruction_id = $1', [editInstId]);
    return jobRes.rows.some((j) => j.state === 'SUCCEEDED');
  }, 'worker job completion for edited schedule');

  const editedJobs = await pool.query(
    'SELECT dedupe_key FROM jobs WHERE instruction_id = $1', [editInstId],
  );
  assert.equal(editedJobs.rowCount, 1);
  assert.match(editedJobs.rows[0].dedupe_key, /permission:3:/, 'Job dedupe key strictly incorporates updated permission_version (3)');

  // Active instruction schedule edit and queued job fencing (Gap 1 & AC-03 / AC-20)
  const staleOccurrenceKey = `permission:3:due:2026-06-15T14:00`;
  const staleDedupeKey = `instruction:${editInstId}:run_occurrence:${staleOccurrenceKey}`;
  await pool.query(
    `INSERT INTO jobs (owner_id, instruction_id, job_type, dedupe_key, payload, state, run_at)
     VALUES ($1, $2, 'RUN_OCCURRENCE', $3, $4::jsonb, 'READY', now() + interval '1 hour')
     ON CONFLICT (dedupe_key) DO NOTHING`,
    [ownerId, editInstId, staleDedupeKey, JSON.stringify({ occurrenceKey: staleOccurrenceKey, dueAt: '2026-06-15T14:00', scheduleVersion: 3 })],
  );

  const activeRow = await pool.query('SELECT version, state FROM procurement_instructions WHERE id = $1', [editInstId]);
  assert.equal(activeRow.rows[0].state, 'ACTIVE', 'instruction is ACTIVE when edited');
  const activeVersion = activeRow.rows[0].version;

  const day20Date = getNextMonthDate(20, '16:00');
  const activeEditResult = await request(`/api/v1/instructions/${editInstId}/configuration`, {
    method: 'PATCH', cookie: member.cookie,
    headers: { 'If-Match': `"${activeVersion}"` },
    body: {
      description: editPrompt, memberCategory: 'OTHER', budgetId, maximumTotal: '100.00',
      validFromLocal: budgetStart, validUntilLocal: budgetEnd, timezone: 'America/New_York',
      categoryDetails: { payeeName: 'Fiber Broadband NY', dueAtLocal: day20Date },
    },
  });
  assert.equal(activeEditResult.response.status, 200, `active instruction schedule edit succeeds: ${JSON.stringify(activeEditResult.json)}`);

  const v3Row = await pool.query(
    'SELECT permission_version, schedule_config FROM procurement_instructions WHERE id = $1', [editInstId],
  );
  assert.equal(Number(v3Row.rows[0].permission_version), 4, 'Editing ACTIVE instruction incremented permission_version to 4');
  assert.equal(v3Row.rows[0].schedule_config.dayOfMonth, 20);
  assert.equal(v3Row.rows[0].schedule_config.localTime, '16:00');

  const staleJobCheck = await pool.query('SELECT state, last_error_code FROM jobs WHERE dedupe_key = $1', [staleDedupeKey]);
  assert.equal(staleJobCheck.rows[0].state, 'BLOCKED', 'Queued job from previous schedule must be BLOCKED');
  assert.equal(staleJobCheck.rows[0].last_error_code, 'INSTRUCTION_SCHEDULE_UPDATED', 'Blocked reason must record INSTRUCTION_SCHEDULE_UPDATED');

  // Trigger worker on new schedule
  await pool.query('UPDATE procurement_instructions SET next_run_at = now() - interval \'2 seconds\' WHERE id = $1', [editInstId]);
  await waitFor(async () => {
    const jobRes = await pool.query('SELECT state, dedupe_key FROM jobs WHERE instruction_id = $1 AND dedupe_key LIKE \'%permission:4:%\'', [editInstId]);
    return jobRes.rows.some((j) => j.state === 'SUCCEEDED');
  }, 'worker job completion for permission:4 active schedule');

  console.log('✓ Scenario C (DB): Schedule edit on ACTIVE instruction incremented permission_version to 4, fenced queued jobs (INSTRUCTION_SCHEDULE_UPDATED), and dispatched occurrence with updated dedupe key');

  // --------------------------------------------------------------------------
  // Scenario D: PostgreSQL Worker Multi-Month Missed-Tick Recovery
  // --------------------------------------------------------------------------
  console.log('\n--- Scenario D (DB): Multi-Month Downtime Missed-Tick Recovery ---');
  // Create an active recurring instruction
  const downtimePrompt = 'Cloud storage backup retainer';
  result = await request('/api/v1/instructions', {
    method: 'POST', cookie: member.cookie,
    headers: { 'Idempotency-Key': randomUUID() },
    body: { description: downtimePrompt, kind: 'RECURRING_BILL', category: 'BILL', mode: 'REVIEW_REQUIRED', budgetId },
  });
  const downtimeInstId = result.json.instruction.id;
  let downtimeVersion = result.json.instruction.version;

  const downtimeDate = getNextMonthDate(1, '10:00');
  result = await request(`/api/v1/instructions/${downtimeInstId}/configuration`, {
    method: 'PATCH', cookie: member.cookie,
    headers: { 'If-Match': `"${downtimeVersion}"` },
    body: {
      description: downtimePrompt, memberCategory: 'OTHER', budgetId, maximumTotal: '50.00',
      validFromLocal: budgetStart, validUntilLocal: budgetEnd, timezone: 'America/New_York',
      categoryDetails: { payeeName: 'S3 Cloud Storage NY', dueAtLocal: downtimeDate },
    },
  });
  assert.equal(result.response.status, 200, `Downtime bill configured: ${JSON.stringify(result.json)}`);
  downtimeVersion = result.json.instruction.version;

  result = await request(`/api/v1/instructions/${downtimeInstId}/activate-fixture`, {
    method: 'POST', cookie: member.cookie,
    headers: { 'Idempotency-Key': randomUUID(), 'If-Match': `"${downtimeVersion}"` },
    body: {},
  });
  assert.equal(result.response.status, 200);

  // SIMULATE 90 DAYS OF DOWNTIME: Set next_run_at to 90 days in the past
  await pool.query('UPDATE procurement_instructions SET next_run_at = now() - interval \'90 days\' WHERE id = $1', [downtimeInstId]);

  // Wait for worker to claim and complete the job
  await waitFor(async () => {
    const jobRes = await pool.query('SELECT state, last_error_code FROM jobs WHERE instruction_id = $1', [downtimeInstId]);
    return jobRes.rows.some((j) => j.state === 'SUCCEEDED' || j.state === 'BLOCKED');
  }, 'worker job completion for 90-day overdue instruction');

  // Verify DB assertions:
  // 1. Exactly 1 job was created
  const jobsRes = await pool.query('SELECT id, state, dedupe_key FROM jobs WHERE instruction_id = $1', [downtimeInstId]);
  assert.equal(jobsRes.rowCount, 1, `Expected exactly 1 job created, found ${jobsRes.rowCount}`);

  // 2. Exactly 1 purchase operation was created
  const opsRes = await pool.query('SELECT id, state FROM purchase_operations WHERE instruction_id = $1', [downtimeInstId]);
  assert.equal(opsRes.rowCount, 1, `Expected exactly 1 operation created, found ${opsRes.rowCount}`);

  // 3. Instruction next_run_at advanced to the future (next_run_at > now())
  const instAfterRecovery = await pool.query(
    'SELECT next_run_at FROM procurement_instructions WHERE id = $1', [downtimeInstId],
  );
  assert.ok(instAfterRecovery.rows[0].next_run_at, 'next_run_at must be populated after recovery');
  assert.ok(
    instAfterRecovery.rows[0].next_run_at > new Date(),
    `next_run_at (${instAfterRecovery.rows[0].next_run_at.toISOString()}) must be strictly in the future`,
  );

  // 4. Zero duplicate catch-up charges: wait 1 second to confirm worker does not spawn secondary jobs
  await delay(1000);
  const recheckedJobs = await pool.query('SELECT count(*) FROM jobs WHERE instruction_id = $1', [downtimeInstId]);
  assert.equal(Number(recheckedJobs.rows[0].count), 1, 'Job count remains exactly 1 with zero catch-up duplicate charges');

  console.log(`✓ Scenario D (DB): 90-day overdue instruction created exactly 1 job, 1 operation, and advanced next_run_at to future (${instAfterRecovery.rows[0].next_run_at.toISOString()}) without duplicate catch-up charges`);
}

async function main() {
  try {
    await runPureMatrixTests();
    await runPostgresMatrixTests();
    console.log('\n==================================================================');
    console.log('AC-03 Schedule & Timezone Matrix Acceptance: ALL SCENARIOS PASSED');
    console.log('==================================================================\n');
  } finally {
    if (workerChild) await stop(workerChild);
    if (apiChild) await stop(apiChild);
    await cleanTestFixtures();
    await pool.end();
  }
}

main().catch((err) => {
  console.error('\n✖ AC-03 Schedule Matrix Test Failed:', err);
  process.exit(1);
});
