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
if (!databaseUrl || !secret || secret.length < 32) throw new Error('Set local DATABASE_URL and BETTER_AUTH_SECRET before running the M1 workflow acceptance.');

const root = dirname(fileURLToPath(import.meta.url));
const pool = new Pool({ connectionString: databaseUrl, max: 4 });
const serverFile = join(root, '..', 'dist', 'api', 'apps', 'api', 'src', 'server.js');
const workerFile = join(root, '..', 'dist', 'worker', 'apps', 'worker', 'src', 'worker.js');
const origins = 'http://localhost:4200';
const suffix = randomUUID().replaceAll('-', '').slice(0, 12);
const emails = [`m1flow-${suffix}-one@example.test`, `m1flow-${suffix}-two@example.test`];
const authUsers = [];
const inviteDigests = [];
const workerIds = [`m1-flow-${suffix}-a`, `m1-flow-${suffix}-b`];
let apiChild;
let workerChild;
let baseURL;
let ownerId;
let instructionId;
let operationId;
let quoteId;
let approvalId;
let jobId;

async function freePort() {
  const socket = createServer();
  await new Promise((resolve, reject) => socket.listen(0, '127.0.0.1', resolve).once('error', reject));
  const { port } = socket.address();
  await new Promise((resolve, reject) => socket.close((error) => error ? reject(error) : resolve()));
  return port;
}

