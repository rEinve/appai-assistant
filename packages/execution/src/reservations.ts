import { createHash } from 'node:crypto';
import type { PoolClient } from 'pg';
import { evaluateSpendingPolicy, stableExecutionKey, stableCancellationKey } from '../../domain/src/index';

export type SandboxFaultMode = 'NONE' | 'LOST_RESPONSE_AFTER_SUCCESS' | 'CRASH_BEFORE_REFS' | 'PAYMENT_CAPTURED_VENDOR_PENDING' | 'DEFINITIVE_FAILURE';

export interface PreparedExecution {
  status: 'PREPARED' | 'BLOCKED' | 'ALREADY_SUBMITTED';
  operationId: string;
  reason?: string;
  stableRequestKey?: string;
  reservationId?: string;
  amountMinor?: string;
  currency?: string;
  environment?: 'FIXTURE';
}

/**
 * Transaction phase one and pre-dispatch fencing. The caller owns BEGIN/COMMIT;
 * no adapter I/O is performed here. All contention is serialized on the budget.
 */
export async function prepareLocalExecution(db: PoolClient, ownerId: string, operationId: string): Promise<PreparedExecution> {
  const identity = await db.query<{
    instructionId: string; budgetId: string; currency: string; policyId: string | null;
  }>(`SELECT o.instruction_id AS "instructionId", i.budget_id AS "budgetId", i.currency,
             bp.id AS "policyId"
      FROM purchase_operations o
      JOIN procurement_instructions i ON i.id = o.instruction_id AND i.owner_id = o.owner_id
      LEFT JOIN budget_policies bp ON bp.owner_id = i.owner_id AND bp.currency = i.currency
      WHERE o.id = $1 AND o.owner_id = $2`, [operationId, ownerId]);
  const ids = identity.rows[0];
  if (!ids) return { status: 'BLOCKED', operationId, reason: 'OPERATION_NOT_FOUND' };

  const instruction = await db.query<{
    state: string; mode: string; permissionVersion: string; budgetId: string; currency: string;
    maximum: string; kind: string; completionLimit: number | null; fulfilledCount: number;
    fundingMandateId: string | null; vendorAccountId: string | null; validUntil: Date | null; timezone: string;
  }>(`SELECT state, mode, permission_version AS "permissionVersion", budget_id AS "budgetId", currency,
             max_total_minor::text AS maximum, kind, completion_limit AS "completionLimit",
             fulfilled_count AS "fulfilledCount", funding_mandate_id AS "fundingMandateId",
             vendor_account_id AS "vendorAccountId",
             valid_until AS "validUntil", timezone_snapshot AS timezone
      FROM procurement_instructions WHERE id = $1 AND owner_id = $2 FOR UPDATE`, [ids.instructionId, ownerId]);
  const inst = instruction.rows[0];
  if (!inst) return blockOperation(db, ownerId, operationId, 'INSTRUCTION_NOT_FOUND');

  const operation = await db.query<{
    state: string; permissionVersion: string; policyVersion: string; quoteId: string | null;
    obligationId: string; reservationId: string | null;
  }>(`SELECT state, permission_version AS "permissionVersion", policy_version AS "policyVersion",
             selected_quote_id AS "quoteId", obligation_id AS "obligationId", reservation_id AS "reservationId"
      FROM purchase_operations WHERE id = $1 AND owner_id = $2 FOR UPDATE`, [operationId, ownerId]);
  const op = operation.rows[0];
  if (!op) return { status: 'BLOCKED', operationId, reason: 'OPERATION_NOT_FOUND' };
  if (['SUBMITTING', 'RECONCILING', 'SUCCEEDED'].includes(op.state)) {
    const current = await db.query<{ stableRequestKey: string; reservationId: string | null; amountMinor: string; currency: string }>(
      `SELECT stable_request_key AS "stableRequestKey", r.id AS "reservationId", r.amount_minor::text AS "amountMinor", r.currency
       FROM execution_attempts a LEFT JOIN budget_reservations r ON r.operation_id = a.operation_id AND r.owner_id = a.owner_id
       WHERE a.operation_id = $1 AND a.owner_id = $2`, [operationId, ownerId]);
    const attempt = current.rows[0];
    return attempt ? { status: 'ALREADY_SUBMITTED', operationId, stableRequestKey: attempt.stableRequestKey,
      reservationId: attempt.reservationId ?? undefined, amountMinor: attempt.amountMinor, currency: attempt.currency.trim(), environment: 'FIXTURE' }
      : blockOperation(db, ownerId, operationId, 'ATTEMPT_STATE_INCONSISTENT');
  }
  if (inst.state !== 'ACTIVE') return blockOperation(db, ownerId, operationId, 'INSTRUCTION_NOT_ACTIVE');
  if (inst.validUntil && inst.validUntil <= new Date()) return blockOperation(db, ownerId, operationId, 'INSTRUCTION_EXPIRED');
  if (inst.fulfilledCount >= (inst.completionLimit ?? Number.MAX_SAFE_INTEGER)) return blockOperation(db, ownerId, operationId, 'COMPLETION_LIMIT_REACHED');
  if (!['READY', 'FIXTURE_APPROVED'].includes(op.state)) return blockOperation(db, ownerId, operationId, 'OPERATION_NOT_READY');
  if (Number(op.permissionVersion) !== Number(inst.permissionVersion)) return blockOperation(db, ownerId, operationId, 'STALE_PERMISSION_VERSION');

  const controls = await db.query<{ enabled: boolean }>(`SELECT new_execution_enabled AS enabled
    FROM runtime_execution_controls WHERE singleton_key='GLOBAL' FOR UPDATE`);
  if (controls.rows[0]?.enabled === false) return blockOperation(db, ownerId, operationId, 'EXECUTION_PAUSED');
  const adapter = await db.query<{ id: string; adapterVersion: string; circuitState: string }>(
    `SELECT id, adapter_version AS "adapterVersion", circuit_state AS "circuitState" FROM vendor_adapters
     WHERE adapter_key='local-fixture' AND environment='FIXTURE' AND enabled=true AND execution_enabled=false AND status='VERIFIED' FOR UPDATE`);
  if (adapter.rows[0]?.circuitState === 'OPEN') return blockOperation(db, ownerId, operationId, 'ADAPTER_CIRCUIT_OPEN');
  if (!adapter.rows[0]) return blockOperation(db, ownerId, operationId, 'LOCAL_SANDBOX_ADAPTER_UNAVAILABLE');

  if (inst.vendorAccountId) {
    const account = await db.query<{ status: string }>(
      'SELECT session_status AS status FROM vendor_accounts WHERE owner_id=$1 AND id=$2 FOR UPDATE', [ownerId, inst.vendorAccountId]);
    if (account.rows[0]?.status !== 'ACTIVE') return blockOperation(db, ownerId, operationId,
      account.rows[0]?.status === 'REAUTH_REQUIRED' || account.rows[0]?.status === 'EXPIRED' ? 'REAUTH_REQUIRED' : 'VENDOR_SESSION_NOT_ACTIVE');
  }

  const budget = await db.query<{ currency: string; allocationLimit: string }>(
    `SELECT currency, allocation_limit_minor::text AS "allocationLimit" FROM budgets
     WHERE id = $1 AND owner_id = $2 AND active = true FOR UPDATE`, [inst.budgetId, ownerId]);
  const b = budget.rows[0];
  if (!b) return blockOperation(db, ownerId, operationId, 'BUDGET_NOT_ACTIVE');
  const policyRes = await db.query<{
    id: string; currency: string; perOrder: string; daily: string; unit: string | null; soft: string | null; timezone: string; version: string;
  }>(`SELECT id, currency, per_order_hard_limit_minor::text AS "perOrder", daily_limit_minor::text AS daily,
             unit_limit_minor::text AS unit, soft_review_threshold_minor::text AS soft, timezone, version::text AS version
      FROM budget_policies WHERE owner_id = $1 AND currency = $2 FOR UPDATE`, [ownerId, inst.currency.trim()]);
  const policy = policyRes.rows[0];
  if (!policy) return blockOperation(db, ownerId, operationId, 'BUDGET_POLICY_NOT_CONFIGURED');

  const windowRes = await db.query<{ localDate: string; startsAt: Date; endsAt: Date }>(
    `SELECT (now() AT TIME ZONE $1)::date::text AS "localDate",
            ((now() AT TIME ZONE $1)::date::timestamp AT TIME ZONE $1) AS "startsAt",
            (((now() AT TIME ZONE $1)::date + 1)::timestamp AT TIME ZONE $1) AS "endsAt"`, [policy.timezone]);
  const win = windowRes.rows[0]!;
  await db.query(`INSERT INTO budget_windows(owner_id, policy_id, local_date, timezone_snapshot, starts_at, ends_at, policy_version)
    VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(policy_id, starts_at, ends_at) DO NOTHING`,
    [ownerId, policy.id, win.localDate, policy.timezone, win.startsAt, win.endsAt, policy.version]);
  const budgetWindow = await db.query<{ id: string }>(
    `SELECT id FROM budget_windows WHERE owner_id = $1 AND policy_id = $2 AND starts_at = $3 AND ends_at = $4 FOR UPDATE`,
    [ownerId, policy.id, win.startsAt, win.endsAt]);
  const windowId = budgetWindow.rows[0]!.id;

  const quoteRes = await db.query<{
    quoteId: string; totalMinor: string; subtotalMinor: string; quantity: number; currency: string;
    quoteHash: string; quoteExpiry: Date; quoteState: string;
  }>(`SELECT q.id AS "quoteId", q.total_minor::text AS "totalMinor", q.subtotal_minor::text AS "subtotalMinor",
             q.quantity, q.currency, q.content_hash AS "quoteHash", q.expires_at AS "quoteExpiry",
             COALESCE(l.state, 'ACTIVE') AS "quoteState"
      FROM vendor_quotes q LEFT JOIN vendor_quote_lifecycle l ON l.owner_id = q.owner_id AND l.quote_id = q.id
      WHERE q.owner_id = $1 AND q.operation_id = $2 AND q.id = $3 FOR UPDATE OF q`, [ownerId, operationId, op.quoteId]);
  const quote = quoteRes.rows[0];
  if (!quote) return blockOperation(db, ownerId, operationId, 'QUOTE_NOT_FOUND');
  if (quote.quoteState !== 'ACTIVE' || quote.quoteExpiry <= new Date()) return blockOperation(db, ownerId, operationId, 'QUOTE_EXPIRED_OR_INVALIDATED');
  if (quote.currency.trim() !== inst.currency.trim() || quote.currency.trim() !== b.currency.trim() || quote.currency.trim() !== policy.currency.trim()) {
    return blockOperation(db, ownerId, operationId, 'CURRENCY_MISMATCH');
  }

  const amounts = await db.query<{ budgetNet: string; activeBudget: string; dailyNet: string; activeDaily: string }>(
    `SELECT
       COALESCE((SELECT SUM(CASE WHEN kind='SPEND' THEN amount_minor ELSE -amount_minor END)
         FROM budget_entries WHERE owner_id=$1 AND budget_id=$2), 0)::text AS "budgetNet",
       COALESCE((SELECT SUM(amount_minor) FROM budget_reservations WHERE owner_id=$1 AND budget_id=$2 AND status='ACTIVE'), 0)::text AS "activeBudget",
       COALESCE((SELECT SUM(CASE WHEN kind='SPEND' THEN amount_minor ELSE -amount_minor END)
         FROM budget_entries WHERE owner_id=$1 AND budget_window_id=$3), 0)::text AS "dailyNet",
       COALESCE((SELECT SUM(r.amount_minor) FROM budget_reservations r
         LEFT JOIN budget_windows w ON w.owner_id=r.owner_id AND w.id=r.budget_window_id
         WHERE r.owner_id=$1 AND r.status='ACTIVE'
           AND (r.budget_window_id IS NULL OR w.policy_id=$4)), 0)::text AS "activeDaily"`,
    [ownerId, inst.budgetId, windowId, policy.id]);
  const used = amounts.rows[0]!;
  const budgetAvailable = BigInt(b.allocationLimit) - BigInt(used.budgetNet) - BigInt(used.activeBudget);
  const dailyAvailable = BigInt(policy.daily) - BigInt(used.dailyNet) - BigInt(used.activeDaily);
  const unitPrice = ((BigInt(quote.subtotalMinor) + BigInt(quote.quantity) - 1n) / BigInt(quote.quantity)).toString();
  const policyResult = evaluateSpendingPolicy({
    quoteCurrency: quote.currency.trim(), instructionCurrency: inst.currency.trim(), budgetCurrency: b.currency.trim(), policyCurrency: policy.currency.trim(),
    totalMinor: quote.totalMinor, unitPriceMinor: unitPrice, quantity: quote.quantity,
    instructionMaxTotalMinor: inst.maximum, perOrderHardLimitMinor: policy.perOrder, unitLimitMinor: policy.unit,
    availableBudgetMinor: (budgetAvailable > 0n ? budgetAvailable : 0n).toString(), availableDailyMinor: (dailyAvailable > 0n ? dailyAvailable : 0n).toString(),
  });
  if (!policyResult.valid) {
    const reason = policyResult.issues[0]!.code;
    return blockOperation(db, ownerId, operationId, reason);
  }

  if (inst.fundingMandateId) {
    const mandate = await db.query<{ status: string; validFrom: Date | null; validUntil: Date | null }>(
      'SELECT status, valid_from AS "validFrom", valid_until AS "validUntil" FROM funding_mandates WHERE owner_id=$1 AND id=$2 FOR UPDATE', [ownerId, inst.fundingMandateId]);
    if (mandate.rows[0]?.status !== 'ACTIVE' || (mandate.rows[0].validFrom && mandate.rows[0].validFrom > new Date())
        || (mandate.rows[0].validUntil && mandate.rows[0].validUntil <= new Date())) return blockOperation(db, ownerId, operationId, 'MANDATE_NOT_ACTIVE');
  }

  const approvalRequired = inst.mode === 'REVIEW_REQUIRED' || (policy.soft !== null && BigInt(quote.totalMinor) > BigInt(policy.soft));
  if (approvalRequired) {
    const approval = await db.query<{ id: string }>(
      `SELECT id FROM approvals WHERE owner_id=$1 AND operation_id=$2 AND quote_id=$3 AND status='APPROVED'
       AND consumed_at IS NULL AND permission_version=$4 AND policy_version=$5 AND quote_hash=$6
       AND expires_at > now() FOR UPDATE`, [ownerId, operationId, quote.quoteId, inst.permissionVersion, policy.version, quote.quoteHash]);
    if (!approval.rows[0]) return blockOperation(db, ownerId, operationId, 'FRESH_APPROVAL_REQUIRED');
    await db.query('UPDATE approvals SET consumed_at = now() WHERE id = $1 AND owner_id = $2 AND consumed_at IS NULL', [approval.rows[0].id, ownerId]);
  }

  const existingAttempt = await db.query<{ stableRequestKey: string; reservationId: string }>(
    `SELECT a.stable_request_key AS "stableRequestKey", r.id AS "reservationId"
     FROM execution_attempts a JOIN budget_reservations r ON r.owner_id=a.owner_id AND r.operation_id=a.operation_id
     WHERE a.owner_id=$1 AND a.operation_id=$2 FOR UPDATE OF a,r`, [ownerId, operationId]);
  if (existingAttempt.rows[0]) return { status: 'ALREADY_SUBMITTED', operationId,
    stableRequestKey: existingAttempt.rows[0].stableRequestKey, reservationId: existingAttempt.rows[0].reservationId,
    amountMinor: quote.totalMinor, currency: quote.currency.trim(), environment: 'FIXTURE' };

  const reservation = await db.query<{ id: string }>(
    `INSERT INTO budget_reservations(owner_id, operation_id, budget_id, budget_window_id, currency, amount_minor, status)
     VALUES($1,$2,$3,$4,$5,$6,'ACTIVE') RETURNING id`, [ownerId, operationId, inst.budgetId, windowId, quote.currency.trim(), quote.totalMinor]);
  const stableRequestKey = stableExecutionKey(operationId, quote.quoteHash.trim(), Number(inst.permissionVersion));
  await db.query(`INSERT INTO execution_attempts(owner_id, operation_id, adapter_id, adapter_version, environment,
      stable_request_key, status, requested_total_minor, currency, submitted_at)
    VALUES($1,$2,$3,$4,'FIXTURE',$5,'SUBMITTING',$6,$7,now())`,
    [ownerId, operationId, adapter.rows[0].id, adapter.rows[0].adapterVersion, stableRequestKey, quote.totalMinor, quote.currency.trim()]);
  await db.query(`UPDATE purchase_operations SET state='SUBMITTING', reservation_id=$3, policy_version=$4,
      dispatch_started_at=now(), version=version+1, updated_at=now()
    WHERE owner_id=$1 AND id=$2`, [ownerId, operationId, reservation.rows[0]!.id, policy.version]);
  return { status: 'PREPARED', operationId, stableRequestKey, reservationId: reservation.rows[0]!.id,
    amountMinor: quote.totalMinor, currency: quote.currency.trim(), environment: 'FIXTURE' };
}

