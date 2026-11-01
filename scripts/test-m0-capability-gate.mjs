import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { readFile, readdir } from 'node:fs/promises';
import { createServer } from 'node:net';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { Pool } from 'pg';

const databaseUrl = process.env['DATABASE_URL'];
const secret = process.env['BETTER_AUTH_SECRET'];
if (!databaseUrl || !secret || secret.length < 32) {
  throw new Error('Set local DATABASE_URL and BETTER_AUTH_SECRET before running the M0 capability gate acceptance.');
}

const root = dirname(fileURLToPath(import.meta.url));
const pool = new Pool({ connectionString: databaseUrl, max: 4 });
const serverFile = join(root, '..', 'dist', 'api', 'apps', 'api', 'src', 'server.js');
const workerFile = join(root, '..', 'dist', 'worker', 'apps', 'worker', 'src', 'worker.js');
const origins = 'http://localhost:4200';
const suffix = randomUUID().replaceAll('-', '').slice(0, 12);
const email = `m0gate-${suffix}@example.test`;
const workerId = `m0-gate-worker-${suffix}`;
let apiChild;
let workerChild;
let baseURL;

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
    stdio: ['ignore', 'ignore', 'inherit'],
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

async function signUp(memberEmail, name) {
  const token = randomUUID() + randomUUID();
  const digest = createHash('sha256').update(token).digest('hex');
  await pool.query(
    'INSERT INTO member_invites (email, token_digest, expires_at) VALUES ($1, $2, now() + interval \'1 hour\')',
    [memberEmail, digest],
  );
  const result = await request('/api/auth/sign-up/email', {
    method: 'POST',
    body: { name, email: memberEmail, password: 'M0-capability-fixture-Password-49!', inviteCode: token },
  });
  assert.equal(result.response.status, 200, `invited test member should enroll: ${JSON.stringify(result.json)}`);
  assert.ok(result.sessionCookie, 'enrollment returns a database-backed session cookie');
  const profile = await request('/api/v1/me', { cookie: result.sessionCookie });
  assert.equal(profile.response.status, 200);
  const user = await pool.query('SELECT id FROM "user" WHERE email = $1', [memberEmail]);
  const member = await pool.query('SELECT id FROM users WHERE identity_provider_subject = $1', [user.rows[0].id]);
  return { cookie: result.sessionCookie, memberId: member.rows[0].id };
}

async function cleanTestFixtures() {
  const owners = await pool.query(
    `SELECT id FROM users WHERE identity_provider_subject IN
       (SELECT id FROM "user" WHERE email LIKE 'm0gate-%@example.test')`,
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
    await pool.query('DELETE FROM audit_events WHERE owner_id = $1', [id]);
    await pool.query('DELETE FROM api_idempotency WHERE actor_id = $1', [id]);
    await pool.query('DELETE FROM budget_supplier_preferences WHERE owner_id = $1', [id]);
    await pool.query('DELETE FROM member_suppliers WHERE owner_id = $1', [id]);
    await pool.query('DELETE FROM procurement_instructions WHERE owner_id = $1', [id]);
    await pool.query('DELETE FROM connection_sessions WHERE owner_id = $1', [id]);
    await pool.query('DELETE FROM funding_mandates WHERE owner_id = $1', [id]);
    await pool.query('DELETE FROM vendor_accounts WHERE owner_id = $1', [id]);
    await pool.query('DELETE FROM budgets WHERE owner_id = $1', [id]);
    await pool.query('DELETE FROM user_settings WHERE owner_id = $1', [id]);
  }
  await pool.query("DELETE FROM provider_events WHERE external_event_id LIKE 'evt_m0gate_%'");
  const users = await pool.query("SELECT id FROM \"user\" WHERE email LIKE 'm0gate-%@example.test'");
  const authIds = users.rows.map((row) => row.id);
  if (authIds.length) {
    await pool.query('DELETE FROM users WHERE identity_provider_subject = ANY($1)', [authIds]);
    await pool.query('DELETE FROM "user" WHERE id = ANY($1)', [authIds]);
  }
  await pool.query("DELETE FROM member_invites WHERE email LIKE 'm0gate-%@example.test'");
}

