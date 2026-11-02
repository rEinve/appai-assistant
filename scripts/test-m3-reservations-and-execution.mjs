import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { Pool } from 'pg';

const databaseUrl = process.env['DATABASE_URL'];
const secret = process.env['BETTER_AUTH_SECRET'];
if (!databaseUrl || !secret || secret.length < 32) throw new Error('Set local DATABASE_URL and BETTER_AUTH_SECRET for M3 PostgreSQL acceptance.');

const root = dirname(fileURLToPath(import.meta.url));
const pool = new Pool({ connectionString: databaseUrl, max: 6 });
const serverFile = join(root, '..', 'dist', 'api', 'apps', 'api', 'src', 'server.js');
const workerFile = join(root, '..', 'dist', 'worker', 'apps', 'worker', 'src', 'worker.js');
const origins = 'http://localhost:4200';
const suffix = randomUUID().replaceAll('-', '').slice(0, 12);
const email = `m3flow-${suffix}@example.test`;
const inviteDigests = [];
const workerId = `m3-flow-${suffix}`;
let apiChild;
let workerChild;
let baseURL;
let ownerId;
let cookie;

async function freePort() {
  const socket = createServer();
  await new Promise((resolve, reject) => socket.listen(0, '127.0.0.1', resolve).once('error', reject));
  const { port } = socket.address();
  await new Promise((resolve, reject) => socket.close((error) => error ? reject(error) : resolve()));
  return port;
}

async function waitFor(check, label, limit = 120) {
  for (let index = 0; index < limit; index += 1) {
    const result = await check();
    if (result) return result;
    await delay(100);
  }
  throw new Error(`Timed out waiting for ${label}.`);
}

