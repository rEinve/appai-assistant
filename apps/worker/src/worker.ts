import { hostname } from 'node:os';
import { createHash } from 'node:crypto';
import { Pool, type PoolClient } from 'pg';

type JobType = 'OBSERVE' | 'RUN_OCCURRENCE' | 'RECONCILE' | 'NOTIFY' | 'CANCEL_RECONCILE';

interface DurableJob {
  id: string;
  owner_id: string;
  instruction_id: string | null;
  job_type: JobType;
  dedupe_key: string;
  payload: Record<string, unknown>;
  attempts: number;
  max_attempts: number;
  lease_generation: string | number;
}

const databaseUrl = process.env['DATABASE_URL'];
if (!databaseUrl) throw new Error('The durable worker requires DATABASE_URL.');

const workerId = process.env['WORKER_ID'] ?? `${hostname()}-${process.pid}`;
const pollMs = boundedInteger(process.env['WORKER_POLL_MS'], 1000, 100, 30_000);
const leaseMs = boundedInteger(process.env['WORKER_LEASE_MS'], 30_000, 5_000, 300_000);
const batchSize = boundedInteger(process.env['WORKER_BATCH_SIZE'], 4, 1, 32);
const pool = new Pool({ connectionString: databaseUrl, max: batchSize + 2, application_name: `appai-worker-${workerId}` });

let stopping = false;

function boundedInteger(raw: string | undefined, fallback: number, minimum: number, maximum: number): number {
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed >= minimum && parsed <= maximum ? parsed : fallback;
}

function errorCode(error: unknown): string {
  if (error && typeof error === 'object' && 'code' in error && typeof error.code === 'string') return error.code.slice(0, 100);
  return 'WORKER_PROCESSING_ERROR';
}

function localParts(date: Date, timezone: string): { year: number; month: number; day: number; hour: number; minute: number; second: number } {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en', {
    timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(date).map((part) => [part.type, Number(part.value)]));
  return { year: parts['year'], month: parts['month'], day: parts['day'], hour: parts['hour'], minute: parts['minute'], second: parts['second'] };
}

function localDateTimeToInstant(value: string, timezone: string): Date | null {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  if (!match) return null;
  let wallMs = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), Number(match[4]), Number(match[5]));
  const dateCheck = new Date(wallMs);
  if (dateCheck.getUTCFullYear() !== Number(match[1]) || dateCheck.getUTCMonth() + 1 !== Number(match[2])
      || dateCheck.getUTCDate() !== Number(match[3]) || Number(match[4]) > 23 || Number(match[5]) > 59) return null;
  for (let gapShift = 0; gapShift <= 180; gapShift += 1) {
    const target = new Date(wallMs);
    const desired = { year: target.getUTCFullYear(), month: target.getUTCMonth() + 1, day: target.getUTCDate(), hour: target.getUTCHours(), minute: target.getUTCMinutes() };
    const offsets = new Set<number>();
    for (let hours = -36; hours <= 36; hours += 6) {
      const probe = new Date(wallMs + hours * 60 * 60 * 1000);
      const local = localParts(probe, timezone);
      offsets.add(Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute, local.second) - probe.getTime());
    }
    const matches = [...offsets].map((offset) => new Date(wallMs - offset)).filter((candidate) => {
      const local = localParts(candidate, timezone);
      return local.year === desired.year && local.month === desired.month && local.day === desired.day
        && local.hour === desired.hour && local.minute === desired.minute && local.second === 0;
    }).sort((a, b) => a.getTime() - b.getTime());
    if (matches.length) return matches[0];
    wallMs += 60_000;
  }
  return null;
}