async function main() {
  const migrationDir = join(root, '..', 'packages', 'persistence', 'migrations');
  const migrations = (await readdir(migrationDir)).filter((file) => /^\d+_.*\.sql$/.test(file)).sort();
  for (const file of migrations) await pool.query(await readFile(join(migrationDir, file), 'utf8'));
  await cleanTestFixtures();
  await pool.query('DELETE FROM "rateLimit" WHERE key LIKE $1', ['127.0.0.1|/%']);

  const port = await freePort();
  baseURL = `http://127.0.0.1:${port}`;
  apiChild = spawn(process.execPath, [serverFile], {
    cwd: join(root, '..'),
    env: { ...process.env, APP_PORT: String(port), BETTER_AUTH_URL: baseURL, WEB_APP_ORIGIN: origins, NODE_ENV: 'test', PAYPAL_DEMO_MODE: 'fixture' },
    stdio: 'ignore',
  });
  await waitFor(async () => {
    if (apiChild.exitCode !== null) throw new Error(`API exited with ${apiChild.exitCode}.`);
    try { const response = await fetch(`${baseURL}/health`); return response.ok; } catch { return false; }
  }, 'API health');

  const { cookie, memberId } = await signUp(email, 'M0 Gate Verifier');

  // ---------------------------------------------------------------------------
  // 1. AC-02: Real Vendor & Payment Capability Matrix, Roles, Consent & Webhook
  // ---------------------------------------------------------------------------
  const capabilitiesRes = await request('/api/v1/capabilities', { cookie });
  assert.equal(capabilitiesRes.response.status, 200);
  assert.equal(capabilitiesRes.json.liveExecutionEnabled, false, 'live execution must remain disabled in M0/M1');
  assert.equal(capabilitiesRes.json.prePurchaseReservationBoundary.reservationSupported, false);
  assert.equal(capabilitiesRes.json.paypalCapability.buyerRole, 'AUTHENTICATED_MEMBER_PAYPAL_BUYER');
  assert.equal(capabilitiesRes.json.paypalCapability.callerRole, 'APPAI_OAUTH_CLIENT_CREDENTIALS');
  assert.equal(capabilitiesRes.json.paypalCapability.payeeRole, 'VERIFIED_SANDBOX_MERCHANT');

  const adapterKeys = new Map(capabilitiesRes.json.adapters.map((row) => [row.adapterKey, row]));
  assert.ok(adapterKeys.has('local-fixture'));
  assert.ok(adapterKeys.has('paypal-sandbox'));
  assert.ok(adapterKeys.has('serper-discovery'));
  assert.ok(adapterKeys.has('webmcp-browser-host'));
  for (const row of capabilitiesRes.json.adapters) {
    assert.equal(row.executionEnabled, false, `adapter ${row.adapterKey} must keep execution_enabled=false`);
  }

  // Begin one-use connection session & complete provider consent callback (AC-02)
  const beginRes = await request('/api/v1/connections/paypal-sandbox/begin', {
    method: 'POST',
    cookie,
    body: { redirectUri: 'http://localhost:4200/connections/callback' },
  });
  assert.equal(beginRes.response.status, 201);
  assert.ok(beginRes.json.stateToken?.startsWith('st_'));

  const callbackRes = await request('/api/v1/connections/paypal-sandbox/callback', {
    method: 'POST',
    cookie,
    body: {
      stateToken: beginRes.json.stateToken,
      externalAccountRef: `payer-${suffix}`,
      externalMandateRef: `mandate-${suffix}`,
    },
  });
  assert.equal(callbackRes.response.status, 200);
  assert.equal(callbackRes.json.sessionStatus, 'ACTIVE');
  assert.equal(callbackRes.json.mandateStatus, 'ACTIVE');
  assert.equal(callbackRes.json.roles.buyerRole, 'AUTHENTICATED_MEMBER_PAYPAL_BUYER');

  // Replaying the consumed stateToken must be rejected (409 CONNECTION_SESSION_ALREADY_CONSUMED)
  const replayCallbackRes = await request('/api/v1/connections/paypal-sandbox/callback', {
    method: 'POST',
    cookie,
    body: { stateToken: beginRes.json.stateToken },
  });
  assert.equal(replayCallbackRes.response.status, 409);
  assert.equal(replayCallbackRes.json.code, 'CONNECTION_SESSION_ALREADY_CONSUMED');

  // Verify PayPal order creation/lookup roles & verified webhook persistence in provider_events
  const orderCreate = await request('/api/demo/paypal/orders', {
    method: 'POST',
    body: {
      operationId: `op-m0-${suffix}`,
      amountMinor: '2450',
      description: 'M0 capability order & status check',
      reference: `ref-m0-${suffix}`,
    },
  });
  assert.equal(orderCreate.response.status, 201);
  assert.equal(orderCreate.json.roles.buyerRole, 'AUTHENTICATED_MEMBER_FIXTURE_BUYER');
  assert.equal(orderCreate.json.roles.callerRole, 'APPAI_FIXTURE_ADAPTER');
  assert.equal(orderCreate.json.roles.payeeRole, 'FIXTURE_MERCHANT');

  const orderLookup = await request(`/api/demo/paypal/orders/${encodeURIComponent(orderCreate.json.id)}`);
  assert.equal(orderLookup.response.status, 200);
  assert.equal(orderLookup.json.id, orderCreate.json.id);

  const webhookEventId = `evt_m0gate_${suffix}`;
  const webhookPost = await request('/api/demo/paypal/webhooks', {
    method: 'POST',
    headers: { 'x-demo-signature': 'fixture' },
    body: {
      id: webhookEventId,
      event_type: 'CHECKOUT.ORDER.APPROVED',
      resource: { id: orderCreate.json.id },
    },
  });
  assert.equal(webhookPost.response.status, 202);
  assert.equal(webhookPost.json.verified, true);
  assert.ok(webhookPost.json.persistedEventId, 'verified webhook must persist to provider_events');

  // Duplicate webhook delivery must be idempotent
  const duplicateWebhook = await request('/api/demo/paypal/webhooks', {
    method: 'POST',
    headers: { 'x-demo-signature': 'fixture' },
    body: {
      id: webhookEventId,
      event_type: 'CHECKOUT.ORDER.APPROVED',
      resource: { id: orderCreate.json.id },
    },
  });
  assert.equal(duplicateWebhook.response.status, 202);
  assert.equal(duplicateWebhook.json.persistedEventId, null, 'duplicate webhook event must be deduplicated via ON CONFLICT');

  // ---------------------------------------------------------------------------
  // 2. AC-17: Pre-Purchase Reservation Boundary (Hold / Deposit / Bid / Capture)
  // ---------------------------------------------------------------------------
  for (const blockedOp of ['HOLD', 'AUTHORIZE', 'CAPTURE_HOLD', 'VOID_HOLD', 'DEPOSIT', 'BID', 'ESCROW']) {
    const checkBlocked = await request('/api/v1/capabilities/check', {
      method: 'POST',
      cookie,
      body: { adapterKey: 'paypal-sandbox', category: 'PRODUCT', operation: blockedOp },
    });
    assert.equal(checkBlocked.response.status, 422, `${blockedOp} must be rejected with 422`);
    assert.equal(checkBlocked.json.code, 'CAPABILITY_UNSUPPORTED');
    assert.equal(checkBlocked.json.operation, blockedOp);
  }

  // Unsupported adapter or unsupported category must also return 422 CAPABILITY_UNSUPPORTED
  const checkUnknownAdapter = await request('/api/v1/capabilities/check', {
    method: 'POST',
    cookie,
    body: { adapterKey: 'nonexistent-vendor-adapter', category: 'PRODUCT', operation: 'CREATE_ORDER' },
  });
  assert.equal(checkUnknownAdapter.response.status, 422);
  assert.equal(checkUnknownAdapter.json.code, 'CAPABILITY_UNSUPPORTED');

  // ---------------------------------------------------------------------------
  // 3. AC-12: Closed-UI WebMCP, Pre-Dispatch Session Expiry & Mandate Revocation
  // ---------------------------------------------------------------------------
  // 3a. Closed-phone / unattended WebMCP check returns 409 ACTION_REQUIRED
  const webmcpClosedCheck = await request('/api/v1/capabilities/check', {
    method: 'POST',
    cookie,
    body: { adapterKey: 'webmcp-browser-host', category: 'PRODUCT', operation: 'CREATE_ORDER', uiClosed: true },
  });
  assert.equal(webmcpClosedCheck.response.status, 409);
  assert.equal(webmcpClosedCheck.json.code, 'ACTION_REQUIRED');
  assert.equal(webmcpClosedCheck.json.reason, 'WEBMCP_REQUIRES_FOREGROUND_SESSION');

  // 3b. Configure member settings, budget, and instruction, then bind local-fixture consent
  const settingsRes = await request('/api/v1/settings', {
    method: 'POST',
    cookie,
    headers: { 'Idempotency-Key': randomUUID() },
    body: { timezone: 'UTC', currency: 'USD', currencyScale: 2 },
  });
  assert.equal(settingsRes.response.status, 201);

  const budgetStart = new Date(Date.now() - 86_400_000);
  const now = new Date(Date.now() - 60_000);
  const until = new Date(Date.now() + 30 * 86_400_000);
  const local = (date) => date.toISOString().slice(0, 16);

  const budgetRes = await request('/api/v1/budgets', {
    method: 'POST',
    cookie,
    headers: { 'Idempotency-Key': randomUUID() },
    body: { name: `M0 Gate Budget ${suffix}`, allocationLimit: '500.00', validFromLocal: local(budgetStart), validUntilLocal: local(until) },
  });
  assert.equal(budgetRes.response.status, 201);
  const budgetId = budgetRes.json.budget.id;

  const createInstructionRes = await request('/api/v1/instructions', {
    method: 'POST',
    cookie,
    headers: { 'Idempotency-Key': randomUUID() },
    body: {
      description: 'M0 mandate and session revocation test instruction',
      kind: 'ONE_TIME',
      category: 'PRODUCT',
      mode: 'REVIEW_REQUIRED',
      budgetId,
    },
  });
  assert.equal(createInstructionRes.response.status, 201);
  const instructionId = createInstructionRes.json.instruction.id;

  const configRes = await request(`/api/v1/instructions/${instructionId}/configuration`, {
    method: 'PATCH',
    cookie,
    headers: { 'If-Match': `"${createInstructionRes.json.instruction.version}"` },
    body: {
      description: 'M0 mandate and session revocation test instruction',
      memberCategory: 'OTHER',
      budgetId,
      maximumTotal: '40.00',
      validFromLocal: local(now),
      validUntilLocal: local(until),
      timezone: 'UTC',
      categoryDetails: { quantity: 1, variant: '1kg Coffee Beans', deliveryBy: '' },
    },
  });
  assert.equal(configRes.response.status, 200);

  // Record a live worker heartbeat so activate-fixture succeeds while keeping the worker paused for pre-dispatch testing
  await pool.query(
    `INSERT INTO worker_heartbeats (worker_id, started_at, last_seen_at)
     VALUES ($1, now(), now())
     ON CONFLICT (worker_id) DO UPDATE SET last_seen_at = now()`,
    [workerId],
  );

  const activateRes = await request(`/api/v1/instructions/${instructionId}/activate-fixture`, {
    method: 'POST',
    cookie,
    headers: {
      'Idempotency-Key': randomUUID(),
      'If-Match': `"${configRes.json.instruction.version}"`,
    },
    body: {},
  });
  assert.equal(activateRes.response.status, 200, `activate-fixture: ${JSON.stringify(activateRes.json)}`);

  const instRow = await pool.query('SELECT permission_version FROM procurement_instructions WHERE id = $1', [instructionId]);
  const currentScheduleVersion = Number(instRow.rows[0].permission_version);

  // Enqueue a pre-dispatch RUN_OCCURRENCE job
  const preDispatchJobInsert = await pool.query(
    `INSERT INTO jobs (owner_id, instruction_id, job_type, state, dedupe_key, run_at, payload)
     VALUES ($1, $2, 'RUN_OCCURRENCE', 'READY', $3, now(), $4::jsonb)
     RETURNING id`,
    [
      memberId,
      instructionId,
      `m0-predispatch:${instructionId}`,
      JSON.stringify({ instructionId, occurrenceKey: '2026-04-19@09:00-11:00', dueAt: new Date().toISOString(), scheduleVersion: currentScheduleVersion }),
    ],
  );
  const initialJobId = preDispatchJobInsert.rows[0].id;

  // Bind consent to the active instruction via callback
  const fixtureBegin = await request('/api/v1/connections/local-fixture/begin', {
    method: 'POST',
    cookie,
    body: {},
  });
  assert.equal(fixtureBegin.response.status, 201);

  const fixtureCallback = await request('/api/v1/connections/local-fixture/callback', {
    method: 'POST',
    cookie,
    body: {
      stateToken: fixtureBegin.json.stateToken,
      externalAccountRef: `fixture-acct-${suffix}`,
      externalMandateRef: `fixture-mandate-${suffix}`,
      instructionId,
    },
  });
  assert.equal(fixtureCallback.response.status, 200);
  const { vendorAccountId, fundingMandateId } = fixtureCallback.json;

  // Prevent enqueueDueInstructions from creating an extra job while testing our explicit pre-dispatch job
  await pool.query('UPDATE procurement_instructions SET next_run_at = NULL WHERE id = $1', [instructionId]);

  // Expire the vendor session BEFORE worker dispatch -> blocks pre-dispatch job with REAUTH_REQUIRED
  const expireRes = await request(`/api/v1/connections/${vendorAccountId}/expire-session`, {
    method: 'POST',
    cookie,
  });
  assert.equal(expireRes.response.status, 200);
  assert.equal(expireRes.json.sessionStatus, 'EXPIRED');
  assert.equal(expireRes.json.blockedPreDispatchJobs, 1);

  const jobAfterExpire = await pool.query('SELECT state, last_error_code FROM jobs WHERE id = $1', [initialJobId]);
  assert.equal(jobAfterExpire.rows[0].state, 'BLOCKED');
  assert.equal(jobAfterExpire.rows[0].last_error_code, 'REAUTH_REQUIRED');

  // Also test worker-side enforcement: if a READY RUN_OCCURRENCE job is picked up while session is EXPIRED, worker blocks it with REAUTH_REQUIRED
  const workerExpireJobInsert = await pool.query(
    `INSERT INTO jobs (owner_id, instruction_id, job_type, state, dedupe_key, run_at, payload)
     VALUES ($1, $2, 'RUN_OCCURRENCE', 'READY', $3, now(), $4::jsonb)
     RETURNING id`,
    [
      memberId,
      instructionId,
      `m0-worker-expire:${instructionId}`,
      JSON.stringify({ instructionId, occurrenceKey: '2026-04-20@09:00-11:00', dueAt: new Date().toISOString(), scheduleVersion: currentScheduleVersion }),
    ],
  );
  const workerExpireJobId = workerExpireJobInsert.rows[0].id;
  startWorker();
  await waitFor(async () => {
    const row = await pool.query('SELECT state, last_error_code FROM jobs WHERE id = $1', [workerExpireJobId]);
    return row.rows[0]?.state === 'BLOCKED' && row.rows[0]?.last_error_code === 'REAUTH_REQUIRED';
  }, 'worker blocking expired-session job with REAUTH_REQUIRED');
  await stop(workerChild);

  const quoteCountAfterExpire = await pool.query('SELECT count(*)::int AS count FROM purchase_operations WHERE instruction_id = $1', [instructionId]);
  assert.equal(quoteCountAfterExpire.rows[0].count, 0, 'zero operations should be created when session is expired');

  // 3c. Re-authenticate session, enqueue both a future RUN_OCCURRENCE job and an in-flight RECONCILE job, then revoke mandate (AC-12)
  await pool.query("UPDATE vendor_accounts SET session_status = 'ACTIVE', reauth_reason = NULL WHERE id = $1", [vendorAccountId]);
  const futureRunJobInsert = await pool.query(
    `INSERT INTO jobs (owner_id, instruction_id, job_type, state, dedupe_key, run_at, payload)
     VALUES ($1, $2, 'RUN_OCCURRENCE', 'READY', $3, now(), $4::jsonb)
     RETURNING id`,
    [
      memberId,
      instructionId,
      `m0-future-run:${instructionId}`,
      JSON.stringify({ instructionId, occurrenceKey: '2026-04-27@09:00-11:00', dueAt: new Date().toISOString(), scheduleVersion: currentScheduleVersion }),
    ],
  );
  const reconcileJobInsert = await pool.query(
    `INSERT INTO jobs (owner_id, instruction_id, job_type, state, dedupe_key, run_at, payload)
     VALUES ($1, $2, 'RECONCILE', 'READY', $3, now(), $4::jsonb)
     RETURNING id`,
    [
      memberId,
      instructionId,
      `m0-inflight-reconcile:${instructionId}`,
      JSON.stringify({ instructionId, fixtureReconcile: true }),
    ],
  );

  const revokeRes = await request(`/api/v1/connections/${fundingMandateId}/revoke`, {
    method: 'POST',
    cookie,
  });
  assert.equal(revokeRes.response.status, 200);
  assert.equal(revokeRes.json.status, 'REVOKED');
  assert.equal(revokeRes.json.blockedFutureJobs, 1, 'future RUN_OCCURRENCE job must be blocked on mandate revoke');
  assert.equal(revokeRes.json.preservedReconcileJobs, 1, 'in-flight RECONCILE job must be preserved on mandate revoke');

  // Start worker and verify RECONCILE job completes to SUCCEEDED while future RUN_OCCURRENCE stays BLOCKED (MANDATE_REVOKED)
  startWorker();
  await waitFor(async () => {
    const rec = await pool.query('SELECT state FROM jobs WHERE id = $1', [reconcileJobInsert.rows[0].id]);
    return rec.rows[0]?.state === 'SUCCEEDED';
  }, 'preserved RECONCILE job completing after mandate revocation');
  await stop(workerChild);

  const finalFutureRun = await pool.query('SELECT state, last_error_code FROM jobs WHERE id = $1', [futureRunJobInsert.rows[0].id]);
  assert.equal(finalFutureRun.rows[0].state, 'BLOCKED');
  assert.equal(finalFutureRun.rows[0].last_error_code, 'MANDATE_REVOKED');

  console.log(JSON.stringify({
    status: 'PASS',
    verifiedAcceptances: ['AC-02', 'AC-12', 'AC-17'],
    capabilitiesCount: capabilitiesRes.json.adapters.length,
    liveExecutionEnabled: capabilitiesRes.json.liveExecutionEnabled,
    roles: callbackRes.json.roles,
    blockedHoldOperations: 7,
    expiredSessionBlockedJobs: 2,
    revokedMandateBlockedFutureJobs: 1,
    preservedReconcileJobsCompleted: 1,
  }, null, 2));
}

try {
  await main();
} finally {
  await stop(workerChild);
  await stop(apiChild);
  await cleanTestFixtures().catch(() => {});
  await pool.end();
}