async function request(path, { method = 'GET', body, headers = {} } = {}) {
  const response = await fetch(`${baseURL}${path}`, {
    method,
    headers: { ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...(cookie ? { cookie } : {}), origin: origins, ...headers },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const text = await response.text();
  let json;
  try { json = text ? JSON.parse(text) : null; } catch { json = text; }
  const cookies = response.headers.getSetCookie?.() ?? [];
  const sessionCookie = cookies.map((item) => item.split(';', 1)[0]).filter((item) => /session_token=/.test(item)).join('; ');
  return { response, json, sessionCookie };
}

async function enroll() {
  const token = randomUUID() + randomUUID();
  const digest = createHash('sha256').update(token).digest('hex');
  await pool.query("INSERT INTO member_invites(email,token_digest,expires_at) VALUES($1,$2,now()+interval '1 hour')", [email, digest]);
  inviteDigests.push(digest);
  const signup = await request('/api/auth/sign-up/email', { method: 'POST', body: { name: 'M3 Acceptance Owner', email, password: 'M3-acceptance-Fixture-Password-49!', inviteCode: token } });
  assert.equal(signup.response.status, 200, `member enrollment: ${JSON.stringify(signup.json)}`);
  cookie = signup.sessionCookie;
  assert.ok(cookie);
  const profile = await request('/api/v1/me');
  assert.equal(profile.response.status, 200);
  const auth = await pool.query('SELECT id FROM "user" WHERE email=$1', [email]);
  const member = await pool.query('SELECT id FROM users WHERE identity_provider_subject=$1', [auth.rows[0].id]);
  ownerId = member.rows[0].id;
  await pool.query("INSERT INTO user_settings(owner_id,timezone,enabled_currency,currency_scale) VALUES($1,'UTC','USD',2) ON CONFLICT(owner_id) DO NOTHING", [ownerId]);
}

function startWorker() {
  workerChild = spawn(process.execPath, [workerFile], {
    cwd: join(root, '..'),
    env: { ...process.env, APPAI_EXECUTION_MODE: 'local-sandbox', WORKER_ID: workerId, WORKER_POLL_MS: '100', WORKER_LEASE_MS: '5000' },
    stdio: 'ignore',
  });
  return workerChild;
}

async function stop(child) {
  if (!child || child.exitCode !== null) return;
  child.kill('SIGTERM');
  await new Promise((resolve) => child.once('exit', resolve));
}

async function cleanFixtures() {
  const auth = await pool.query('SELECT id FROM "user" WHERE email=$1', [email]);
  const owner = (await pool.query('SELECT id FROM users WHERE identity_provider_subject=$1', [auth.rows[0]?.id ?? '']))?.rows[0]?.id;
  if (owner) {
    await pool.query('DELETE FROM jobs WHERE owner_id=$1', [owner]);
    await pool.query('DELETE FROM notifications WHERE owner_id=$1', [owner]);
    await pool.query('DELETE FROM approvals WHERE owner_id=$1', [owner]);
    await pool.query('UPDATE purchase_operations SET reservation_id=NULL, selected_quote_id=NULL WHERE owner_id=$1', [owner]);
    await pool.query('DELETE FROM refunds WHERE owner_id=$1', [owner]);
    await pool.query('DELETE FROM external_orders WHERE owner_id=$1', [owner]);
    await pool.query('DELETE FROM execution_attempts WHERE owner_id=$1', [owner]);
    await pool.query('DELETE FROM budget_entries WHERE owner_id=$1', [owner]);
    await pool.query('DELETE FROM budget_reservations WHERE owner_id=$1', [owner]);
    await pool.query('DELETE FROM vendor_quotes WHERE owner_id=$1', [owner]);
    await pool.query('DELETE FROM purchase_operations WHERE owner_id=$1', [owner]);
    await pool.query('DELETE FROM procurement_obligations WHERE owner_id=$1', [owner]);
    await pool.query('DELETE FROM instruction_occurrences WHERE owner_id=$1', [owner]);
    await pool.query('DELETE FROM outbox_events WHERE owner_id=$1', [owner]);
    await pool.query('DELETE FROM audit_events WHERE owner_id=$1', [owner]);
    await pool.query('DELETE FROM api_idempotency WHERE actor_id=$1', [owner]);
    await pool.query('DELETE FROM procurement_instructions WHERE owner_id=$1', [owner]);
    await pool.query('DELETE FROM budget_windows WHERE owner_id=$1', [owner]);
    await pool.query('DELETE FROM budget_policies WHERE owner_id=$1', [owner]);
    await pool.query('DELETE FROM budgets WHERE owner_id=$1', [owner]);
    await pool.query('DELETE FROM user_settings WHERE owner_id=$1', [owner]);
  }
  if (auth.rows[0]) {
    await pool.query('DELETE FROM users WHERE identity_provider_subject=$1', [auth.rows[0].id]);
    await pool.query('DELETE FROM "user" WHERE id=$1', [auth.rows[0].id]);
  }
  await pool.query("DELETE FROM member_invites WHERE email=$1", [email]);
}

async function setPolicy({ currency = 'USD', perOrder = '10000', daily = '20000', unit = null, soft = null, timezone = 'UTC' } = {}) {
  const result = await request('/api/v1/budget-policies', { method: 'PUT', body: {
    currency, perOrderHardLimitMinor: perOrder, dailyLimitMinor: daily, unitLimitMinor: unit,
    softReviewThresholdMinor: soft, timezone,
  } });
  assert.equal(result.response.status, 200, `save policy: ${JSON.stringify(result.json)}`);
  return result.json.policy;
}

async function createBudget(name, allocation = '20000', currency = 'USD') {
  const result = await pool.query(`INSERT INTO budgets(owner_id,name,currency,allocation_limit_minor,timezone_snapshot)
    VALUES($1,$2,$3,$4,'UTC') RETURNING id`, [ownerId, `${name}-${suffix}`, currency, allocation]);
  return result.rows[0].id;
}

async function createOperation({ name, budgetId, amount = '4000', max = '10000', currency = 'USD',
  mode = 'PRE_APPROVED', kind = 'ONE_TIME', quantity = 1, category = 'PRODUCT', billAccountRef = 'acct-demo', billInvoiceRef = null }) {
  const instructionId = randomUUID();
  const obligationId = randomUUID();
  const operationId = randomUUID();
  const quoteId = randomUUID();
  const start = new Date(Date.now() - 60_000);
  const end = new Date(Date.now() + 86_400_000);
  await pool.query(`INSERT INTO procurement_instructions(owner_id,id,kind,category,mode,state,structured_constraints,
      max_total_minor,currency,budget_id,valid_from,valid_until,timezone_snapshot,execution_environment,completion_limit)
    VALUES($1,$2,$3,$4,$5,'ACTIVE',$6::jsonb,$7,$8,$9,$10,$11,'UTC','FIXTURE',$12)`,
    [ownerId, instructionId, kind, category, mode, JSON.stringify({ description: name, categoryDetails: { quantity } }), max, currency, budgetId, start, end, kind === 'ONE_TIME' ? 1 : null]);
  const billDetails = category === 'BILL' ? { external_account_ref: billAccountRef, external_invoice_ref: billInvoiceRef ?? `invoice-${name}` } : {};
  await pool.query(`INSERT INTO procurement_obligations(owner_id,id,instruction_id,obligation_key,category,fulfillment_slot,external_account_ref,external_invoice_ref)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8)`, [ownerId, obligationId, instructionId, `m3:${name}`, category, `slot:${name}`,
    billDetails.external_account_ref ?? null, billDetails.external_invoice_ref ?? null]);
  await pool.query(`INSERT INTO purchase_operations(owner_id,id,instruction_id,obligation_id,state,selected_quote_id,permission_version,execution_key)
    VALUES($1,$2,$3,$4,'READY',NULL,1,$5)`, [ownerId, operationId, instructionId, obligationId, `m3-operation:${operationId}`]);
  const adapter = await pool.query("SELECT id,adapter_version FROM vendor_adapters WHERE adapter_key='local-fixture' AND environment='FIXTURE'");
  const quoteHash = createHash('sha256').update(JSON.stringify({ operationId, amount, currency, name })).digest('hex');
  const termsHash = createHash('sha256').update(`terms:${name}`).digest('hex');
  const subtotal = (BigInt(amount) * BigInt(quantity)).toString();
  await pool.query(`INSERT INTO vendor_quotes(owner_id,id,operation_id,adapter_id,adapter_version,environment,merchant_ref,
      external_quote_ref,category,schema_version,typed_details,currency,subtotal_minor,tax_minor,fees_minor,shipping_minor,
      discount_minor,total_minor,quantity,terms_hash,content_hash,verified_at,expires_at)
    VALUES($1,$2,$3,$4,$5,'FIXTURE','M3 Local Sandbox',$6,$7,'m3-test-1.0',$8::jsonb,$9,$10,0,0,0,0,$11,$12,$13,$14,now(),now()+interval '1 day')`,
    [ownerId, quoteId, operationId, adapter.rows[0].id, adapter.rows[0].adapter_version, `m3:${suffix}:${name}`,
      category, JSON.stringify({ fixtureOnly: true, quantity }), currency, subtotal, amount, quantity, termsHash, quoteHash]);
  await pool.query('UPDATE purchase_operations SET selected_quote_id=$3 WHERE owner_id=$1 AND id=$2', [ownerId, operationId, quoteId]);
  return { instructionId, obligationId, operationId, quoteId, quoteHash, amount, currency };
}

async function dispatch(operationId, faultMode = 'NONE') {
  return request(`/api/v1/operations/${operationId}/reserve-and-dispatch`, { method: 'POST', body: { faultMode } });
}

async function main() {
  await cleanFixtures();
  const port = await freePort();
  baseURL = `http://127.0.0.1:${port}`;
  apiChild = spawn(process.execPath, [serverFile], {
    cwd: join(root, '..'), env: { ...process.env, APP_PORT: String(port), BETTER_AUTH_URL: baseURL,
      WEB_APP_ORIGIN: origins, NODE_ENV: 'test', APPAI_EXECUTION_MODE: 'local-sandbox' }, stdio: 'ignore',
  });
  await waitFor(async () => {
    if (apiChild.exitCode !== null) throw new Error(`API exited with ${apiChild.exitCode}.`);
    try { return (await fetch(`${baseURL}/health`)).ok; } catch { return false; }
  }, 'isolated API');

  try {
    await enroll();
    let policy = await setPolicy({ perOrder: '10000', daily: '20000', unit: '3000' });
    const mainBudget = await createBudget('m3-shared', '5000');

    // Hard policy cap cases and currency validation, each use an isolated operation/budget.
    const unitOp = await createOperation({ name: 'unit-cap', budgetId: mainBudget, amount: '4000', max: '10000' });
    let result = await dispatch(unitOp.operationId);
    assert.equal(result.json.reason, 'UNIT_CAP_EXCEEDED', `unit cap result: ${JSON.stringify(result.json)}`);

    policy = await setPolicy({ perOrder: '3000', daily: '10000' });
    const orderOp = await createOperation({ name: 'order-cap', budgetId: mainBudget, amount: '4000', max: '10000' });
    result = await dispatch(orderOp.operationId);
    assert.equal(result.json.reason, 'ORDER_HARD_CAP_EXCEEDED');

    policy = await setPolicy({ perOrder: '10000', daily: '20000' });
    const instructionOp = await createOperation({ name: 'instruction-cap', budgetId: mainBudget, amount: '4000', max: '3000' });
    result = await dispatch(instructionOp.operationId);
    assert.equal(result.json.reason, 'INSTRUCTION_CAP_EXCEEDED');

    const lowBudget = await createBudget('m3-low-capacity', '3000');
    const allocationOp = await createOperation({ name: 'allocation-cap', budgetId: lowBudget, amount: '4000', max: '10000' });
    result = await dispatch(allocationOp.operationId);
    assert.equal(result.json.reason, 'INSUFFICIENT_BUDGET_CAPACITY');

    const oldPolicyVersion = Number(policy.version);
    const review = await createOperation({ name: 'policy-fence', budgetId: mainBudget, amount: '4000', max: '10000', mode: 'REVIEW_REQUIRED' });
    const pendingApproval = await pool.query(`INSERT INTO approvals(owner_id,operation_id,quote_id,quote_hash,permission_version,status,expires_at)
      VALUES($1,$2,$3,$4,1,'PENDING',now()+interval '1 day') RETURNING id,version`, [ownerId, review.operationId, review.quoteId, review.quoteHash]);
    const decision = await request(`/api/v1/approvals/${pendingApproval.rows[0].id}/decide`, { method: 'POST', headers: { 'If-Match': '"1"', 'Idempotency-Key': randomUUID() }, body: { decision: 'APPROVE' } });
    assert.equal(decision.response.status, 200, `approve policy fixture: ${JSON.stringify(decision.json)}`);
    policy = await setPolicy({ perOrder: '3000', daily: '10000' });
    assert.equal(Number(policy.version), oldPolicyVersion + 1, 'policy update increments its version');
    const fencedApproval = await pool.query('SELECT status,policy_version FROM approvals WHERE id=$1', [pendingApproval.rows[0].id]);
    assert.equal(fencedApproval.rows[0].status, 'INVALIDATED', 'policy update invalidates old approval');
    result = await dispatch(review.operationId);
    assert.equal(result.json.reason, 'ORDER_HARD_CAP_EXCEEDED', 'approval cannot override a hard cap');

    // Shared budget race: exactly one $40 order can reserve a $50 balance.
    policy = await setPolicy({ perOrder: '5000', daily: '10000' });
    const raceA = await createOperation({ name: 'race-a', budgetId: mainBudget, amount: '4000', max: '5000' });
    const raceB = await createOperation({ name: 'race-b', budgetId: mainBudget, amount: '4000', max: '5000' });
    const race = await Promise.all([dispatch(raceA.operationId), dispatch(raceB.operationId)]);
    const successes = race.filter(item => item.json.status === 'SUCCEEDED');
    const blocked = race.filter(item => item.json.reason === 'INSUFFICIENT_BUDGET_CAPACITY');
    assert.equal(successes.length, 1, `one of two concurrent $40 operations succeeds: ${JSON.stringify(race.map(item => item.json))}`);
    assert.equal(blocked.length, 1, 'the other concurrent operation blocks on shared capacity');
    const spent = await pool.query("SELECT COALESCE(SUM(amount_minor),0)::text AS total FROM budget_entries WHERE owner_id=$1 AND budget_id=$2 AND kind='SPEND'", [ownerId, mainBudget]);
    assert.equal(spent.rows[0].total, '4000');
    const remaining = await pool.query(`SELECT (b.allocation_limit_minor - COALESCE(SUM(CASE WHEN e.kind='SPEND' THEN e.amount_minor ELSE -e.amount_minor END),0))::text AS remaining
      FROM budgets b LEFT JOIN budget_entries e ON e.owner_id=b.owner_id AND e.budget_id=b.id WHERE b.owner_id=$1 AND b.id=$2 GROUP BY b.id`, [ownerId, mainBudget]);
    assert.equal(remaining.rows[0].remaining, '1000');
    const successfulOperationId = successes[0] === race[0] ? raceA.operationId : raceB.operationId;

    // A one-time retry returns the same attempt and never posts another spend.
    const retry = await dispatch(successfulOperationId);
    assert.equal(retry.json.replay, true);
    const attempts = await pool.query('SELECT count(*)::int AS attempts FROM execution_attempts WHERE owner_id=$1 AND operation_id=$2', [ownerId, successfulOperationId]);
    assert.equal(attempts.rows[0].attempts, 1);
    const completed = await pool.query('SELECT state,fulfilled_count,next_run_at FROM procurement_instructions WHERE owner_id=$1 AND id=(SELECT instruction_id FROM purchase_operations WHERE id=$2)', [ownerId, successfulOperationId]);
    assert.equal(completed.rows[0].state, 'COMPLETED');
    assert.equal(completed.rows[0].fulfilled_count, 1);
    assert.equal(completed.rows[0].next_run_at, null);

    // Pending refunds do not restore capacity; a confirmed refund posts once.
    const beforeRefund = await pool.query('SELECT owner_id,operation_id FROM refunds WHERE owner_id=$1 AND external_ref=$2', [ownerId, `refund-${suffix}`]);
    assert.equal(beforeRefund.rowCount, 0, `refund reference is unused before API call: ${suffix}`);
    const pendingRefund = await request(`/api/v1/operations/${successfulOperationId}/refunds`, { method: 'POST', body: {
      externalRef: `refund-${suffix}`, expectedAmountMinor: '1500', currency: 'USD', status: 'PENDING',
    } });
    assert.ok([200, 201].includes(pendingRefund.response.status), `pending refund: ${JSON.stringify(pendingRefund.json)}`);
    let refundTotal = await pool.query("SELECT COALESCE(SUM(amount_minor),0)::text AS total FROM budget_entries WHERE owner_id=$1 AND budget_id=$2 AND kind='REFUND'", [ownerId, mainBudget]);
    assert.equal(refundTotal.rows[0].total, '0');
    const confirmedRefund = await request(`/api/v1/operations/${successfulOperationId}/refunds`, { method: 'POST', body: {
      externalRef: `refund-${suffix}`, expectedAmountMinor: '1500', confirmedAmountMinor: '1500', currency: 'USD', status: 'CONFIRMED',
    } });
    assert.equal(confirmedRefund.response.status, 200, `confirmed refund transition: ${JSON.stringify(confirmedRefund.json)}`);
    await request(`/api/v1/operations/${successfulOperationId}/refunds`, { method: 'POST', body: {
      externalRef: `refund-${suffix}`, expectedAmountMinor: '1500', confirmedAmountMinor: '1500', currency: 'USD', status: 'CONFIRMED',
    } }).then(replay => assert.equal(replay.json.replay, true));
    refundTotal = await pool.query("SELECT COALESCE(SUM(amount_minor),0)::text AS total FROM budget_entries WHERE owner_id=$1 AND budget_id=$2 AND kind='REFUND'", [ownerId, mainBudget]);
    assert.equal(refundTotal.rows[0].total, '1500');

    // Unresolved liability from the previous local day is counted in today's daily capacity.
    await setPolicy({ currency: 'EUR', perOrder: '5000', daily: '5000' });
    const euroBudget = await createBudget('m3-rollover', '10000', 'EUR');
    const policyRow = await pool.query('SELECT id,version FROM budget_policies WHERE owner_id=$1 AND currency=$2', [ownerId, 'EUR']);
    const previousWindow = await pool.query(`INSERT INTO budget_windows(owner_id,policy_id,local_date,timezone_snapshot,starts_at,ends_at,policy_version)
      VALUES($1,$2,'2000-01-01','UTC','2000-01-01T00:00:00Z','2000-01-02T00:00:00Z',$3) RETURNING id`, [ownerId, policyRow.rows[0].id, policyRow.rows[0].version]);
    const pendingLiability = await createOperation({ name: 'prior-window-liability', budgetId: euroBudget, amount: '3000', max: '5000', currency: 'EUR' });
    await pool.query(`INSERT INTO budget_reservations(owner_id,operation_id,budget_id,budget_window_id,currency,amount_minor,status)
      VALUES($1,$2,$3,$4,'EUR',3000,'ACTIVE')`, [ownerId, pendingLiability.operationId, euroBudget, previousWindow.rows[0].id]);
    const rolloverAttempt = await createOperation({ name: 'rollover-block', budgetId: euroBudget, amount: '3000', max: '5000', currency: 'EUR' });
    result = await dispatch(rolloverAttempt.operationId);
    assert.equal(result.json.reason, 'DAILY_LIMIT_EXCEEDED', 'unresolved prior-window reservation consumes daily capacity');

    // A local sandbox lost response is recovered using the same stable key and one order.
    const recoveryBudget = await createBudget('m3-recovery', '20000');
    const reviewSuccess = await createOperation({ name: 'review-success', budgetId: recoveryBudget, amount: '2500', max: '5000', mode: 'REVIEW_REQUIRED' });
    const reviewApproval = await pool.query(`INSERT INTO approvals(owner_id,operation_id,quote_id,quote_hash,permission_version,status,expires_at)
      VALUES($1,$2,$3,$4,1,'PENDING',now()+interval '1 day') RETURNING id`, [ownerId, reviewSuccess.operationId, reviewSuccess.quoteId, reviewSuccess.quoteHash]);
    const reviewDecision = await request(`/api/v1/approvals/${reviewApproval.rows[0].id}/decide`, {
      method: 'POST', headers: { 'If-Match': '"1"', 'Idempotency-Key': randomUUID() }, body: { decision: 'APPROVE' },
    });
    assert.equal(reviewDecision.response.status, 200, `review approval: ${JSON.stringify(reviewDecision.json)}`);
    const reviewExecution = await dispatch(reviewSuccess.operationId);
    assert.equal(reviewExecution.json.status, 'SUCCEEDED', `approved review execution: ${JSON.stringify(reviewExecution.json)}`);

    const lostResponse = await createOperation({ name: 'lost-response', budgetId: recoveryBudget, amount: '2500', max: '5000' });
    const lost = await dispatch(lostResponse.operationId, 'LOST_RESPONSE_AFTER_SUCCESS');
    assert.equal(lost.json.status, 'RECONCILING');
    let uncertain = await pool.query(`SELECT o.state,r.status,a.status AS attempt_status FROM purchase_operations o
      JOIN budget_reservations r ON r.operation_id=o.id JOIN execution_attempts a ON a.operation_id=o.id WHERE o.id=$1`, [lostResponse.operationId]);
    assert.deepEqual(uncertain.rows[0], { state: 'RECONCILING', status: 'ACTIVE', attempt_status: 'UNKNOWN' });
    const sameKey = await dispatch(lostResponse.operationId);
    assert.equal(sameKey.json.replay, true);
    assert.equal(sameKey.json.stableRequestKey, lost.json.stableRequestKey);
    startWorker();
    await waitFor(async () => {
      const row = await pool.query("SELECT state FROM purchase_operations WHERE id=$1", [lostResponse.operationId]);
      return row.rows[0]?.state === 'SUCCEEDED';
    }, 'lost-response recovery');
    const recoveryCounts = await pool.query(`SELECT count(DISTINCT e.id)::int AS orders, count(DISTINCT b.id)::int AS spend_entries
      FROM external_orders e LEFT JOIN budget_entries b ON b.operation_id=e.operation_id AND b.kind='SPEND'
      WHERE e.owner_id=$1 AND e.operation_id=$2`, [ownerId, lostResponse.operationId]);
    assert.deepEqual(recoveryCounts.rows[0], { orders: 1, spend_entries: 1 });

    const crashed = await createOperation({ name: 'crash-before-refs', budgetId: recoveryBudget, amount: '1500', max: '5000' });
    const crashResult = await dispatch(crashed.operationId, 'CRASH_BEFORE_REFS');
    assert.equal(crashResult.json.status, 'RECONCILING');
    await waitFor(async () => {
      const row = await pool.query("SELECT state FROM purchase_operations WHERE id=$1", [crashed.operationId]);
      return row.rows[0]?.state === 'SUCCEEDED';
    }, 'crash-before-reference recovery');

    // Payment capture without vendor confirmation holds liability until a later reconciliation.
    await setPolicy({ perOrder: '5000', daily: '20000' });
    const pendingVendor = await createOperation({ name: 'vendor-pending', budgetId: recoveryBudget, amount: '2500', max: '5000' });
    const pending = await dispatch(pendingVendor.operationId, 'PAYMENT_CAPTURED_VENDOR_PENDING');
    assert.equal(pending.json.status, 'RECONCILING');
    await waitFor(async () => {
      const row = await pool.query(`SELECT o.state,r.status,e.payment_status,e.vendor_status FROM purchase_operations o
        JOIN budget_reservations r ON r.operation_id=o.id JOIN external_orders e ON e.operation_id=o.id WHERE o.id=$1`, [pendingVendor.operationId]);
      return row.rows[0]?.state === 'RECONCILING' && row.rows[0]?.status === 'ACTIVE' && row.rows[0]?.payment_status === 'CAPTURED' && row.rows[0]?.vendor_status === 'PENDING';
    }, 'pending vendor outcome remains reserved');
    await pool.query("UPDATE external_orders SET vendor_status='CONFIRMED',verified_at=now() WHERE owner_id=$1 AND operation_id=$2", [ownerId, pendingVendor.operationId]);
    await waitFor(async () => {
      const row = await pool.query('SELECT state FROM purchase_operations WHERE id=$1', [pendingVendor.operationId]);
      return row.rows[0]?.state === 'SUCCEEDED';
    }, 'pending vendor reconciliation recovery');

    const workerInstructionId = randomUUID();
    await pool.query(`INSERT INTO procurement_instructions(owner_id,id,kind,category,mode,state,structured_constraints,
        max_total_minor,currency,budget_id,valid_from,valid_until,timezone_snapshot,execution_environment,next_run_at,completion_limit)
      VALUES($1,$2,'ONE_TIME','PRODUCT','PRE_APPROVED','ACTIVE',$3::jsonb,4000,'USD',$4,now()-interval '1 minute',now()+interval '1 day','UTC','FIXTURE',now()-interval '1 second',1)`,
      [ownerId, workerInstructionId, JSON.stringify({ description: 'M3 worker local sandbox dispatch', categoryDetails: { quantity: 1 } }), recoveryBudget]);
    const workerOperation = await waitFor(async () => {
      const row = await pool.query(`SELECT o.id,o.state FROM purchase_operations o WHERE o.owner_id=$1 AND o.instruction_id=$2`, [ownerId, workerInstructionId]);
      return row.rows[0]?.state === 'SUCCEEDED' ? row.rows[0] : null;
    }, 'worker PRE_APPROVED local sandbox execution');
    const workerSpend = await pool.query("SELECT count(*)::int AS count FROM budget_entries WHERE owner_id=$1 AND operation_id=$2 AND kind='SPEND'", [ownerId, workerOperation.id]);
    assert.equal(workerSpend.rows[0].count, 1, 'worker PRE_APPROVED execution posts one spend entry');

    // A second independent bill instruction cannot own the same account/invoice pair.
    const billBudget = await createBudget('m3-bills', '10000');
    await createOperation({ name: 'bill-first', budgetId: billBudget, amount: '1000', max: '5000', category: 'BILL', kind: 'RECURRING_BILL', billAccountRef: 'acct-shared', billInvoiceRef: 'invoice-shared' });
    await assert.rejects(
      createOperation({ name: 'bill-duplicate', budgetId: billBudget, amount: '1000', max: '5000', category: 'BILL', kind: 'RECURRING_BILL', billAccountRef: 'acct-shared', billInvoiceRef: 'invoice-shared' }),
      error => error.code === '23505' && error.constraint === 'procurement_obligations_unique_bill_invoice',
    );

    const adapters = await pool.query("SELECT COALESCE(bool_and(execution_enabled=false),true) AS live_disabled FROM vendor_adapters WHERE environment='LIVE'");
    assert.equal(adapters.rows[0].live_disabled, true);
    console.log('M3 PostgreSQL acceptance passed: hard caps and policy fencing, approval cannot override policy, shared-budget concurrency, one-time replay, confirmed-only refund restoration, prior-window liability, cross-instruction bill uniqueness, worker pre-approved execution, lost-response recovery, and captured-payment/vendor-pending reconciliation. All operations used the deterministic local fixture adapter; LIVE execution remains disabled.');
  } finally {
    await stop(workerChild);
    await stop(apiChild);
    await pool.query('DELETE FROM worker_heartbeats WHERE worker_id=$1', [workerId]);
    await cleanFixtures();
    await pool.query('DELETE FROM "rateLimit" WHERE key LIKE $1', ['127.0.0.1|/%']);
    await pool.end();
  }
}

await main();