function startWorker(index) {
  workerChild = spawn(process.execPath, [workerFile], {
    cwd: join(root, '..'),
    env: { ...process.env, WORKER_ID: workerIds[index], WORKER_POLL_MS: '100', WORKER_LEASE_MS: '5000' },
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
  inviteDigests.push(digest);
  return token;
}

async function signUp(email, name) {
  const token = await invite(email);
  const result = await request('/api/auth/sign-up/email', {
    method: 'POST', body: { name, email, password: 'M1-workflow-fixture-Password-49!', inviteCode: token },
  });
  assert.equal(result.response.status, 200, `invited test member should enroll: ${JSON.stringify(result.json)}`);
  assert.ok(result.sessionCookie, 'enrollment returns a database-backed session cookie');
  const profile = await request('/api/v1/me', { cookie: result.sessionCookie });
  assert.equal(profile.response.status, 200, 'the first authenticated member request should establish the application owner mapping');
  const user = await pool.query('SELECT id FROM "user" WHERE email = $1', [email]);
  assert.equal(user.rowCount, 1);
  authUsers.push(user.rows[0].id);
  const member = await pool.query('SELECT id FROM users WHERE identity_provider_subject = $1', [user.rows[0].id]);
  return { cookie: result.sessionCookie, memberId: member.rows[0].id };
}

async function cleanTestFixtures() {
  const owners = await pool.query(
    `SELECT id FROM users WHERE identity_provider_subject IN
       (SELECT id FROM "user" WHERE email LIKE 'm1flow-%@example.test')`,
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
  const users = await pool.query('SELECT id FROM "user" WHERE email LIKE \'m1flow-%@example.test\'');
  const authIds = users.rows.map((row) => row.id);
  if (authIds.length) {
    await pool.query('DELETE FROM "user" WHERE id = ANY($1)', [authIds]);
  }
  await pool.query("DELETE FROM member_invites WHERE email LIKE 'm1flow-%@example.test'");
}

async function main() {
  const migrationDir = join(root, '..', 'packages', 'persistence', 'migrations');
  const migrations = (await readdir(migrationDir)).filter((file) => /^\d+_.*\.sql$/.test(file)).sort();
  for (const file of migrations) await pool.query(await readFile(join(migrationDir, file), 'utf8'));
  await cleanTestFixtures();
  const savedRateLimits = await pool.query('SELECT id, key, count, "lastRequest" FROM "rateLimit" WHERE key LIKE $1', ['127.0.0.1|/%']);
  await pool.query('DELETE FROM "rateLimit" WHERE key LIKE $1', ['127.0.0.1|/%']);

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
  const firstWorker = startWorker(0);

  try {
    const owner = await signUp(emails[0], 'M1 Fixture Owner');
    ownerId = owner.memberId;
    const other = await signUp(emails[1], 'M1 Fixture Other');

    let result = await request('/api/v1/settings', {
      method: 'POST', cookie: owner.cookie,
      headers: { 'Idempotency-Key': randomUUID() },
      body: { timezone: 'UTC', currency: 'USD', currencyScale: 2 },
    });
    assert.equal(result.response.status, 201, `settings setup: ${JSON.stringify(result.json)}`);
    result = await request('/api/v1/settings', {
      method: 'POST', cookie: other.cookie,
      headers: { 'Idempotency-Key': randomUUID() },
      body: { timezone: 'UTC', currency: 'USD', currencyScale: 2 },
    });
    assert.equal(result.response.status, 201, `second member settings: ${JSON.stringify(result.json)}`);
    const budgetStart = new Date(Date.now() - 86_400_000);
    const now = new Date(Date.now() - 60_000);
    const until = new Date(Date.now() + 90 * 86_400_000);
    const local = (date) => date.toISOString().slice(0, 16);
    result = await request('/api/v1/budgets', {
      method: 'POST', cookie: owner.cookie,
      headers: { 'Idempotency-Key': randomUUID() },
      body: { name: `M1 fixture ${suffix}`, allocationLimit: '1000.00', validFromLocal: local(budgetStart), validUntilLocal: local(until) },
    });
    assert.equal(result.response.status, 201, `budget setup: ${JSON.stringify(result.json)}`);
    const budget = result.json.budget;
    const budgetId = result.json.budget.id;
    result = await request('/api/v1/budgets', {
      method: 'POST', cookie: other.cookie,
      headers: { 'Idempotency-Key': randomUUID() },
      body: { name: `Other member budget ${suffix}`, allocationLimit: '500.00' },
    });
    assert.equal(result.response.status, 201, `second member budget: ${JSON.stringify(result.json)}`);
    const otherBudgetId = result.json.budget.id;

    const createPrivateSupplier = async (cookie, payload, key = randomUUID()) => {
      const result = await request('/api/v1/member-suppliers', {
        method: 'POST', cookie, headers: { 'Idempotency-Key': key }, body: payload,
      });
      return { ...result, key };
    };
    const ownerSupplierOne = await createPrivateSupplier(owner.cookie, {
      name: `Owner supplier one ${suffix}`, categories: ['PRODUCT'], serviceAreas: ['Arusha'], privateNotes: 'Owner-only supplier note one',
    });
    assert.equal(ownerSupplierOne.response.status, 201, `first private supplier: ${JSON.stringify(ownerSupplierOne.json)}`);
    const ownerSupplierOneId = ownerSupplierOne.json.supplier.id;
    const ownerSupplierRetry = await createPrivateSupplier(owner.cookie, {
      name: `Owner supplier one ${suffix}`, categories: ['PRODUCT'], serviceAreas: ['Arusha'], privateNotes: 'Owner-only supplier note one',
    }, ownerSupplierOne.key);
    assert.equal(ownerSupplierRetry.response.status, 201, 'retrying private supplier creation returns its saved result');
    assert.equal(ownerSupplierRetry.json.supplier.id, ownerSupplierOneId, 'supplier retry does not create a duplicate');
    const ownerSupplierTwo = await createPrivateSupplier(owner.cookie, {
      name: `Owner supplier two ${suffix}`, categories: ['ACCOMMODATION'], serviceAreas: ['Dar es Salaam'], privateNotes: 'Owner-only supplier note two',
    });
    assert.equal(ownerSupplierTwo.response.status, 201, `second private supplier: ${JSON.stringify(ownerSupplierTwo.json)}`);
    const ownerSupplierTwoId = ownerSupplierTwo.json.supplier.id;
    const otherSupplier = await createPrivateSupplier(other.cookie, {
      name: `Other member supplier ${suffix}`, categories: ['BILL'], serviceAreas: ['Moshi'], privateNotes: 'Other-member private note',
    });
    assert.equal(otherSupplier.response.status, 201, `other member private supplier: ${JSON.stringify(otherSupplier.json)}`);
    const otherSupplierId = otherSupplier.json.supplier.id;

    const ownerSupplierList = await request('/api/v1/suppliers', { cookie: owner.cookie });
    const otherSupplierList = await request('/api/v1/suppliers', { cookie: other.cookie });
    assert.deepEqual(ownerSupplierList.json.mySuppliers.map((supplier) => supplier.id).sort(), [ownerSupplierOneId, ownerSupplierTwoId].sort(), 'owner sees only their private suppliers');
    assert.equal(ownerSupplierList.json.mySuppliers.some((supplier) => supplier.privateNotes === 'Other-member private note'), false, 'owner cannot read another member private notes');
    assert.deepEqual(otherSupplierList.json.mySuppliers.map((supplier) => supplier.id), [otherSupplierId], 'other member sees only their private suppliers');
    assert.equal(otherSupplierList.json.mySuppliers.some((supplier) => supplier.id === ownerSupplierOneId || supplier.id === ownerSupplierTwoId), false, 'other member cannot read owner suppliers');
    const rankedCandidates = await request('/api/v1/discovery/candidates?category=PRODUCT&area=Arusha', { cookie: owner.cookie });
    assert.equal(rankedCandidates.response.status, 200, `ranked discovery: ${JSON.stringify(rankedCandidates.json)}`);
    assert.ok(rankedCandidates.json.candidates.length <= 3, 'discovery shortlist is capped at three');
    assert.equal(rankedCandidates.json.candidates[0].id, ownerSupplierOneId, 'private member history ranks first');
    assert.equal(rankedCandidates.json.candidates.some((candidate) => candidate.id === otherSupplierId), false, 'discovery does not leak another member supplier');
    assert.equal(rankedCandidates.json.candidates[0].verifiedPaypalSupport, false, 'supplier history is not misrepresented as PayPal verification');

    const preferencePath = `/api/v1/budgets/${budgetId}/suppliers`;
    const savePreferences = async (cookie, supplierIds, key = randomUUID(), path = preferencePath) => request(path, {
      method: 'PUT', cookie, headers: { 'Idempotency-Key': key }, body: { supplierIds },
    });
    result = await savePreferences(owner.cookie, [ownerSupplierTwoId, ownerSupplierOneId]);
    assert.equal(result.response.status, 200, `save ranked supplier preferences: ${JSON.stringify(result.json)}`);
    assert.deepEqual(result.json.supplierIds, [ownerSupplierTwoId, ownerSupplierOneId], 'saved preference order is returned');
    const deduplicatedDiscovery = await request(`/api/v1/discovery/candidates?category=PRODUCT&area=Arusha&budgetId=${budgetId}`, { cookie: owner.cookie });
    const deduplicatedIds = deduplicatedDiscovery.json.candidates.map((candidate) => candidate.id);
    assert.equal(new Set(deduplicatedIds).size, deduplicatedIds.length, 'a private supplier preferred in the budget occupies only one shortlist slot');
    assert.equal(deduplicatedIds[0], ownerSupplierOneId, 'budget preferred history is promoted and deduplicated');
    assert.ok(deduplicatedDiscovery.json.candidates.length <= 3, 'deduplicated discovery remains capped at three');
    const rankedBudgets = await request('/api/v1/budgets', { cookie: owner.cookie });
    const rankedBudget = rankedBudgets.json.budgets.find((item) => item.id === budgetId);
    assert.deepEqual(rankedBudget.preferredSuppliers, [
      { supplierId: ownerSupplierTwoId, rank: 1 }, { supplierId: ownerSupplierOneId, rank: 2 },
    ], 'budget readback preserves preference ranking');
    result = await savePreferences(owner.cookie, [otherSupplierId], randomUUID());
    assert.equal(result.response.status, 400, 'member cannot rank another member private supplier');
    assert.equal(result.json.code, 'SUPPLIER_NOT_OWNED');
    const forbiddenBudgetUpdate = await savePreferences(other.cookie, [otherSupplierId], randomUUID());
    assert.equal(forbiddenBudgetUpdate.response.status, 404, 'member cannot modify another member budget preferences');
    const preferencesAfterRejection = await request('/api/v1/budgets', { cookie: owner.cookie });
    assert.deepEqual(preferencesAfterRejection.json.budgets.find((item) => item.id === budgetId).preferredSuppliers, [
      { supplierId: ownerSupplierTwoId, rank: 1 }, { supplierId: ownerSupplierOneId, rank: 2 },
    ], 'rejected cross-member changes leave the owner rankings unchanged');

    // Private supplier PATCH, stale version conflict, cross-member denial, and DELETE cascade (M1-H, AC-14)
    const patchPayload = {
      name: `Owner supplier one updated ${suffix}`,
      categories: ['PRODUCT'],
      serviceAreas: ['Arusha', 'Moshi Urban'],
      privateNotes: 'Updated owner-only note with revised terms',
    };
    const patchResult = await request(`/api/v1/member-suppliers/${ownerSupplierOneId}`, {
      method: 'PATCH', cookie: owner.cookie, headers: { 'If-Match': '"1"' }, body: patchPayload,
    });
    assert.equal(patchResult.response.status, 200, `supplier update: ${JSON.stringify(patchResult.json)}`);
    assert.equal(Number(patchResult.json.supplier.version), 2, 'supplier update increments version');
    assert.equal(patchResult.json.supplier.name, patchPayload.name);
    assert.deepEqual(patchResult.json.supplier.serviceAreas, patchPayload.serviceAreas);
    assert.equal(patchResult.json.supplier.privateNotes, patchPayload.privateNotes);

    const stalePatchResult = await request(`/api/v1/member-suppliers/${ownerSupplierOneId}`, {
      method: 'PATCH', cookie: owner.cookie, headers: { 'If-Match': '"1"' }, body: patchPayload,
    });
    assert.equal(stalePatchResult.response.status, 412, 'stale supplier version rejected');
    assert.equal(stalePatchResult.json.code, 'VERSION_CONFLICT');

    const crossMemberPatch = await request(`/api/v1/member-suppliers/${ownerSupplierOneId}`, {
      method: 'PATCH', cookie: other.cookie, headers: { 'If-Match': '"2"' }, body: patchPayload,
    });
    assert.equal(crossMemberPatch.response.status, 404, 'cross-member supplier update denied');

    const crossMemberDelete = await request(`/api/v1/member-suppliers/${ownerSupplierOneId}`, {
      method: 'DELETE', cookie: other.cookie, headers: { 'If-Match': '"2"' },
    });
    assert.equal(crossMemberDelete.response.status, 404, 'cross-member supplier delete denied');

    const ownerSupplierThree = await createPrivateSupplier(owner.cookie, {
      name: `Owner supplier three to delete ${suffix}`, categories: ['PRODUCT'], serviceAreas: ['Kilimanjaro'], privateNotes: 'Will be deleted',
    });
    const ownerSupplierThreeId = ownerSupplierThree.json.supplier.id;
    await savePreferences(owner.cookie, [ownerSupplierTwoId, ownerSupplierOneId, ownerSupplierThreeId]);
    const budgetBeforeDelete = (await request('/api/v1/budgets', { cookie: owner.cookie })).json.budgets.find((b) => b.id === budgetId);
    assert.equal(budgetBeforeDelete.preferredSuppliers.length, 3, 'three preferred suppliers before cascade delete');

    const deleteResult = await request(`/api/v1/member-suppliers/${ownerSupplierThreeId}`, {
      method: 'DELETE', cookie: owner.cookie, headers: { 'If-Match': '"1"' },
    });
    assert.equal(deleteResult.response.status, 204, 'supplier delete succeeds');

    const budgetAfterDelete = (await request('/api/v1/budgets', { cookie: owner.cookie })).json.budgets.find((b) => b.id === budgetId);
    assert.deepEqual(budgetAfterDelete.preferredSuppliers, [
      { supplierId: ownerSupplierTwoId, rank: 1 }, { supplierId: ownerSupplierOneId, rank: 2 },
    ], 'deleting a private supplier cascades to remove its budget preference ranking');

    const listAfterDelete = await request('/api/v1/suppliers', { cookie: owner.cookie });
    assert.equal(listAfterDelete.json.mySuppliers.some((s) => s.id === ownerSupplierThreeId), false, 'deleted supplier is no longer listed');

    result = await request('/api/v1/instructions', {
      method: 'POST', cookie: owner.cookie, headers: { 'Idempotency-Key': randomUUID() },
      body: { description: 'Cross-owner budget must be rejected', kind: 'ONE_TIME', category: 'PRODUCT', mode: 'REVIEW_REQUIRED', budgetId: otherBudgetId },
    });
    assert.equal(result.response.status, 400, 'a member cannot attach another member budget');
    assert.equal(result.json.code, 'BUDGET_UNAVAILABLE');

    const promptText = '  Fixture product request for the M1 acceptance journey  ';
    const instructionBody = { description: promptText, kind: 'ONE_TIME', category: 'PRODUCT', mode: 'REVIEW_REQUIRED', budgetId };
    const instructionSaveKey = randomUUID();
    result = await request('/api/v1/instructions', {
      method: 'POST', cookie: owner.cookie,
      headers: { 'Idempotency-Key': instructionSaveKey }, body: instructionBody,
    });
    assert.equal(result.response.status, 201, `draft create: ${JSON.stringify(result.json)}`);
    instructionId = result.json.instruction.id;
    const version = result.json.instruction.version;
    assert.equal(result.json.instruction.promptText, promptText, 'draft creation preserves exact prompt text');
    assert.equal(result.json.instruction.maxTotalMinor, budget.allocationLimitMinor, 'draft inherits its budget maximum');
    assert.equal(new Date(result.json.instruction.validFrom).toISOString(), new Date(budget.validFrom).toISOString(), 'draft inherits budget start');
    assert.equal(new Date(result.json.instruction.validUntil).toISOString(), new Date(budget.validUntil).toISOString(), 'draft inherits budget deadline');
    const retriedSave = await request('/api/v1/instructions', { method: 'POST', cookie: owner.cookie, headers: { 'Idempotency-Key': instructionSaveKey }, body: instructionBody });
    assert.equal(retriedSave.response.status, 201, 'retrying a completed draft save returns the saved result');
    assert.equal(retriedSave.json.instruction.id, instructionId, 'retry does not create a second instruction');
    const ownerInstructions = await request('/api/v1/instructions', { cookie: owner.cookie });
    assert.equal(ownerInstructions.json.instructions.find((item) => item.id === instructionId)?.promptText, promptText, 'list reload preserves exact prompt text');
    const otherInstructions = await request('/api/v1/instructions', { cookie: other.cookie });
    assert.equal(otherInstructions.json.instructions.some((item) => item.id === instructionId), false, 'another member cannot list the instruction');
    const validConfiguration = {
      description: promptText, memberCategory: 'OTHER', budgetId, maximumTotal: '250.00',
      validFromLocal: local(now), validUntilLocal: local(until), timezone: 'UTC',
      categoryDetails: { quantity: 1, variant: 'Fixture variant', deliveryBy: '', deliveryWindow: '2027-01-01', returnPolicy: '30 days' },
    };
    const tooHigh = await request(`/api/v1/instructions/${instructionId}/configuration`, {
      method: 'PATCH', cookie: owner.cookie, headers: { 'If-Match': `"${version}"` },
      body: { ...validConfiguration, maximumTotal: '1500.00' },
    });
    assert.equal(tooHigh.response.status, 400, 'instruction maximum above the budget is rejected');
    assert.equal(tooHigh.json.code, 'INSTRUCTION_EXCEEDS_BUDGET');
    const outsideBudgetDates = await request(`/api/v1/instructions/${instructionId}/configuration`, {
      method: 'PATCH', cookie: owner.cookie, headers: { 'If-Match': `"${version}"` },
      body: { ...validConfiguration, validFromLocal: local(new Date(budgetStart.getTime() - 3_600_000)) },
    });
    assert.equal(outsideBudgetDates.response.status, 400, 'instruction dates outside the budget window are rejected');
    assert.equal(outsideBudgetDates.json.code, 'INSTRUCTION_EXCEEDS_BUDGET_DATES');
    result = await request(`/api/v1/instructions/${instructionId}/configuration`, {
      method: 'PATCH', cookie: owner.cookie, headers: { 'If-Match': `"${version}"` },
      body: validConfiguration,
    });
    assert.equal(result.response.status, 200, `draft configuration: ${JSON.stringify(result.json)}`);
    const configured = result.json.instruction;
    assert.equal(configured.promptText, promptText, 'editing configuration preserves the original prompt exactly');
    const reloadedAfterEdit = await request('/api/v1/instructions', { cookie: owner.cookie });
    assert.equal(reloadedAfterEdit.json.instructions.find((item) => item.id === instructionId)?.promptText, promptText, 'edited draft reload preserves the original prompt exactly');
    const staleConfiguration = await request(`/api/v1/instructions/${instructionId}/configuration`, {
      method: 'PATCH', cookie: owner.cookie, headers: { 'If-Match': `"${version}"` }, body: validConfiguration,
    });
    assert.equal(staleConfiguration.response.status, 412, 'a stale draft version cannot overwrite saved configuration');

    await waitFor(async () => {
      const row = await pool.query("SELECT 1 FROM worker_heartbeats WHERE worker_id = $1 AND last_seen_at > now() - interval '5 seconds'", [workerIds[0]]);
      return row.rowCount === 1;
    }, 'worker heartbeat');
    result = await request(`/api/v1/instructions/${instructionId}/readiness`, { cookie: owner.cookie });
    assert.equal(result.response.status, 200);
    assert.equal(result.json.canActivate, false, 'real activation must remain disabled');
    assert.equal(result.json.canActivateFixture, true, `configured local fixture draft should be ready: ${JSON.stringify(result.json.fixtureBlockers)}`);

    result = await request(`/api/v1/instructions/${instructionId}/activate-fixture`, {
      method: 'POST', cookie: owner.cookie,
      headers: { 'Idempotency-Key': randomUUID(), 'If-Match': `"${configured.version}"` }, body: {},
    });
    assert.equal(result.response.status, 200, `fixture activation: ${JSON.stringify(result.json)}`);
    assert.equal(result.json.instruction.executionEnvironment, 'FIXTURE');

    const crossOwner = await request(`/api/v1/instructions/${instructionId}/readiness`, { cookie: other.cookie });
    assert.equal(crossOwner.response.status, 404, 'another member cannot read instruction readiness');
    const hiddenActivity = await request('/api/v1/activity', { cookie: other.cookie });
    assert.equal(hiddenActivity.response.status, 200);
    assert.equal(hiddenActivity.json.operations.length, 0, 'another member cannot see fixture operations');

    const activity = await waitFor(async () => {
      const response = await request('/api/v1/activity', { cookie: owner.cookie });
      return response.json.operations?.length ? response.json : null;
    }, 'fixture quote and approval');
    const operation = activity.operations[0];
    operationId = operation.id;
    quoteId = operation.quoteId;
    approvalId = operation.approvalId;
    assert.equal(operation.state, 'FIXTURE_AWAITING_REVIEW');
    assert.match(operation.quoteDetails.label, /not a real offer/i);
    assert.equal(operation.approvalStatus, 'PENDING');
    const approvalRead = await request(`/api/v1/approvals/${approvalId}`, { cookie: owner.cookie });
    assert.equal(approvalRead.response.status, 200, 'approval details are available through the read-only endpoint');
    assert.equal(approvalRead.json.readOnly, true, 'approval details endpoint declares its read-only behavior');
    assert.equal(approvalRead.json.approval.status, 'PENDING', 'opening approval details does not change pending state');
    const hiddenApproval = await request(`/api/v1/approvals/${approvalId}/fixture-decision`, {
      method: 'POST', cookie: other.cookie,
      headers: { 'Idempotency-Key': randomUUID(), 'If-Match': '"1"' }, body: { decision: 'APPROVE' },
    });
    assert.equal(hiddenApproval.response.status, 404, 'another member cannot decide an approval');

    const staleDecision = await request(`/api/v1/approvals/${approvalId}/fixture-decision`, {
      method: 'POST', cookie: owner.cookie,
      headers: { 'Idempotency-Key': randomUUID(), 'If-Match': '"9"' }, body: { decision: 'APPROVE' },
    });
    assert.equal(staleDecision.response.status, 412, 'stale approval versions are rejected');
    const approved = await request(`/api/v1/approvals/${approvalId}/fixture-decision`, {
      method: 'POST', cookie: owner.cookie,
      headers: { 'Idempotency-Key': randomUUID(), 'If-Match': `"${operation.approvalVersion}"` }, body: { decision: 'APPROVE' },
    });
    assert.equal(approved.response.status, 200, `fixture review: ${JSON.stringify(approved.json)}`);
    assert.equal(approved.json.operationState, 'FIXTURE_APPROVED');
    assert.equal(approved.json.fixtureOnly, true);

    const quoteDetails = { variant: 'Fixture variant', quantity: 1, deliveryWindow: '2027-01-01', returnPolicy: '30 days' };
    const quotePayload = {
      evidenceType: 'AUTHORITATIVE_QUOTE', sourceQuoteKey: `m2-source-${suffix}`, merchantRef: 'Fixture merchant', typedDetails: quoteDetails, quantity: 1,
      terms: { returnPolicy: '30 days' }, amounts: { subtotalMinor: '18000', taxMinor: '2000', shippingMinor: '0', feesMinor: '0', discountMinor: '0', totalMinor: '20000', currency: 'USD' },
    };
    const estimatedEvidence = await request(`/api/v1/instructions/${instructionId}/quotes`, { method: 'POST', cookie: owner.cookie, headers: { 'Idempotency-Key': randomUUID() }, body: { ...quotePayload, evidenceType: 'ESTIMATE' } });
    assert.equal(estimatedEvidence.response.status, 422, 'non-authoritative estimate cannot create a quote');
    assert.equal(estimatedEvidence.json.code, 'NON_AUTHORITATIVE_DISCOVERY_EVIDENCE');
    const arithmeticMismatch = await request(`/api/v1/instructions/${instructionId}/quotes`, { method: 'POST', cookie: owner.cookie, headers: { 'Idempotency-Key': randomUUID() }, body: { ...quotePayload, amounts: { ...quotePayload.amounts, totalMinor: '19999' } } });
    assert.equal(arithmeticMismatch.json.code, 'UNRECONCILED_QUOTE_ARITHMETIC');
    const currencyMismatch = await request(`/api/v1/instructions/${instructionId}/quotes`, { method: 'POST', cookie: owner.cookie, headers: { 'Idempotency-Key': randomUUID() }, body: { ...quotePayload, amounts: { ...quotePayload.amounts, currency: 'TZS' } } });
    assert.equal(currencyMismatch.json.code, 'CURRENCY_MISMATCH');
    const criteriaMismatch = await request(`/api/v1/instructions/${instructionId}/quotes`, { method: 'POST', cookie: owner.cookie, headers: { 'Idempotency-Key': randomUUID() }, body: { ...quotePayload, typedDetails: { ...quoteDetails, variant: 'Different variant' } } });
    assert.equal(criteriaMismatch.json.code, 'CATEGORY_CRITERIA_MISMATCH');
    const exceedsCeiling = await request(`/api/v1/instructions/${instructionId}/quotes`, { method: 'POST', cookie: owner.cookie, headers: { 'Idempotency-Key': randomUUID() }, body: { ...quotePayload, amounts: { ...quotePayload.amounts, subtotalMinor: '30000', taxMinor: '0', totalMinor: '30000' } } });
    assert.equal(exceedsCeiling.json.code, 'QUOTE_EXCEEDS_MAX_TOTAL');
    const quoteKey = randomUUID();
    const createdQuote = await request(`/api/v1/instructions/${instructionId}/quotes`, { method: 'POST', cookie: owner.cookie, headers: { 'Idempotency-Key': quoteKey }, body: quotePayload });
    assert.equal(createdQuote.response.status, 201, `authoritative fixture quote accepted: ${JSON.stringify(createdQuote.json)}`);
    assert.equal(createdQuote.json.fixtureOnly, true, 'quote creation is explicitly fixture-only');
    const createdQuoteRetry = await request(`/api/v1/instructions/${instructionId}/quotes`, { method: 'POST', cookie: owner.cookie, headers: { 'Idempotency-Key': quoteKey }, body: quotePayload });
    assert.equal(createdQuoteRetry.response.status, 200, 'quote creation retry replays the saved result');
    assert.equal(createdQuoteRetry.json.quoteId, createdQuote.json.quoteId);
    const quoteState = await pool.query('SELECT state FROM vendor_quote_lifecycle WHERE owner_id = $1 AND quote_id = $2', [ownerId, createdQuote.json.quoteId]);
    assert.equal(quoteState.rows[0].state, 'ACTIVE', 'new immutable quote starts with active lifecycle state');
    const concurrentDecisions = await Promise.all(['APPROVE', 'REJECT'].map((decision) => request(`/api/v1/approvals/${createdQuote.json.approvalId}/decide`, {
      method: 'POST', cookie: owner.cookie, headers: { 'Idempotency-Key': randomUUID(), 'If-Match': '"1"' }, body: { decision },
    })));
    assert.equal(concurrentDecisions.filter((item) => item.response.status === 200).length, 1, 'concurrent approve/reject race accepts exactly one winner');
    assert.ok(concurrentDecisions.every((item) => [200, 410, 412].includes(item.response.status)), 'concurrent loser is rejected as decided or stale');

    const expiredQuote = await request(`/api/v1/instructions/${instructionId}/quotes`, { method: 'POST', cookie: owner.cookie, headers: { 'Idempotency-Key': randomUUID() }, body: { ...quotePayload, sourceQuoteKey: `m2-expiry-${suffix}` } });
    assert.equal(expiredQuote.response.status, 201);
    await pool.query("UPDATE vendor_quote_lifecycle SET state = 'EXPIRED', changed_at = now() WHERE owner_id = $1 AND quote_id = $2", [ownerId, expiredQuote.json.quoteId]);
    const expiredDecision = await request(`/api/v1/approvals/${expiredQuote.json.approvalId}/decide`, { method: 'POST', cookie: owner.cookie, headers: { 'Idempotency-Key': randomUUID(), 'If-Match': '"1"' }, body: { decision: 'APPROVE' } });
    assert.equal(expiredDecision.response.status, 410, 'expired quote lifecycle blocks approval');
    const job = await pool.query('SELECT id FROM jobs WHERE instruction_id = $1 AND job_type = \'RUN_OCCURRENCE\' ORDER BY created_at DESC LIMIT 1', [instructionId]);
    assert.equal(job.rowCount, 1);
    jobId = job.rows[0].id;
    const quoteMutation = await pool.query('UPDATE vendor_quotes SET total_minor = total_minor + 1 WHERE id = $1', [quoteId]).then(() => null, (error) => error);
    assert.equal(quoteMutation?.code, '55000', 'stored quote evidence is immutable');

    await stop(workerChild);
    await pool.query(
      `UPDATE jobs SET state = 'RUNNING', lease_owner = $2, lease_expires_at = now() - interval '1 second',
         lease_generation = lease_generation + 1, updated_at = now() WHERE id = $1`,
      [jobId, workerIds[0]],
    );
    const restartedWorker = startWorker(1);
    await waitFor(async () => {
      const row = await pool.query("SELECT 1 FROM jobs WHERE id = $1 AND state = 'SUCCEEDED'", [jobId]);
      return row.rowCount === 1;
    }, 'expired lease recovery after worker restart');
    await stop(restartedWorker);

    const invalidatedQuote = await request(`/api/v1/instructions/${instructionId}/quotes`, { method: 'POST', cookie: owner.cookie, headers: { 'Idempotency-Key': randomUUID() }, body: { ...quotePayload, sourceQuoteKey: `m2-invalidated-${suffix}` } });
    assert.equal(invalidatedQuote.response.status, 201);
    const beforeAmendment = await request('/api/v1/instructions', { cookie: owner.cookie });
    const amendmentVersion = beforeAmendment.json.instructions.find((item) => item.id === instructionId).version;
    const amended = await request(`/api/v1/instructions/${instructionId}/configuration`, { method: 'PATCH', cookie: owner.cookie, headers: { 'If-Match': `"${amendmentVersion}"` }, body: { ...validConfiguration, description: 'Amended after quote review' } });
    assert.equal(amended.response.status, 200, 'material instruction amendment persists');
    const staleApprovalRead = await request(`/api/v1/approvals/${invalidatedQuote.json.approvalId}`, { cookie: owner.cookie });
    assert.equal(staleApprovalRead.response.status, 409, 'approval inspection blocks a stale agreement quote');
    const staleApprovalDecision = await request(`/api/v1/approvals/${invalidatedQuote.json.approvalId}/decide`, { method: 'POST', cookie: owner.cookie, headers: { 'Idempotency-Key': randomUUID(), 'If-Match': '"1"' }, body: { decision: 'APPROVE' } });
    assert.equal(staleApprovalDecision.response.status, 409, 'amendment invalidation blocks a stale quote decision');

    const identities = await pool.query(
      `SELECT (SELECT count(*)::int FROM instruction_occurrences WHERE instruction_id = $1) AS occurrences,
              (SELECT count(*)::int FROM procurement_obligations WHERE instruction_id = $1) AS obligations,
              (SELECT count(*)::int FROM purchase_operations WHERE instruction_id = $1) AS operations,
              (SELECT count(*)::int FROM vendor_quotes WHERE operation_id = $2) AS quotes,
              (SELECT count(*)::int FROM approvals WHERE operation_id = $2) AS approvals`,
      [instructionId, operationId],
    );
    assert.deepEqual(identities.rows[0], { occurrences: 1, obligations: 4, operations: 4, quotes: 1, approvals: 1 }, 'restart replay keeps the occurrence identity unique alongside separately keyed M2 quote operations');
    let instructionState = await request('/api/v1/instructions', { cookie: owner.cookie });
    let lifecycleInstruction = instructionState.json.instructions.find((item) => item.id === instructionId);
    assert.equal(lifecycleInstruction.state, 'ACTIVE');
    let lifecycle = await request(`/api/v1/instructions/${instructionId}/pause`, {
      method: 'POST', cookie: owner.cookie,
      headers: { 'Idempotency-Key': randomUUID(), 'If-Match': `"${lifecycleInstruction.version}"` }, body: {},
    });
    assert.equal(lifecycle.response.status, 200, `fixture pause: ${JSON.stringify(lifecycle.json)}`);
    assert.equal(lifecycle.json.instruction.state, 'PAUSED');
    lifecycle = await request(`/api/v1/instructions/${instructionId}/resume`, {
      method: 'POST', cookie: owner.cookie,
      headers: { 'Idempotency-Key': randomUUID(), 'If-Match': `"${lifecycle.json.instruction.version}"` }, body: {},
    });
    assert.equal(lifecycle.response.status, 200, `fixture resume: ${JSON.stringify(lifecycle.json)}`);
    assert.equal(lifecycle.json.instruction.state, 'ACTIVE');
    lifecycle = await request(`/api/v1/instructions/${instructionId}/revoke`, {
      method: 'POST', cookie: owner.cookie,
      headers: { 'Idempotency-Key': randomUUID(), 'If-Match': `"${lifecycle.json.instruction.version}"` }, body: {},
    });
    assert.equal(lifecycle.response.status, 200, `fixture revoke: ${JSON.stringify(lifecycle.json)}`);
    assert.equal(lifecycle.json.instruction.state, 'CANCELLED');

    startWorker(0);
    const dueAt = new Date(Date.now() - 60_000);
    result = await request('/api/v1/instructions', {
      method: 'POST', cookie: owner.cookie,
      headers: { 'Idempotency-Key': randomUUID() },
      body: { description: 'Monthly fixture utility bill cycle', kind: 'RECURRING_BILL', category: 'BILL', mode: 'NOTIFY_ONLY', budgetId },
    });
    assert.equal(result.response.status, 201, `recurring bill draft: ${JSON.stringify(result.json)}`);
    const recurringId = result.json.instruction.id;
    const recurringDraftVersion = result.json.instruction.version;
    const validFrom = new Date(Date.now() - 120_000);
    const validUntil = new Date(Date.now() + 80 * 86_400_000);
    const dueLocal = local(dueAt);
    result = await request(`/api/v1/instructions/${recurringId}/configuration`, {
      method: 'PATCH', cookie: owner.cookie, headers: { 'If-Match': `"${recurringDraftVersion}"` },
      body: {
        description: 'Monthly fixture utility bill cycle', memberCategory: 'OTHER',
        budgetId, maximumTotal: '30.00', validFromLocal: local(validFrom), validUntilLocal: local(validUntil), timezone: 'UTC',
        categoryDetails: { payeeName: 'Fixture utility provider', dueAtLocal: dueLocal, invoiceLabel: 'fixture cycle' },
      },
    });
    assert.equal(result.response.status, 200, `recurring bill schedule: ${JSON.stringify(result.json)}`);
    const recurringConfigured = result.json.instruction;
    result = await request(`/api/v1/instructions/${recurringId}/readiness`, { cookie: owner.cookie });
    assert.equal(result.json.canActivateFixture, true, `monthly bill should be fixture-ready: ${JSON.stringify(result.json.fixtureBlockers)}`);
    result = await request(`/api/v1/instructions/${recurringId}/activate-fixture`, {
      method: 'POST', cookie: owner.cookie,
      headers: { 'Idempotency-Key': randomUUID(), 'If-Match': `"${recurringConfigured.version}"` }, body: {},
    });
    assert.equal(result.response.status, 200, `recurring fixture activation: ${JSON.stringify(result.json)}`);
    await waitFor(async () => {
      const row = await pool.query('SELECT count(*)::int AS count FROM purchase_operations WHERE owner_id = $1 AND instruction_id = $2', [ownerId, recurringId]);
      return row.rows[0].count > 0;
    }, 'first recurring bill fixture cycle');
    const recurringState = await pool.query(
      'SELECT schedule_config, next_run_at FROM procurement_instructions WHERE id = $1 AND owner_id = $2', [recurringId, ownerId],
    );
    assert.equal(recurringState.rows[0].schedule_config.frequency, 'MONTHLY');
    assert.ok(recurringState.rows[0].next_run_at > new Date(), 'worker should advance a monthly cycle to the next eligible due date');
    const recurringNext = new Date(recurringState.rows[0].next_run_at);
    const scheduledDay = recurringState.rows[0].schedule_config.dayOfMonth;
    const currentMonth = dueAt.getUTCMonth();
    const nextMonthDate = new Date(Date.UTC(dueAt.getUTCFullYear(), currentMonth + 1, 1));
    const lastDay = new Date(Date.UTC(nextMonthDate.getUTCFullYear(), nextMonthDate.getUTCMonth() + 1, 0)).getUTCDate();
    assert.equal(recurringNext.getUTCDate(), Math.min(scheduledDay, lastDay), 'monthly schedule preserves the selected day, clamped to the month end');
    assert.equal(recurringNext.getUTCHours(), dueAt.getUTCHours());
    assert.equal(recurringNext.getUTCMinutes(), dueAt.getUTCMinutes());

    result = await request('/api/v1/instructions', {
      method: 'POST', cookie: owner.cookie,
      headers: { 'Idempotency-Key': randomUUID() },
      body: { description: 'Pre-approved fixture product simulation', kind: 'ONE_TIME', category: 'PRODUCT', mode: 'PRE_APPROVED', budgetId },
    });
    assert.equal(result.response.status, 201, `pre-approved fixture draft: ${JSON.stringify(result.json)}`);
    const preApprovedId = result.json.instruction.id;
    const preApprovedVersion = result.json.instruction.version;
    result = await request(`/api/v1/instructions/${preApprovedId}/configuration`, {
      method: 'PATCH', cookie: owner.cookie, headers: { 'If-Match': `"${preApprovedVersion}"` },
      body: {
        description: 'Pre-approved fixture product simulation', memberCategory: 'OTHER',
        budgetId, maximumTotal: '50.00', validFromLocal: local(validFrom), validUntilLocal: local(validUntil), timezone: 'UTC',
        categoryDetails: { quantity: 1, variant: 'Simulated', deliveryBy: '' }, softReviewThresholdMinor: '1000',
      },
    });
    assert.equal(result.response.status, 200, `pre-approved fixture configuration: ${JSON.stringify(result.json)}`);
    const preApprovedConfigured = result.json.instruction;
    result = await request(`/api/v1/instructions/${preApprovedId}/activate-fixture`, {
      method: 'POST', cookie: owner.cookie,
      headers: { 'Idempotency-Key': randomUUID(), 'If-Match': `"${preApprovedConfigured.version}"` }, body: {},
    });
    assert.equal(result.response.status, 200, `pre-approved fixture activation: ${JSON.stringify(result.json)}`);
    const preApprovedOperation = await waitFor(async () => {
      const activity = await request('/api/v1/activity', { cookie: owner.cookie });
      return activity.json.operations?.find((item) => item.instructionId === preApprovedId) ?? null;
    }, 'pre-approved fixture simulation');
    assert.equal(preApprovedOperation.state, 'FIXTURE_AWAITING_REVIEW', 'PRE_APPROVED quote above the soft review threshold requires explicit review');
    assert.equal(preApprovedOperation.approvalStatus, 'PENDING');
    assert.match(preApprovedOperation.quoteDetails.label, /not a real offer/i);

    result = await request('/api/v1/instructions', {
      method: 'POST', cookie: owner.cookie,
      headers: { 'Idempotency-Key': randomUUID() },
      body: { description: 'Notify me if a suitable stay fixture appears', kind: 'WATCH', category: 'ACCOMMODATION', mode: 'NOTIFY_ONLY', budgetId },
    });
    assert.equal(result.response.status, 201, `watch fixture draft: ${JSON.stringify(result.json)}`);
    const watchId = result.json.instruction.id;
    const watchVersion = result.json.instruction.version;
    result = await request(`/api/v1/instructions/${watchId}/configuration`, {
      method: 'PATCH', cookie: owner.cookie, headers: { 'If-Match': `"${watchVersion}"` },
      body: {
        description: 'Notify me if a suitable stay fixture appears', memberCategory: 'OTHER',
        budgetId, maximumTotal: '100.00', validFromLocal: local(validFrom), validUntilLocal: local(validUntil), timezone: 'UTC',
        categoryDetails: { destination: 'Arusha', checkIn: '2027-02-14', checkOut: '2027-02-16', guests: 2, rooms: 1, cancellationPreference: 'ANY' },
      },
    });
    assert.equal(result.response.status, 200, `watch fixture configuration: ${JSON.stringify(result.json)}`);
    result = await request(`/api/v1/instructions/${watchId}/readiness`, { cookie: owner.cookie });
    assert.equal(result.json.canActivateFixture, true, `notify-only watch should be fixture-ready: ${JSON.stringify(result.json.fixtureBlockers)}`);
    const watchConfigured = await request('/api/v1/instructions', { cookie: owner.cookie });
    const watchInstruction = watchConfigured.json.instructions.find((item) => item.id === watchId);
    result = await request(`/api/v1/instructions/${watchId}/activate-fixture`, {
      method: 'POST', cookie: owner.cookie,
      headers: { 'Idempotency-Key': randomUUID(), 'If-Match': `"${watchInstruction.version}"` }, body: {},
    });
    assert.equal(result.response.status, 200, `watch fixture activation: ${JSON.stringify(result.json)}`);
    const watchObservation = await waitFor(async () => {
      const activity = await request('/api/v1/activity', { cookie: owner.cookie });
      return activity.json.observations?.find((item) => item.instructionId === watchId) ?? null;
    }, 'synthetic notify-only watch observation');
    assert.equal(watchObservation.details.fixture, true);
    assert.match(watchObservation.details.label, /no real vendor search/i);
    const notifyOnlyOutcomes = await pool.query(`SELECT count(DISTINCT o.id)::int AS operations, count(DISTINCT a.id)::int AS approvals
      FROM procurement_instructions i LEFT JOIN purchase_operations o ON o.instruction_id = i.id LEFT JOIN approvals a ON a.operation_id = o.id WHERE i.id = $1`, [watchId]);
    assert.deepEqual(notifyOnlyOutcomes.rows[0], { operations: 0, approvals: 0 }, 'NOTIFY_ONLY watch never creates purchase operations or approvals');

    let reviewWatch = await request('/api/v1/instructions', { method: 'POST', cookie: owner.cookie, headers: { 'Idempotency-Key': randomUUID() }, body: {
      description: 'Review only when the Arusha stay matches all agreed criteria', kind: 'WATCH', category: 'ACCOMMODATION', mode: 'REVIEW_REQUIRED', budgetId,
    } });
    assert.equal(reviewWatch.response.status, 201, `review watch draft: ${JSON.stringify(reviewWatch.json)}`);
    const reviewWatchId = reviewWatch.json.instruction.id;
    const reviewWatchConfig = await request(`/api/v1/instructions/${reviewWatchId}/configuration`, { method: 'PATCH', cookie: owner.cookie, headers: { 'If-Match': `"${reviewWatch.json.instruction.version}"` }, body: {
      description: 'Review only when the Arusha stay matches all agreed criteria', memberCategory: 'OTHER', budgetId, maximumTotal: '100.00',
      validFromLocal: local(validFrom), validUntilLocal: local(validUntil), timezone: 'UTC', watchFrequency: 'INTERVAL', watchIntervalMinutes: 5,
      categoryDetails: { destination: 'Arusha', checkIn: '2027-02-14', checkOut: '2027-02-16', guests: 2, rooms: 1, cancellationPreference: 'ANY' },
    } });
    assert.equal(reviewWatchConfig.response.status, 200, `review watch configuration: ${JSON.stringify(reviewWatchConfig.json)}`);
    const reviewWatchDraft = await request('/api/v1/instructions', { cookie: owner.cookie });
    const reviewWatchVersion = reviewWatchDraft.json.instructions.find((item) => item.id === reviewWatchId).version;
    const activateReviewWatch = await request(`/api/v1/instructions/${reviewWatchId}/activate-fixture`, { method: 'POST', cookie: owner.cookie,
      headers: { 'Idempotency-Key': randomUUID(), 'If-Match': `"${reviewWatchVersion}"` }, body: {},
    });
    assert.equal(activateReviewWatch.response.status, 200, `review watch activation: ${JSON.stringify(activateReviewWatch.json)}`);
    const noMatch = await waitFor(async () => {
      const row = await pool.query(`SELECT i.state, i.next_run_at, count(DISTINCT o.id)::int AS operations, count(DISTINCT a.id)::int AS approvals
        FROM procurement_instructions i LEFT JOIN purchase_operations o ON o.instruction_id = i.id LEFT JOIN approvals a ON a.operation_id = o.id
        WHERE i.id = $1 GROUP BY i.id`, [reviewWatchId]);
      const audit = await pool.query("SELECT 1 FROM audit_events WHERE instruction_id = $1 AND action = 'WATCH_NO_MATCH_CONTINUING'", [reviewWatchId]);
      return audit.rowCount ? { ...row.rows[0], audited: true } : null;
    }, 'review watch no-match continuation');
    assert.equal(noMatch.state, 'ACTIVE', 'unmatched review watch remains active within its validity window');
    assert.ok(new Date(noMatch.next_run_at) > new Date(), 'unmatched review watch is scheduled to continue polling');
    assert.equal(noMatch.operations, 0, 'no-match watch creates no purchase operation');
    assert.equal(noMatch.approvals, 0, 'no-match watch creates no approval');

    const fixtureAdapter = await pool.query("SELECT id, adapter_version FROM vendor_adapters WHERE adapter_key = 'local-fixture' AND environment = 'FIXTURE' LIMIT 1");
    const staleContentHash = createHash('sha256').update(`expired-quote-${suffix}`).digest('hex');
    const staleTermsHash = createHash('sha256').update('expired-terms').digest('hex');
    const staleQuote = await pool.query(`INSERT INTO vendor_quotes
      (owner_id, operation_id, adapter_id, adapter_version, environment, merchant_ref, external_quote_ref, category, schema_version, typed_details, currency,
       subtotal_minor, tax_minor, fees_minor, shipping_minor, discount_minor, total_minor, quantity, terms_hash, content_hash, verified_at, expires_at)
      VALUES ($1, $2, $3, $4, 'FIXTURE', 'fixture-expired-merchant', $5, 'PRODUCT', 'm2-expiry-test', '{}'::jsonb, 'USD',
       1000, 0, 0, 0, 0, 1000, 1, $6, $7, now() - interval '2 days', now() - interval '1 day') RETURNING id`,
      [ownerId, operationId, fixtureAdapter.rows[0].id, fixtureAdapter.rows[0].adapter_version, `expired-${suffix}`, staleTermsHash, staleContentHash]);
    const staleApproval = await pool.query(`INSERT INTO approvals (owner_id, operation_id, quote_id, quote_hash, permission_version, status, expires_at)
      SELECT $1, $2, $3, $4, permission_version, 'PENDING', now() + interval '1 day' FROM procurement_instructions WHERE id = $5 AND owner_id = $1 RETURNING id`,
      [ownerId, operationId, staleQuote.rows[0].id, staleContentHash, instructionId]);
    const expirySweep = await waitFor(async () => {
      const state = await pool.query(`SELECT l.state AS quote_state, a.status AS approval_status
        FROM vendor_quote_lifecycle l JOIN approvals a ON a.quote_id = l.quote_id AND a.owner_id = l.owner_id
        WHERE l.owner_id = $1 AND l.quote_id = $2 AND a.id = $3`, [ownerId, staleQuote.rows[0].id, staleApproval.rows[0].id]);
      return state.rows[0]?.quote_state === 'EXPIRED' && state.rows[0]?.approval_status === 'EXPIRED' ? state.rows[0] : null;
    }, 'expired quote and approval sweep', 250);
    assert.deepEqual(expirySweep, { quote_state: 'EXPIRED', approval_status: 'EXPIRED' }, 'worker expiry sweep transitions quote lifecycle and approval together');

    await stop(workerChild);
    const matchingWatch = await request('/api/v1/instructions', { method: 'POST', cookie: owner.cookie, headers: { 'Idempotency-Key': randomUUID() }, body: {
      description: 'Review a matching Arusha stay offer', kind: 'WATCH', category: 'ACCOMMODATION', mode: 'REVIEW_REQUIRED', budgetId,
    } });
    assert.equal(matchingWatch.response.status, 201);
    const matchingWatchId = matchingWatch.json.instruction.id;
    const matchingConfig = await request(`/api/v1/instructions/${matchingWatchId}/configuration`, { method: 'PATCH', cookie: owner.cookie, headers: { 'If-Match': `"${matchingWatch.json.instruction.version}"` }, body: {
      description: 'Review a matching Arusha stay offer', memberCategory: 'OTHER', budgetId, maximumTotal: '100.00',
      validFromLocal: local(validFrom), validUntilLocal: local(validUntil), timezone: 'UTC',
      categoryDetails: { destination: 'Arusha', checkIn: '2027-02-14', checkOut: '2027-02-16', guests: 2, rooms: 1, cancellationPreference: 'ANY' },
    } });
    assert.equal(matchingConfig.response.status, 200);
    const matchingVersion = matchingConfig.json.instruction.version;
    const matchingActivation = await request(`/api/v1/instructions/${matchingWatchId}/activate-fixture`, { method: 'POST', cookie: owner.cookie,
      headers: { 'Idempotency-Key': randomUUID(), 'If-Match': `"${matchingVersion}"` }, body: {},
    });
    assert.equal(matchingActivation.response.status, 200);
    await pool.query('UPDATE procurement_instructions SET next_run_at = NULL WHERE id = $1 AND owner_id = $2', [matchingWatchId, ownerId]);
    const candidateOffer = {
      sourceQuoteKey: `match-${suffix}`, merchantRef: 'Fixture Arusha stay', typedDetails: { destination: 'Arusha', checkIn: '2027-02-14', checkOut: '2027-02-16', guests: 2, rooms: 1, rateType: 'standard', cancellationTerms: 'Free cancellation until 24 hours before arrival' },
      amounts: { subtotalMinor: '6000', taxMinor: '0', shippingMinor: '0', feesMinor: '0', discountMinor: '0', totalMinor: '6000', currency: 'USD' }, terms: { cancellationTerms: 'Free cancellation until 24 hours before arrival' },
    };
    const candidateJobKey = `m2-watch-match:${matchingWatchId}:${suffix}`;
    const matchingScheduleVersion = await pool.query('SELECT permission_version FROM procurement_instructions WHERE id = $1 AND owner_id = $2', [matchingWatchId, ownerId]);
    await pool.query(`INSERT INTO jobs (owner_id, instruction_id, job_type, dedupe_key, payload, run_at)
      VALUES ($1, $2, 'OBSERVE', $3, $4::jsonb, now())`, [ownerId, matchingWatchId, candidateJobKey, JSON.stringify({ occurrenceKey: `m2:${suffix}`, dueAt: new Date().toISOString(), scheduleVersion: Number(matchingScheduleVersion.rows[0].permission_version), candidateOffer })]);
    startWorker(1);
    const matchingOperation = await waitFor(async () => {
      const activity = await request('/api/v1/activity', { cookie: owner.cookie });
      return activity.json.operations?.find((item) => item.instructionId === matchingWatchId) ?? null;
    }, 'matching accommodation watch quote');
    assert.equal(matchingOperation.state, 'FIXTURE_AWAITING_REVIEW', 'matching review-required watch creates a review operation');
    assert.equal(matchingOperation.approvalStatus, 'PENDING', 'matching review-required watch creates a pending approval');
    const matchCount = await pool.query(`SELECT count(*)::int AS count FROM vendor_quotes q JOIN purchase_operations o ON o.id = q.operation_id WHERE o.instruction_id = $1`, [matchingWatchId]);
    assert.equal(matchCount.rows[0].count, 1, 'matching watch produces exactly one quote');

    const adapter = await pool.query("SELECT execution_enabled FROM vendor_adapters WHERE adapter_key = 'local-fixture' AND environment = 'FIXTURE'");
    assert.equal(adapter.rows[0].execution_enabled, false, 'fixture adapter never enables provider execution');
    console.log('M1 fixture workflow passed: exact prompt persistence, idempotent draft save, budget maximum/date inheritance and bounds, stale draft rejection, private supplier isolation and idempotency, ranked budget supplier preferences and owner-only enforcement, cross-member denial, owner-scoped activation, immutable synthetic quote, quote-bound review, stale-decision rejection, expired-lease recovery, single occurrence/obligation/operation/quote/approval identity, monthly schedule advancement, notify-only watch observation, PRE_APPROVED fixture simulation, and pause/resume/revoke. No vendor or payment API was called.');
  } finally {
    await stop(workerChild);
    await stop(apiChild);
    for (const workerId of workerIds) await pool.query('DELETE FROM worker_heartbeats WHERE worker_id = $1', [workerId]);
    await cleanTestFixtures();
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