export async function applyLocalSandboxOutcome(db: PoolClient, ownerId: string, operationId: string, faultMode: SandboxFaultMode): Promise<Record<string, unknown>> {
  const current = await db.query<{
    attemptId: string; stableRequestKey: string; status: string; amountMinor: string; currency: string;
    adapterId: string; instructionId: string; obligationId: string; reservationId: string; budgetId: string; budgetWindowId: string | null;
    quoteHash: string; kind: string; mode: string; completionLimit: number | null; fulfilledCount: number;
  }>(`SELECT a.id AS "attemptId", a.stable_request_key AS "stableRequestKey", a.status, a.requested_total_minor::text AS "amountMinor",
       a.currency, a.adapter_id AS "adapterId", o.instruction_id AS "instructionId", o.obligation_id AS "obligationId",
       r.id AS "reservationId", r.budget_id AS "budgetId", r.budget_window_id AS "budgetWindowId",
       q.content_hash AS "quoteHash", i.kind, i.mode, i.completion_limit AS "completionLimit", i.fulfilled_count AS "fulfilledCount"
     FROM execution_attempts a JOIN purchase_operations o ON o.id=a.operation_id AND o.owner_id=a.owner_id
     JOIN procurement_instructions i ON i.id=o.instruction_id AND i.owner_id=o.owner_id
     JOIN budget_reservations r ON r.operation_id=o.id AND r.owner_id=o.owner_id
     JOIN vendor_quotes q ON q.id=o.selected_quote_id AND q.operation_id=o.id AND q.owner_id=o.owner_id
     WHERE a.owner_id=$1 AND a.operation_id=$2 FOR UPDATE OF a,o,i,r`, [ownerId, operationId]);
  const row = current.rows[0];
  if (!row) return { status: 'BLOCKED', reason: 'PREPARED_ATTEMPT_NOT_FOUND' };
  if (row.status === 'UNKNOWN' || row.status === 'CONFIRMED_SUCCESS' || row.status === 'CONFIRMED_FAILURE') {
    return { status: row.status, stableRequestKey: row.stableRequestKey };
  }

  const vendorStatus = faultMode === 'PAYMENT_CAPTURED_VENDOR_PENDING' ? 'PENDING'
    : faultMode === 'DEFINITIVE_FAILURE' ? 'FAILED' : 'CONFIRMED';
  const paymentStatus = faultMode === 'DEFINITIVE_FAILURE' ? 'FAILED' : 'CAPTURED';
  const requestFingerprint = createHash('sha256').update(row.stableRequestKey).digest('hex').slice(0, 32);
  const orderRef = `local-sandbox:${requestFingerprint}`;
  const paymentRef = paymentStatus === 'CAPTURED' ? `local-payment:${requestFingerprint}` : null;
  await db.query(`INSERT INTO external_orders(owner_id, operation_id, adapter_id, environment, vendor_order_ref,
      provider_payment_ref, vendor_status, payment_status, sanitized_receipt)
    VALUES($1,$2,$3,'FIXTURE',$4,$5,$6,$7,$8::jsonb)
    ON CONFLICT(operation_id) DO UPDATE SET vendor_status=EXCLUDED.vendor_status, payment_status=EXCLUDED.payment_status,
      provider_payment_ref=EXCLUDED.provider_payment_ref, verified_at=now(), sanitized_receipt=EXCLUDED.sanitized_receipt`,
    [ownerId, operationId, row.adapterId, orderRef, paymentRef, vendorStatus, paymentStatus,
      JSON.stringify({ fixtureOnly: true, faultMode, stableRequestKey: row.stableRequestKey })]);

  if (faultMode === 'LOST_RESPONSE_AFTER_SUCCESS' || faultMode === 'CRASH_BEFORE_REFS' || faultMode === 'PAYMENT_CAPTURED_VENDOR_PENDING') {
    await db.query(`UPDATE execution_attempts SET status='UNKNOWN', safe_error=$3, version=version+1, updated_at=now()
      WHERE owner_id=$1 AND operation_id=$2`, [ownerId, operationId, faultMode]);
    await db.query(`UPDATE purchase_operations SET state='RECONCILING', outcome_reason=$3, version=version+1, updated_at=now()
      WHERE owner_id=$1 AND id=$2`, [ownerId, operationId, faultMode]);
    await db.query(`INSERT INTO jobs(owner_id, instruction_id, job_type, dedupe_key, payload, run_at)
      VALUES($1,$2,'RECONCILE',$3,$4::jsonb,now()) ON CONFLICT(dedupe_key) DO NOTHING`,
      [ownerId, row.instructionId, `reconcile:${operationId}`, JSON.stringify({ operationId, fixtureReconcile: true })]);
    if (faultMode === 'LOST_RESPONSE_AFTER_SUCCESS' || faultMode === 'CRASH_BEFORE_REFS') {
      return { status: 'RECONCILING', stableRequestKey: row.stableRequestKey, responseLost: true };
    }
    return { status: 'RECONCILING', stableRequestKey: row.stableRequestKey, vendorStatus, paymentStatus };
  }

  if (faultMode === 'DEFINITIVE_FAILURE') {
    await db.query(`UPDATE execution_attempts SET status='CONFIRMED_FAILURE', vendor_order_ref=$3, safe_error='SANDBOX_DEFINITIVE_FAILURE', version=version+1, updated_at=now()
      WHERE owner_id=$1 AND operation_id=$2`, [ownerId, operationId, orderRef]);
    await db.query(`UPDATE budget_reservations SET status='RELEASED', released_at=now()
      WHERE owner_id=$1 AND operation_id=$2 AND status='ACTIVE'`, [ownerId, operationId]);
    await db.query(`UPDATE purchase_operations SET state='FAILED', outcome_reason='SANDBOX_DEFINITIVE_FAILURE', version=version+1, updated_at=now()
      WHERE owner_id=$1 AND id=$2`, [ownerId, operationId]);
    return { status: 'FAILED', vendorStatus, paymentStatus };
  }
  await completeLocalExecution(db, ownerId, operationId, row);
  return { status: 'SUCCEEDED', vendorStatus, paymentStatus, stableRequestKey: row.stableRequestKey };
}