function nextMonthlyRun(dueAt: Date, after: Date, config: Record<string, unknown>, timezone: string): Date | null {
  if (config['frequency'] !== 'MONTHLY' || !Number.isInteger(config['dayOfMonth'])
      || Number(config['dayOfMonth']) < 1 || Number(config['dayOfMonth']) > 31
      || typeof config['localTime'] !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(config['localTime'])) return null;
  const current = localParts(dueAt, timezone);
  const firstMonthIndex = current.year * 12 + current.month;
  for (let monthOffset = 1; monthOffset <= 1200; monthOffset += 1) {
    const monthIndex = firstMonthIndex + monthOffset;
    const year = Math.floor(monthIndex / 12);
    const month = monthIndex % 12 + 1;
    const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const day = Math.min(Number(config['dayOfMonth']), lastDay);
    const target = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T${config['localTime']}`;
    let candidate: Date | null;
    try { candidate = localDateTimeToInstant(target, timezone); } catch { return null; }
    if (!candidate) return null;
    if (candidate > after) return candidate;
  }
  return null;
}

async function claimJobs(): Promise<DurableJob[]> {
  const result = await pool.query<DurableJob>(
    `WITH candidates AS (
       SELECT id
       FROM jobs
       WHERE (state IN ('READY', 'RETRY_WAIT') AND run_at <= now())
          OR (state = 'RUNNING' AND lease_expires_at <= now())
       ORDER BY run_at, created_at, id
       LIMIT $2
       FOR UPDATE SKIP LOCKED
     )
     UPDATE jobs AS job
     SET state = 'RUNNING', attempts = job.attempts + 1,
         lease_owner = $1, lease_expires_at = now() + ($3::bigint * interval '1 millisecond'),
         lease_generation = job.lease_generation + 1, updated_at = now()
     FROM candidates
     WHERE job.id = candidates.id
     RETURNING job.id, job.owner_id, job.instruction_id, job.job_type, job.dedupe_key,
               job.payload, job.attempts, job.max_attempts, job.lease_generation`,
    [workerId, batchSize, leaseMs],
  );
  return result.rows;
}

async function enqueueDueInstructions(): Promise<number> {
  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    const due = await db.query<{
      id: string; owner_id: string; kind: string; category: string; nextRunAt: Date; permissionVersion: number | string;
      scheduleConfig: Record<string, unknown> | null; timezone: string | null; validUntil: Date | null;
    }>(
      `SELECT id, owner_id, kind, category, next_run_at AS "nextRunAt", permission_version AS "permissionVersion",
              schedule_config AS "scheduleConfig", timezone_snapshot AS timezone, valid_until AS "validUntil"
       FROM procurement_instructions
       WHERE state = 'ACTIVE' AND kind IN ('ONE_TIME', 'SCHEDULED', 'RECURRING_BILL', 'WATCH') AND next_run_at <= now()
       ORDER BY next_run_at, id
       LIMIT $1
       FOR UPDATE SKIP LOCKED`,
      [batchSize],
    );
    let created = 0;
    const referenceTime = new Date();
    for (const instruction of due.rows) {
      const dueAt = instruction.nextRunAt.toISOString();
      const occurrenceKey = `permission:${instruction.permissionVersion}:due:${dueAt}`;
      const jobType = instruction.kind === 'WATCH' ? 'OBSERVE' : 'RUN_OCCURRENCE';
      const dedupeKey = `instruction:${instruction.id}:${jobType.toLowerCase()}:${occurrenceKey}`;
      const job = await db.query<{ id: string }>(
        `INSERT INTO jobs (owner_id, instruction_id, job_type, dedupe_key, payload, run_at)
         VALUES ($1, $2, $5, $3, $4::jsonb, now())
         ON CONFLICT (dedupe_key) DO NOTHING
         RETURNING id`,
        [instruction.owner_id, instruction.id, dedupeKey, JSON.stringify({ occurrenceKey, dueAt, scheduleVersion: Number(instruction.permissionVersion) }), jobType],
      );
      let nextRunAt: Date | null = null;
      if (instruction.kind === 'RECURRING_BILL' && instruction.scheduleConfig && instruction.timezone) {
        // Keep this overdue occurrence's stable identity, but skip elapsed monthly ticks after downtime.
        const next = nextMonthlyRun(instruction.nextRunAt, referenceTime, instruction.scheduleConfig, instruction.timezone);
        if (next && (!instruction.validUntil || next <= instruction.validUntil)) nextRunAt = next;
      }
      await db.query(
        `UPDATE procurement_instructions SET next_run_at = $5, updated_at = now()
         WHERE id = $1 AND owner_id = $2 AND state = 'ACTIVE' AND permission_version = $3 AND next_run_at = $4`,
        [instruction.id, instruction.owner_id, instruction.permissionVersion, instruction.nextRunAt, nextRunAt],
      );
      if (job.rows[0]) {
        created += 1;
        await db.query(
          `INSERT INTO audit_events (actor_type, actor_id, owner_id, instruction_id, action, new_state, correlation_id)
           VALUES ('WORKER', $1, $2, $3, 'INSTRUCTION_JOB_CREATED', 'READY', $4)`,
          [workerId, instruction.owner_id, instruction.id, dedupeKey],
        );
        await db.query(
          `INSERT INTO outbox_events (aggregate_type, aggregate_id, aggregate_version, event_type, owner_id, payload)
           VALUES ('JOB', $1, 1, 'JOB_CREATED', $2, $3::jsonb)
           ON CONFLICT (aggregate_type, aggregate_id, aggregate_version, event_type) DO NOTHING`,
          [job.rows[0].id, instruction.owner_id, JSON.stringify({ instructionId: instruction.id, jobType, dueAt })],
        );
      }
    }
    await db.query('COMMIT');
    return created;
  } catch (error) {
    await db.query('ROLLBACK');
    throw error;
  } finally {
    db.release();
  }
}

async function heartbeat(): Promise<void> {
  await pool.query(
    `INSERT INTO worker_heartbeats (worker_id, started_at, last_seen_at)
     VALUES ($1, now(), now())
     ON CONFLICT (worker_id) DO UPDATE SET last_seen_at = now()`,
    [workerId],
  );
}

async function withCurrentLease<T>(job: DurableJob, work: (db: PoolClient) => Promise<T>): Promise<T | null> {
  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    const lease = await db.query(
      `SELECT id FROM jobs
       WHERE id = $1 AND state = 'RUNNING' AND lease_owner = $2 AND lease_generation = $3
         AND lease_expires_at > now()
       FOR UPDATE`,
      [job.id, workerId, job.lease_generation],
    );
    if (lease.rowCount !== 1) {
      await db.query('ROLLBACK');
      return null;
    }
    const value = await work(db);
    await db.query('COMMIT');
    return value;
  } catch (error) {
    await db.query('ROLLBACK');
    throw error;
  } finally {
    db.release();
  }
}

async function blockJob(job: DurableJob, reason: string): Promise<void> {
  await withCurrentLease(job, async (db) => {
    await markClaimedJobBlocked(db, job, reason);
  });
}

async function markClaimedJobBlocked(db: PoolClient, job: DurableJob, reason: string): Promise<void> {
  const updated = await db.query(
    `UPDATE jobs SET state = 'BLOCKED', last_error_code = $4,
       lease_owner = NULL, lease_expires_at = NULL, updated_at = now()
     WHERE id = $1 AND lease_owner = $2 AND lease_generation = $3`,
    [job.id, workerId, job.lease_generation, reason],
  );
  if (updated.rowCount !== 1) return;
  await db.query(
    `INSERT INTO audit_events (actor_type, actor_id, owner_id, instruction_id, action, new_state, safe_reason, correlation_id)
     VALUES ('WORKER', $1, $2, $3, 'JOB_BLOCKED', 'BLOCKED', $4, $5)`,
    [workerId, job.owner_id, job.instruction_id, reason, job.dedupe_key],
  );
  await db.query(
    `INSERT INTO outbox_events (aggregate_type, aggregate_id, aggregate_version, event_type, owner_id, payload)
     VALUES ('JOB', $1, $2, 'JOB_BLOCKED', $3, $4::jsonb)
     ON CONFLICT (aggregate_type, aggregate_id, aggregate_version, event_type) DO NOTHING`,
    [job.id, job.lease_generation, job.owner_id, JSON.stringify({ jobType: job.job_type, reason })],
  );
}

async function retryJob(job: DurableJob, reason: string): Promise<void> {
  const exponent = Math.min(8, Math.max(0, Number(job.attempts) - 1));
  const delayMs = Math.min(5 * 60_000, 1000 * 2 ** exponent) + Math.floor(Math.random() * 500);
  await withCurrentLease(job, async (db) => {
    await db.query(
      `UPDATE jobs SET state = CASE WHEN attempts >= max_attempts THEN 'DEAD' ELSE 'RETRY_WAIT' END,
         run_at = now() + ($4::bigint * interval '1 millisecond'), last_error_code = $5,
         lease_owner = NULL, lease_expires_at = NULL, updated_at = now()
       WHERE id = $1 AND lease_owner = $2 AND lease_generation = $3`,
      [job.id, workerId, job.lease_generation, delayMs, reason],
    );
  });
}

async function finishJob(db: PoolClient, job: DurableJob, eventType: string, payload: Record<string, unknown>): Promise<void> {
  const updated = await db.query(
    `UPDATE jobs SET state = 'SUCCEEDED', last_error_code = NULL,
       lease_owner = NULL, lease_expires_at = NULL, updated_at = now()
     WHERE id = $1 AND state = 'RUNNING' AND lease_owner = $2 AND lease_generation = $3`,
    [job.id, workerId, job.lease_generation],
  );
  if (updated.rowCount !== 1) return;
  await db.query(
    `INSERT INTO audit_events (actor_type, actor_id, owner_id, instruction_id, action, new_state, correlation_id)
     VALUES ('WORKER', $1, $2, $3, 'FIXTURE_JOB_COMPLETED', 'SUCCEEDED', $4)`,
    [workerId, job.owner_id, job.instruction_id, job.dedupe_key],
  );
  await db.query(
    `INSERT INTO outbox_events (aggregate_type, aggregate_id, aggregate_version, event_type, owner_id, payload)
     VALUES ('JOB', $1, $2, $3, $4, $5::jsonb)
     ON CONFLICT (aggregate_type, aggregate_id, aggregate_version, event_type) DO NOTHING`,
    [job.id, job.lease_generation, eventType, job.owner_id, JSON.stringify(payload)],
  );
}

async function processOccurrence(job: DurableJob): Promise<void> {
  const instructionId = job.instruction_id;
  const occurrenceKey = job.payload['occurrenceKey'];
  const dueAtValue = job.payload['dueAt'];
  const scheduleVersion = job.payload['scheduleVersion'];
  if (!instructionId || typeof occurrenceKey !== 'string' || occurrenceKey.length < 1 || occurrenceKey.length > 200
      || typeof dueAtValue !== 'string' || !Number.isFinite(Date.parse(dueAtValue))
      || !Number.isSafeInteger(scheduleVersion) || Number(scheduleVersion) < 1) {
    await blockJob(job, 'INVALID_OCCURRENCE_PAYLOAD');
    return;
  }

  const outcome = await withCurrentLease(job, async (db) => {
    const result = await db.query<{
      category: string; kind: string; mode: string; state: string; environment: string | null;
      validFrom: Date | null; validUntil: Date | null; completionLimit: number | null;
      fulfilledCount: number; maximum: string | null; currency: string | null;
      permissionVersion: number | string; categoryDetails: Record<string, unknown> | null;
    }>(
      `SELECT category, kind, mode, state, execution_environment AS environment,
              valid_from AS "validFrom", valid_until AS "validUntil",
              completion_limit AS "completionLimit", fulfilled_count AS "fulfilledCount",
              max_total_minor::text AS maximum, currency,
              permission_version AS "permissionVersion",
              structured_constraints->'categoryDetails' AS "categoryDetails"
       FROM procurement_instructions WHERE id = $1 AND owner_id = $2 FOR UPDATE`,
      [instructionId, job.owner_id],
    );
    const instruction = result.rows[0];
    const block = async (reason: string) => {
      await markClaimedJobBlocked(db, job, reason);
      return reason;
    };
    if (!instruction) return block('INSTRUCTION_NOT_FOUND');
    if (instruction.state !== 'ACTIVE' || instruction.environment !== 'FIXTURE') return block('INSTRUCTION_NOT_ACTIVE_FIXTURE');
    const dueAt = new Date(dueAtValue);
    if ((instruction.validFrom && dueAt < instruction.validFrom) || (instruction.validUntil && dueAt > instruction.validUntil)) return block('OUTSIDE_VALIDITY_WINDOW');
    if (instruction.completionLimit !== null && instruction.fulfilledCount >= instruction.completionLimit) return block('COMPLETION_LIMIT_REACHED');
    if (!instruction.maximum || !instruction.currency || !instruction.categoryDetails) return block('FIXTURE_INPUT_INCOMPLETE');

    const adapter = await db.query<{ id: string; adapter_version: string }>(
      `SELECT id, adapter_version FROM vendor_adapters
       WHERE adapter_key = 'local-fixture' AND environment = 'FIXTURE'
         AND enabled = true AND execution_enabled = false AND status = 'VERIFIED'`,
    );
    if (!adapter.rows[0]) return block('FIXTURE_ADAPTER_UNAVAILABLE');

    const occurrence = await db.query<{ id: string }>(
      `INSERT INTO instruction_occurrences (owner_id, instruction_id, schedule_version, due_at, local_occurrence_key, state)
       VALUES ($1, $2, $3, $4, $5, 'RUNNING')
       ON CONFLICT (instruction_id, local_occurrence_key) DO NOTHING RETURNING id`,
      [job.owner_id, instructionId, scheduleVersion, dueAt, occurrenceKey],
    );
    const occurrenceId = occurrence.rows[0]?.id ?? (await db.query<{ id: string }>(
      'SELECT id FROM instruction_occurrences WHERE instruction_id = $1 AND local_occurrence_key = $2 FOR UPDATE',
      [instructionId, occurrenceKey],
    )).rows[0]?.id;
    if (!occurrenceId) throw new Error('OCCURRENCE_PERSISTENCE_FAILED');

    const obligationKey = `${instruction.kind}:${occurrenceKey}`;
    const obligationInsert = await db.query<{ id: string }>(
      `INSERT INTO procurement_obligations (owner_id, instruction_id, occurrence_id, obligation_key, category, fulfillment_slot)
       VALUES ($1, $2, $3, $4, $5::instruction_category, $6)
       ON CONFLICT (instruction_id, obligation_key) DO NOTHING RETURNING id`,
      [job.owner_id, instructionId, occurrenceId, obligationKey, instruction.category, occurrenceKey],
    );
    const obligationId = obligationInsert.rows[0]?.id ?? (await db.query<{ id: string; occurrence_id: string | null }>(
      'SELECT id, occurrence_id FROM procurement_obligations WHERE instruction_id = $1 AND obligation_key = $2 FOR UPDATE',
      [instructionId, obligationKey],
    )).rows[0]?.id;
    if (!obligationId) throw new Error('OBLIGATION_IDENTITY_CONFLICT');

    const operation = await db.query<{ id: string; state: string; selected_quote_id: string | null }>(
      `INSERT INTO purchase_operations (owner_id, instruction_id, obligation_id, state, permission_version, execution_key)
       VALUES ($1, $2, $3, 'FIXTURE_QUOTED', $4, $5)
       ON CONFLICT (owner_id, instruction_id, obligation_id) DO NOTHING
       RETURNING id, state, selected_quote_id`,
      [job.owner_id, instructionId, obligationId, instruction.permissionVersion, `fixture:${instructionId}:${occurrenceKey}`],
    );
    const operationRow = operation.rows[0] ?? (await db.query<{ id: string; state: string; selected_quote_id: string | null }>(
      'SELECT id, state, selected_quote_id FROM purchase_operations WHERE owner_id = $1 AND instruction_id = $2 AND obligation_id = $3 FOR UPDATE',
      [job.owner_id, instructionId, obligationId],
    )).rows[0];
    if (!operationRow) throw new Error('FIXTURE_OPERATION_PERSISTENCE_FAILED');

    let quoteId = operationRow.selected_quote_id;
    if (!quoteId) {
      const maximum = BigInt(instruction.maximum);
      const total = (maximum / 2n > 0n ? maximum / 2n : 1n).toString();
      const details = { fixture: true, label: 'Synthetic local fixture quote · not a real offer', categoryDetails: instruction.categoryDetails };
      const contentHash = createHash('sha256').update(JSON.stringify({ category: instruction.category, currency: instruction.currency.trim(), total, details })).digest('hex');
      const termsHash = createHash('sha256').update('FIXTURE_ONLY_NO_VENDOR_TERMS').digest('hex');
      const quote = await db.query<{ id: string }>(
        `INSERT INTO vendor_quotes
          (owner_id, operation_id, adapter_id, adapter_version, environment, merchant_ref, external_quote_ref,
           category, schema_version, typed_details, currency, subtotal_minor, tax_minor, fees_minor,
           shipping_minor, discount_minor, total_minor, quantity, terms_hash, content_hash, verified_at, expires_at)
         VALUES ($1, $2, $3, $4, 'FIXTURE', 'local-fixture', $5, $6::instruction_category, 'fixture-1.0',
           $7::jsonb, $8, $9, 0, 0, 0, 0, $9, $10, $11, $12, now(), now() + interval '1 day')
         ON CONFLICT (adapter_id, environment, external_quote_ref) DO NOTHING RETURNING id`,
        [job.owner_id, operationRow.id, adapter.rows[0].id, adapter.rows[0].adapter_version,
          `fixture-${occurrenceId}`, instruction.category, JSON.stringify(details), instruction.currency.trim(),
          total, Math.max(1, Number(instruction.categoryDetails['quantity'] ?? 1)), termsHash, contentHash],
      );
      quoteId = quote.rows[0]?.id ?? (await db.query<{ id: string }>(
        'SELECT id FROM vendor_quotes WHERE adapter_id = $1 AND environment = \'FIXTURE\' AND external_quote_ref = $2',
        [adapter.rows[0].id, `fixture-${occurrenceId}`],
      )).rows[0]?.id ?? null;
      if (!quoteId) throw new Error('FIXTURE_QUOTE_PERSISTENCE_FAILED');
      const operationState = instruction.mode === 'REVIEW_REQUIRED' ? 'FIXTURE_AWAITING_REVIEW'
        : instruction.mode === 'PRE_APPROVED' ? 'FIXTURE_COMPLETED' : 'FIXTURE_QUOTED';
      await db.query(
        `UPDATE purchase_operations SET selected_quote_id = $3, state = $4, version = version + 1, updated_at = now()
         WHERE id = $1 AND owner_id = $2`,
        [operationRow.id, job.owner_id, quoteId, operationState],
      );
      if (instruction.mode === 'REVIEW_REQUIRED') {
        const approvalExpiry = await db.query<{ expires_at: Date }>(
          `INSERT INTO approvals (owner_id, operation_id, quote_id, quote_hash, permission_version, status, expires_at)
           VALUES ($1, $2, $3, $4, $5, 'PENDING', now() + interval '1 day')
           ON CONFLICT DO NOTHING RETURNING expires_at`,
          [job.owner_id, operationRow.id, quoteId, contentHash, instruction.permissionVersion],
        );
        await db.query(
          `INSERT INTO notifications (owner_id, operation_id, instruction_id, event_key, type, safe_content)
           VALUES ($1, $2, $3, $4, 'FIXTURE_REVIEW_REQUESTED', $5::jsonb) ON CONFLICT (event_key) DO NOTHING`,
          [job.owner_id, operationRow.id, instructionId, `fixture-review:${operationRow.id}`, JSON.stringify({ label: 'LOCAL FIXTURE ONLY', message: 'A synthetic quote is ready for review. Approving it records a fixture decision and never places an order.', quoteId, expiresAt: approvalExpiry.rows[0]?.expires_at })],
        );
      } else {
        await db.query(
          `INSERT INTO notifications (owner_id, operation_id, instruction_id, event_key, type, safe_content)
           VALUES ($1, $2, $3, $4, 'FIXTURE_RESULT', $5::jsonb) ON CONFLICT (event_key) DO NOTHING`,
          [job.owner_id, operationRow.id, instructionId, `fixture-result:${operationRow.id}`, JSON.stringify({ label: 'LOCAL FIXTURE ONLY', message: instruction.mode === 'PRE_APPROVED' ? 'The fixture path completed without contacting a vendor or moving money.' : 'The fixture quote is recorded. Notify-only instructions never purchase.' })],
        );
      }
      await db.query(
        `INSERT INTO audit_events (actor_type, actor_id, owner_id, instruction_id, action, new_state, safe_reason, correlation_id)
         VALUES ('WORKER', $1, $2, $3, 'FIXTURE_QUOTE_CREATED', $4, 'NO_EXTERNAL_VENDOR_OR_PAYMENT_CALL', $5)`,
        [workerId, job.owner_id, instructionId, operationState, job.dedupe_key],
      );
    }
    await db.query("UPDATE instruction_occurrences SET state = 'SUCCEEDED', updated_at = now() WHERE id = $1 AND owner_id = $2", [occurrenceId, job.owner_id]);
    await db.query(
      `INSERT INTO outbox_events (aggregate_type, aggregate_id, aggregate_version, event_type, owner_id, payload)
       VALUES ('OCCURRENCE', $1, 1, 'FIXTURE_OCCURRENCE_PROCESSED', $2, $3::jsonb)
       ON CONFLICT (aggregate_type, aggregate_id, aggregate_version, event_type) DO NOTHING`,
      [occurrenceId, job.owner_id, JSON.stringify({ instructionId, occurrenceKey, operationId: operationRow.id, fixtureOnly: true })],
    );
    await finishJob(db, job, 'FIXTURE_JOB_COMPLETED', { instructionId, occurrenceId, operationId: operationRow.id, fixtureOnly: true });
    return operationRow.state;
  });
  if (outcome) console.info(`fixture occurrence processed id=${job.id} state=${outcome}`);
}

async function processObservation(job: DurableJob): Promise<void> {
  const instructionId = job.instruction_id;
  const occurrenceKey = job.payload['occurrenceKey'];
  const dueAtValue = job.payload['dueAt'];
  if (!instructionId || typeof occurrenceKey !== 'string' || typeof dueAtValue !== 'string' || !Number.isFinite(Date.parse(dueAtValue))) {
    await blockJob(job, 'INVALID_OBSERVATION_PAYLOAD');
    return;
  }
  const result = await withCurrentLease(job, async (db) => {
    const instructionResult = await db.query<{
      category: string; kind: string; mode: string; state: string; environment: string | null;
      validFrom: Date | null; validUntil: Date | null; description: string;
    }>(
      `SELECT category, kind, mode, state, execution_environment AS environment,
              valid_from AS "validFrom", valid_until AS "validUntil",
              structured_constraints->>'description' AS description
       FROM procurement_instructions WHERE id = $1 AND owner_id = $2 FOR UPDATE`,
      [instructionId, job.owner_id],
    );
    const instruction = instructionResult.rows[0];
    const block = async (reason: string) => {
      await markClaimedJobBlocked(db, job, reason);
      return reason;
    };
    if (!instruction || instruction.state !== 'ACTIVE' || instruction.environment !== 'FIXTURE') return block('INSTRUCTION_NOT_ACTIVE_FIXTURE');
    if (instruction.kind !== 'WATCH' || instruction.mode !== 'NOTIFY_ONLY') return block('WATCH_PERMISSION_UNSUPPORTED');
    const dueAt = new Date(dueAtValue);
    if ((instruction.validFrom && dueAt < instruction.validFrom) || (instruction.validUntil && dueAt > instruction.validUntil)) return block('OUTSIDE_VALIDITY_WINDOW');
    const adapter = await db.query<{ id: string }>(
      `SELECT id FROM vendor_adapters
       WHERE adapter_key = 'local-fixture' AND environment = 'FIXTURE'
         AND enabled = true AND execution_enabled = false AND status = 'VERIFIED'`,
    );
    if (!adapter.rows[0]) return block('FIXTURE_ADAPTER_UNAVAILABLE');
    const normalized = { fixture: true, label: 'Synthetic local observation · no real vendor search', category: instruction.category };
    const fingerprint = createHash('sha256').update(JSON.stringify(normalized)).digest('hex');
    const observation = await db.query<{ id: string }>(
      `INSERT INTO offer_observations
        (owner_id, instruction_id, adapter_id, source_offer_key, material_fingerprint,
         observed_at, freshness_until, normalized_details, source_url)
       VALUES ($1, $2, $3, 'local-fixture:synthetic-observation', $4, now(), now() + interval '1 day', $5::jsonb, 'fixture://local/observation')
       ON CONFLICT (instruction_id, source_offer_key, material_fingerprint) DO NOTHING RETURNING id`,
      [job.owner_id, instructionId, adapter.rows[0].id, fingerprint, JSON.stringify(normalized)],
    );
    const observationId = observation.rows[0]?.id ?? (await db.query<{ id: string }>(
      `SELECT id FROM offer_observations WHERE instruction_id = $1
       AND source_offer_key = 'local-fixture:synthetic-observation' AND material_fingerprint = $2`,
      [instructionId, fingerprint],
    )).rows[0]?.id;
    if (!observationId) throw new Error('FIXTURE_OBSERVATION_PERSISTENCE_FAILED');
    await db.query(
      `INSERT INTO notifications (owner_id, instruction_id, event_key, type, safe_content)
       VALUES ($1, $2, $3, 'FIXTURE_OBSERVATION', $4::jsonb) ON CONFLICT (event_key) DO NOTHING`,
      [job.owner_id, instructionId, `fixture-observation:${instructionId}:${fingerprint}`, JSON.stringify({ label: 'LOCAL FIXTURE ONLY', message: `A synthetic ${instruction.category.toLowerCase()} observation was recorded for “${instruction.description}”. No website was searched and no offer was verified.` })],
    );
    await db.query(
      `INSERT INTO audit_events (actor_type, actor_id, owner_id, instruction_id, action, new_state, safe_reason, correlation_id)
       VALUES ('WORKER', $1, $2, $3, 'FIXTURE_OBSERVATION_RECORDED', 'OBSERVED', 'NO_EXTERNAL_DISCOVERY', $4)`,
      [workerId, job.owner_id, instructionId, job.dedupe_key],
    );
    await db.query(
      `INSERT INTO outbox_events (aggregate_type, aggregate_id, aggregate_version, event_type, owner_id, payload)
       VALUES ('OBSERVATION', $1, 1, 'FIXTURE_OBSERVATION_RECORDED', $2, $3::jsonb)
       ON CONFLICT (aggregate_type, aggregate_id, aggregate_version, event_type) DO NOTHING`,
      [observationId, job.owner_id, JSON.stringify({ instructionId, observationId, fixtureOnly: true })],
    );
    await finishJob(db, job, 'FIXTURE_OBSERVATION_JOB_COMPLETED', { instructionId, observationId, fixtureOnly: true });
    return observationId;
  });
  if (result) console.info(`fixture observation recorded id=${result}`);
}

async function processJob(job: DurableJob): Promise<void> {
  try {
    if (job.job_type === 'OBSERVE') {
      await processObservation(job);
      return;
    }
    if (job.job_type === 'RUN_OCCURRENCE') {
      await processOccurrence(job);
      return;
    }
    const reasons: Record<JobType, string> = {
      OBSERVE: 'DISCOVERY_ADAPTER_UNAVAILABLE',
      RUN_OCCURRENCE: 'EXECUTION_DISABLED',
      RECONCILE: 'RECONCILIATION_ADAPTER_UNAVAILABLE',
      NOTIFY: 'NOTIFICATION_TRANSPORT_UNAVAILABLE',
      CANCEL_RECONCILE: 'CANCELLATION_ADAPTER_UNAVAILABLE',
    };
    await blockJob(job, reasons[job.job_type] ?? 'UNSUPPORTED_JOB_TYPE');
    console.info(`job blocked id=${job.id} reason=${reasons[job.job_type] ?? 'UNSUPPORTED_JOB_TYPE'}`);
  } catch (error) {
    const reason = errorCode(error);
    try {
      await retryJob(job, reason);
      console.error(`job retry scheduled id=${job.id} code=${reason}`);
    } catch (retryError) {
      console.error(`job lease lost or retry failed id=${job.id} code=${errorCode(retryError)}`);
    }
  }
}

async function run(): Promise<void> {
  console.info(`durable worker started id=${workerId} pollMs=${pollMs} leaseMs=${leaseMs}`);
  while (!stopping) {
    try {
      await heartbeat();
      await enqueueDueInstructions();
      const jobs = await claimJobs();
      if (jobs.length === 0) {
        await new Promise((resolve) => setTimeout(resolve, pollMs));
      } else {
        await Promise.all(jobs.map(processJob));
      }
    } catch (error) {
      console.error(`worker polling failed code=${errorCode(error)}`);
      await new Promise((resolve) => setTimeout(resolve, Math.min(pollMs * 3, 10_000)));
    }
  }
}

async function shutdown(): Promise<void> {
  stopping = true;
  await pool.end();
  process.exit(0);
}

process.once('SIGINT', () => { void shutdown(); });
process.once('SIGTERM', () => { void shutdown(); });
void run().catch(async (error) => {
  console.error(`worker stopped code=${errorCode(error)}`);
  await pool.end();
  process.exitCode = 1;
});