export async function reconcileLocalSandboxExecution(db: PoolClient, ownerId: string, operationId: string): Promise<Record<string, unknown>> {
  const current = await db.query<{
    attemptId: string; stableRequestKey: string; status: string; vendorStatus: string; paymentStatus: string;
    vendorOrderRef: string; instructionId: string; obligationId: string; reservationId: string; budgetId: string; budgetWindowId: string | null;
    kind: string; mode: string; completionLimit: number | null; fulfilledCount: number;
  }>(`SELECT a.id AS "attemptId", a.stable_request_key AS "stableRequestKey", a.status,
       e.vendor_status AS "vendorStatus", e.payment_status AS "paymentStatus", e.vendor_order_ref AS "vendorOrderRef",
       o.instruction_id AS "instructionId", o.obligation_id AS "obligationId", r.id AS "reservationId",
       r.budget_id AS "budgetId", r.budget_window_id AS "budgetWindowId", i.kind, i.mode,
       i.completion_limit AS "completionLimit", i.fulfilled_count AS "fulfilledCount"
     FROM execution_attempts a JOIN purchase_operations o ON o.id=a.operation_id AND o.owner_id=a.owner_id
     JOIN procurement_instructions i ON i.id=o.instruction_id AND i.owner_id=o.owner_id
     JOIN budget_reservations r ON r.operation_id=o.id AND r.owner_id=o.owner_id
     JOIN external_orders e ON e.operation_id=o.id AND e.owner_id=o.owner_id
     WHERE a.owner_id=$1 AND a.operation_id=$2 AND o.state='RECONCILING'
       AND e.sanitized_receipt->>'stableRequestKey' = a.stable_request_key
     FOR UPDATE OF a,o,i,r,e`, [ownerId, operationId]);
  const row = current.rows[0];
  if (!row) return { status: 'RECONCILING', reason: 'PROVIDER_OUTCOME_NOT_FOUND' };
  if (row.paymentStatus === 'CAPTURED' && row.vendorStatus === 'CONFIRMED') {
    await completeLocalExecution(db, ownerId, operationId, row);
    return { status: 'SUCCEEDED', stableRequestKey: row.stableRequestKey };
  }
  if (row.paymentStatus === 'CAPTURED' && row.vendorStatus === 'PENDING') {
    await db.query(`UPDATE execution_attempts SET last_checked_at=now(), version=version+1, updated_at=now()
      WHERE owner_id=$1 AND operation_id=$2`, [ownerId, operationId]);
    return { status: 'RECONCILING', vendorStatus: row.vendorStatus, paymentStatus: row.paymentStatus };
  }
  if (row.paymentStatus === 'FAILED' || row.vendorStatus === 'FAILED') {
    await db.query(`UPDATE execution_attempts SET status='CONFIRMED_FAILURE', last_checked_at=now(), version=version+1, updated_at=now()
      WHERE owner_id=$1 AND operation_id=$2`, [ownerId, operationId]);
    await db.query(`UPDATE budget_reservations SET status='RELEASED', released_at=now()
      WHERE owner_id=$1 AND operation_id=$2 AND status='ACTIVE'`, [ownerId, operationId]);
    await db.query(`UPDATE purchase_operations SET state='FAILED', outcome_reason='SANDBOX_CONFIRMED_FAILURE', version=version+1, updated_at=now()
      WHERE owner_id=$1 AND id=$2`, [ownerId, operationId]);
    return { status: 'FAILED' };
  }
  return { status: 'RECONCILING' };
}

export type CancellationFaultMode = 'CONFIRMED_NO_REFUND_YET' | 'REJECTED_NON_CANCELLABLE' | 'PENDING_VENDOR';

export async function requestOperationCancellation(db: PoolClient, ownerId: string, operationId: string,
  faultMode: CancellationFaultMode = 'CONFIRMED_NO_REFUND_YET'): Promise<Record<string, unknown>> {
  const locked = await db.query<{ state: string; permissionVersion: number | string; environment: string; quoteDetails: Record<string, unknown> | null; attemptId: string | null }>(
    `SELECT o.state, i.permission_version AS "permissionVersion", i.execution_environment AS environment,
            q.typed_details AS "quoteDetails", a.id AS "attemptId"
     FROM purchase_operations o JOIN procurement_instructions i ON i.owner_id=o.owner_id AND i.id=o.instruction_id
     LEFT JOIN vendor_quotes q ON q.owner_id=o.owner_id AND q.id=o.selected_quote_id
     LEFT JOIN execution_attempts a ON a.owner_id=o.owner_id AND a.operation_id=o.id
     WHERE o.owner_id=$1 AND o.id=$2 FOR UPDATE OF o,i`, [ownerId, operationId]);
  const op = locked.rows[0];
  if (!op) return { status: 'NOT_FOUND' };
  if (op.environment !== 'FIXTURE') return { status: 'UNSUPPORTED_ENVIRONMENT' };
  const prior = await db.query<{ id: string; status: string; stableRequestKey: string }>(
    'SELECT id,status,stable_request_key AS "stableRequestKey" FROM cancellations WHERE owner_id=$1 AND operation_id=$2 FOR UPDATE', [ownerId, operationId]);
  if (prior.rows[0]) return { status: prior.rows[0].status, cancellationId: prior.rows[0].id, replay: true,
    stableRequestKey: prior.rows[0].stableRequestKey };

  const postDispatch = Boolean(op.attemptId) || ['SUBMITTING', 'RECONCILING', 'SUCCEEDED', 'CANCEL_REQUESTED'].includes(op.state);
  const stage = postDispatch ? 'POST_DISPATCH' : 'PRE_DISPATCH';
  const key = stableCancellationKey(operationId, Number(op.permissionVersion));
  const terms = op.quoteDetails?.['terms'] && typeof op.quoteDetails['terms'] === 'object' ? op.quoteDetails['terms'] as Record<string, unknown> : {};
  if (!postDispatch) {
    const cancellation = await db.query<{ id: string }>(`INSERT INTO cancellations(owner_id,operation_id,stable_request_key,status,cancellation_stage,terms_snapshot,resolved_at)
      VALUES($1,$2,$3,'CONFIRMED','PRE_DISPATCH',$4::jsonb,now()) RETURNING id`,
      [ownerId, operationId, key, JSON.stringify({ result: 'PRE_DISPATCH', terms })]);
    await db.query(`UPDATE approvals SET status='INVALIDATED', decided_at=now(), version=version+1
      WHERE owner_id=$1 AND operation_id=$2 AND status IN ('PENDING','APPROVED') AND consumed_at IS NULL`, [ownerId, operationId]);
    await db.query(`UPDATE budget_reservations SET status='RELEASED', released_at=now()
      WHERE owner_id=$1 AND operation_id=$2 AND status='ACTIVE'`, [ownerId, operationId]);
    await db.query(`UPDATE purchase_operations SET state='CANCELLED', cancellation_state='CONFIRMED',
      cancellation_details=$3::jsonb, version=version+1, updated_at=now() WHERE owner_id=$1 AND id=$2`,
      [ownerId, operationId, JSON.stringify({ cancellationId: cancellation.rows[0]!.id, stage })]);
    return { status: 'CONFIRMED', cancellationId: cancellation.rows[0]!.id, stage, stableRequestKey: key, externalCall: false };
  }
  const cancellation = await db.query<{ id: string }>(`INSERT INTO cancellations(owner_id,operation_id,stable_request_key,status,cancellation_stage,terms_snapshot)
    VALUES($1,$2,$3,'PENDING','POST_DISPATCH',$4::jsonb) RETURNING id`,
    [ownerId, operationId, key, JSON.stringify({ result: faultMode, terms })]);
  await db.query(`UPDATE purchase_operations SET state=CASE WHEN state='SUCCEEDED' THEN state ELSE 'CANCEL_REQUESTED' END,
      cancellation_state='PENDING', cancellation_details=$3::jsonb, version=version+1, updated_at=now()
    WHERE owner_id=$1 AND id=$2`, [ownerId, operationId, JSON.stringify({ cancellationId: cancellation.rows[0]!.id })]);
  await db.query(`INSERT INTO jobs(owner_id,instruction_id,job_type,dedupe_key,payload,run_at)
    SELECT o.owner_id,o.instruction_id,'CANCEL_RECONCILE','cancel:'||o.id::text,
      jsonb_build_object('operationId',o.id,'fixtureCancellation',true),now()
    FROM purchase_operations o WHERE o.owner_id=$1 AND o.id=$2
    ON CONFLICT(dedupe_key) DO NOTHING`, [ownerId, operationId]);
  return { status: 'PENDING', cancellationId: cancellation.rows[0]!.id, stage, stableRequestKey: key, externalCall: false };
}

export async function reconcileOperationCancellation(db: PoolClient, ownerId: string, operationId: string): Promise<Record<string, unknown>> {
  const result = await db.query<{ id: string; status: string; termsSnapshot: Record<string, unknown>; amountMinor: string; currency: string; instructionId: string }>(
    `SELECT c.id,c.status,c.terms_snapshot AS "termsSnapshot",r.amount_minor::text AS "amountMinor",r.currency,o.instruction_id AS "instructionId"
     FROM cancellations c JOIN purchase_operations o ON o.owner_id=c.owner_id AND o.id=c.operation_id
     LEFT JOIN budget_reservations r ON r.owner_id=o.owner_id AND r.operation_id=o.id
     WHERE c.owner_id=$1 AND c.operation_id=$2 FOR UPDATE OF c,o`, [ownerId, operationId]);
  const cancellation = result.rows[0];
  if (!cancellation) return { status: 'NOT_FOUND' };
  if (cancellation.status === 'CONFIRMED' || cancellation.status === 'REJECTED') return { status: cancellation.status };
  const mode = cancellation.termsSnapshot['result'];
  if (mode === 'PENDING_VENDOR') return { status: 'PENDING' };
  const cancellationTerms = cancellation.termsSnapshot['terms'] && typeof cancellation.termsSnapshot['terms'] === 'object'
    ? cancellation.termsSnapshot['terms'] as Record<string, unknown> : {};
  if (mode === 'REJECTED_NON_CANCELLABLE' || cancellationTerms['cancellationPreference'] === 'NON_REFUNDABLE') {
    await db.query(`UPDATE cancellations SET status='REJECTED',rejection_reason='CANCELLATION_REJECTED_BY_VENDOR',resolved_at=now(),version=version+1 WHERE owner_id=$1 AND id=$2`, [ownerId,cancellation.id]);
    await db.query(`UPDATE purchase_operations SET cancellation_state='REJECTED',cancellation_details=jsonb_build_object('reason','CANCELLATION_REJECTED_BY_VENDOR'),version=version+1,updated_at=now() WHERE owner_id=$1 AND id=$2`, [ownerId,operationId]);
    await db.query(`INSERT INTO notifications(owner_id,operation_id,instruction_id,event_key,type,safe_content)
      VALUES($1,$2,$3,$4,'FIXTURE_RESULT',$5::jsonb) ON CONFLICT(event_key) DO NOTHING`,
      [ownerId,operationId,cancellation.instructionId,`cancel-rejected:${cancellation.id}`,JSON.stringify({ label:'LOCAL FIXTURE ONLY',message:'The vendor rejected this cancellation. The confirmed spend remains recorded.', reason:'CANCELLATION_REJECTED_BY_VENDOR' })]);
    return { status:'REJECTED', reason:'CANCELLATION_REJECTED_BY_VENDOR' };
  }
  await db.query(`UPDATE cancellations SET status='CONFIRMED',resolved_at=now(),version=version+1 WHERE owner_id=$1 AND id=$2`, [ownerId,cancellation.id]);
  await db.query(`UPDATE purchase_operations SET cancellation_state='CONFIRMED',version=version+1,updated_at=now() WHERE owner_id=$1 AND id=$2`, [ownerId,operationId]);
  await db.query(`UPDATE external_orders SET vendor_status='CANCELLED',verified_at=now() WHERE owner_id=$1 AND operation_id=$2`, [ownerId,operationId]);
  if (cancellation.amountMinor && cancellation.currency) {
    await db.query(`INSERT INTO refunds(owner_id,operation_id,external_ref,expected_amount_minor,currency,status)
      VALUES($1,$2,$3,$4,$5,'PENDING') ON CONFLICT(owner_id,external_ref) DO NOTHING`,
      [ownerId,operationId,`cancellation:${cancellation.id}`,cancellation.amountMinor,cancellation.currency.trim()]);
  }
  return { status:'CONFIRMED', refundStatus:'PENDING', capacityRestored:'0' };
}

async function completeLocalExecution(db: PoolClient, ownerId: string, operationId: string, row: {
  attemptId?: string; stableRequestKey?: string; amountMinor?: string; currency?: string; adapterId?: string;
  instructionId: string; obligationId: string; reservationId: string; budgetId: string; budgetWindowId: string | null;
  vendorOrderRef?: string; kind: string; mode?: string; completionLimit: number | null; fulfilledCount: number;
}): Promise<void> {
  await db.query(`UPDATE execution_attempts a SET status='CONFIRMED_SUCCESS',
      vendor_order_ref=COALESCE(a.vendor_order_ref,e.vendor_order_ref),
      provider_payment_ref=COALESCE(a.provider_payment_ref,e.provider_payment_ref),
      last_checked_at=now(), version=version+1, updated_at=now()
    FROM external_orders e WHERE a.owner_id=$1 AND a.operation_id=$2 AND e.owner_id=a.owner_id AND e.operation_id=a.operation_id
      AND e.vendor_status='CONFIRMED' AND e.payment_status='CAPTURED'`, [ownerId, operationId]);
  await db.query(`UPDATE budget_reservations SET status='COMMITTED', committed_at=now()
    WHERE owner_id=$1 AND operation_id=$2 AND status='ACTIVE'`, [ownerId, operationId]);
  await db.query(`INSERT INTO budget_entries(owner_id,budget_id,budget_window_id,operation_id,kind,amount_minor,currency,external_event_key)
    SELECT $1::uuid,r.budget_id,r.budget_window_id,$2::uuid,'SPEND',r.amount_minor,r.currency,'spend:' || $2::text
    FROM budget_reservations r WHERE r.owner_id=$1::uuid AND r.operation_id=$2::uuid
    ON CONFLICT(external_event_key) DO NOTHING`, [ownerId, operationId]);
  await db.query(`UPDATE procurement_obligations SET satisfied_at=COALESCE(satisfied_at,now()), version=version+1, updated_at=now()
    WHERE owner_id=$1 AND id=$2`, [ownerId, row.obligationId]);
  await db.query(`UPDATE procurement_instructions SET fulfilled_count=CASE WHEN completion_limit IS NULL THEN fulfilled_count+1 ELSE LEAST(completion_limit,fulfilled_count+1) END,
      state=CASE WHEN kind='ONE_TIME' OR (completion_limit IS NOT NULL AND completion_limit <= fulfilled_count+1) THEN 'COMPLETED'::instruction_state ELSE state END,
      next_run_at=CASE WHEN kind='ONE_TIME' OR (completion_limit IS NOT NULL AND completion_limit <= fulfilled_count+1) THEN NULL ELSE next_run_at END,
      updated_at=now()
    WHERE owner_id=$1 AND id=$2 AND state='ACTIVE'`, [ownerId, row.instructionId]);
  await db.query(`UPDATE purchase_operations SET state='SUCCEEDED', outcome_reason='LOCAL_SANDBOX_CONFIRMED', version=version+1, updated_at=now()
    WHERE owner_id=$1 AND id=$2 AND state IN ('SUBMITTING','RECONCILING')`, [ownerId, operationId]);
}

async function blockOperation(db: PoolClient, ownerId: string, operationId: string, reason: string): Promise<PreparedExecution> {
  await db.query(`UPDATE purchase_operations SET state='BLOCKED', outcome_reason=$3, version=version+1, updated_at=now()
    WHERE owner_id=$1 AND id=$2 AND state NOT IN ('SUCCEEDED','FAILED','BLOCKED','CANCELLED')`, [ownerId, operationId, reason]);
  return { status: 'BLOCKED', operationId, reason };
}
