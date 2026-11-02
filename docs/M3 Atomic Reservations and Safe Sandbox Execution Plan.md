# M3: Policy, Atomic Reservations, and Safe Sandbox Purchasing — Implementation & Acceptance Specification

Status: **GREEN-LIT · Chief Engineer Review & PostgreSQL Verification Passed (2 November 2026) · Live Execution Disabled**
Date: **2 November 2026**
Scope: Milestone M3 (`AC-07`, `AC-08`, `AC-09`, `AC-10`, plus M3 portions of `AC-02`, `AC-06`, `AC-11`, `AC-12`, `AC-21`, `FR-04`, `FR-06`, `FR-09`, `FR-10`, `FR-14`, `FR-15`, `FR-16`)
Authority: [Implementation Plan](A-P-P-A-I-agent-product-implementation-plan.md) (Milestone M3), [PRD](A-P-P-A-I-agent-product-requirements-document.md) (§ 3, § 4), [Technical Requirements](A-P-P-A-I-agent-technical-requirements-document.md) (§ 3, § 4, § 5), [Schema](A-P-P-A-I-agent-schema.md) (§ 2, § 3), [Acceptance Matrix](DEVELOPMENT-ACCEPTANCE.md) (`AC-07`, `AC-08`, `AC-09`, `AC-10`).

---

## 1. Problem Statement & Chief Engineer Readiness Audit

Milestones **M0** (capability gates, role bindings, one-use consent, webhook deduplication, and `AC-17` pre-purchase block), **M1** (React 19 + Vite workspace, 101-assertion acceptance matrix, PostgreSQL AC-03 schedule/DST/missed-tick matrix, and private supplier CRUD), and **M2** (deduplicated 4-tier discovery, category criteria validation, authoritative quote arithmetic/hash binding, no-match watch continuation, and quote lifecycle/approval fencing) are **100% green-lit**.

Before any sandbox checkout path can reserve budget capacity or submit an order attempt, **Milestone M3** must close five architectural gaps in PostgreSQL, Domain, API, and Worker:

1. **Gap M3-1: Missing Budget Policy, Window, Reservation, Ledger, and Execution Attempt Schema (`AC-07`, `AC-08`, `AC-09`, `AC-10`)**
   - Migrations `001`–`015` define `budgets`, `procurement_instructions`, `procurement_obligations`, `purchase_operations`, `vendor_quotes`, and `approvals`, but do not yet define the financial enforcement tables specified in [A-P-P-A-I-agent-schema.md](A-P-P-A-I-agent-schema.md):
     - `budget_policies` and `budget_windows` (per-order hard limit, unit limit, daily limit, soft review threshold, local-date window bounds).
     - `budget_reservations` and `budget_entries` (atomic `ACTIVE` / `COMMITTED` / `RELEASED` reservations and immutable `SPEND` / `REFUND` ledger entries).
     - `execution_attempts`, `external_orders`, and `refunds` (single financially mutating attempt per operation with `stable_request_key`, separate vendor/payment status tracking, and confirmed-only refund restoration).
     - Cross-instruction bill uniqueness on `procurement_obligations` so two instructions cannot pay the same `(accountRef, invoiceOrCycleRef)` obligation (`AC-09`).

2. **Gap M3-2: Hard Spending Caps & Policy Version Fencing (`AC-07`)**
   - Full payable total (`quote.total_minor`), unit cap (`unit_limit_minor`), per-order cap (`per_order_hard_limit_minor`), instruction ceiling (`max_total_minor`), shared budget allocation (`allocation_limit_minor`), and daily cap (`daily_limit_minor`) must all be enforced inside one PostgreSQL transaction.
   - Generic member approval (`APPROVED`) **cannot** override any hard cap.
   - Currency mismatch, negative/overflowing money, or unknown total must block immediately.
   - Amending `budget_policies` increments `policy_version`, requiring fresh policy evaluation and preventing stale approvals/quotes from bypassing lowered caps.

3. **Gap M3-3: Concurrent Atomic Budget Reservations Across Shared Budgets & Rollover (`AC-08`)**
   - With `50` units remaining in a shared budget (or daily window), two concurrent `40`-unit eligible obligations (`Promise.all`) must allow **at most one** reservation and dispatch; the second must deterministically block with `INSUFFICIENT_BUDGET_CAPACITY` or `DAILY_LIMIT_EXCEEDED`.
   - This invariant must hold across shared budgets (multiple instructions linked to one `budget_id`), worker lease expiration, cache loss (derived directly from PostgreSQL `budget_entries` and `budget_reservations`), and local-day window rollover (where unresolved `ACTIVE` reservations from an earlier window still count against liability until resolved).

4. **Gap M3-4: Idempotent Attempt Keys, One-Time Fulfillment Stop & Cross-Instruction Bill Deduplication (`AC-09`)**
   - Duplicate watch events, client retries, schedule ticks, and stale workers after lease expiry must reuse the exact same domain obligation, operation, and `execution_attempts.stable_request_key` (`stableExecutionKey(operationId, quoteHash, permissionVersion)`).
   - A `ONE_TIME` (or `WATCH` with `completion_limit = 1`) instruction must transition to `COMPLETED` (`next_run_at = NULL`, `fulfilled_count = completion_limit`) once its obligation succeeds, preventing any second purchase.
   - Two separate instructions targeting the same bill account and invoice/cycle (`BILL:{accountRef}:{invoiceOrCycleRef}`) must be blocked by database uniqueness so the same bill is never paid twice.

5. **Gap M3-5: Crash / Lost-Response Recovery & Partial-Outcome Protection (`AC-10`)**
   - If an external sandbox purchase succeeds (or times out) and the response is lost or the worker crashes before recording external references:
     - `execution_attempts` and `purchase_operations` must already be persisted in `SUBMITTING` / `RECONCILING` (`UNKNOWN` attempt status) **before** external I/O.
     - The `budget_reservations` row must remain `ACTIVE` (never released early while outcome is `UNKNOWN`).
     - A `RECONCILE` job must recover the outcome via `stable_request_key` status lookup without issuing a second purchase or generating a new random idempotency key.
     - Payment capture (`CAPTURED`) without a confirmed vendor order (`vendor_status !== 'CONFIRMED'`) must stay unresolved in `RECONCILING` with its reservation held `ACTIVE`.

---

## 2. Target Architecture & Transactional Invariants

```mermaid
sequenceDiagram
    participant API as API / Worker
    participant PG as PostgreSQL (SERIALIZABLE / FOR UPDATE)
    participant Sandbox as Sandbox Adapter (PayPal / Vendor Stub)

    Note over API,PG: Phase 1: Atomic Policy Check & Reservation (AC-07, AC-08)
    API->>PG: BEGIN; Lock instruction, operation, budget, policy, window FOR UPDATE
    PG-->>API: Verify state=ACTIVE, mandate=ACTIVE, session=ACTIVE, versions match
    API->>PG: Recompute Spend (SPEND - REFUND) + ACTIVE Reservations
    alt Any Hard Cap / Allocation / Daily Limit Exceeded
        API->>PG: UPDATE purchase_operations SET state='BLOCKED'; COMMIT
    else All Limits Pass
        API->>PG: INSERT budget_reservations (status='ACTIVE')
        API->>PG: Consume approval (consumed_at=now()), set operation='RESERVED'; COMMIT
    end

    Note over API,PG: Phase 2: Pre-Dispatch Fencing (AC-09, AC-10)
    API->>PG: BEGIN; Lock operation (RESERVED) & instruction
    API->>PG: INSERT execution_attempts (status='SUBMITTING', stable_request_key)
    API->>PG: UPDATE purchase_operations SET state='SUBMITTING', dispatch_started_at=now(); COMMIT

    Note over API,Sandbox: Phase 3: External Sandbox I/O & Crash Recovery (AC-10)
    API->>Sandbox: Execute with stable_request_key
    alt Network Loss / Worker Crash / Timeout
        API->>PG: Set attempt='UNKNOWN', operation='RECONCILING', enqueue RECONCILE job (Reservation stays ACTIVE)
    else Payment Captured + Vendor Order Confirmed
        API->>PG: BEGIN; Set attempt='CONFIRMED_SUCCESS', operation='SUCCEEDED'
        API->>PG: UPDATE budget_reservations SET status='COMMITTED'
        API->>PG: INSERT budget_entries (kind='SPEND') ON CONFLICT DO NOTHING
        API->>PG: Satisfy obligation & increment fulfilled_count (COMPLETE if limit reached); COMMIT
    else Definitive Failure (No Payment Captured)
        API->>PG: BEGIN; Set attempt='CONFIRMED_FAILURE', operation='FAILED'
        API->>PG: UPDATE budget_reservations SET status='RELEASED'; COMMIT
    end
```

### 2.1 Exact Availability Formulas (`AC-07`, `AC-08`)

1. **Budget Allocation Remaining**:
   $$\text{Available}_{\text{budget}} = \text{allocation\_limit\_minor} - \left(\sum_{\text{budget}} \text{SPEND} - \sum_{\text{budget}} \text{REFUND}_{\text{confirmed}}\right) - \sum_{\text{budget}} \text{Reservation}_{\text{ACTIVE}}$$
2. **Daily Window Remaining**:
   $$\text{Available}_{\text{daily}} = \text{daily\_limit\_minor} - \left(\sum_{\text{window}} \text{SPEND} - \sum_{\text{window}} \text{REFUND}_{\text{confirmed}}\right) - \sum_{\text{window } \cup \text{ unresolved prior}} \text{Reservation}_{\text{ACTIVE}}$$
   *(Note: `COMMITTED` reservations are never summed alongside `SPEND` entries, preventing double-counting once a reservation commits to a `SPEND` entry.)*

---

## 3. Step-by-Step Implementation Plan for Dev

### Step 1: Migration `016_m3_reservations_ledger_and_attempts.sql`
Create `packages/persistence/migrations/016_m3_reservations_ledger_and_attempts.sql` and apply via `npm run db:migrate`:

1. **`budget_policies`**:
   - Columns: `id uuid PRIMARY KEY DEFAULT gen_random_uuid()`, `owner_id uuid NOT NULL REFERENCES users(id)`, `currency char(3) NOT NULL CHECK (currency ~ '^[A-Z]{3}$')`, `per_order_hard_limit_minor bigint NOT NULL CHECK (per_order_hard_limit_minor > 0)`, `daily_limit_minor bigint NOT NULL CHECK (daily_limit_minor > 0)`, `unit_limit_minor bigint CHECK (unit_limit_minor IS NULL OR unit_limit_minor > 0)`, `soft_review_threshold_minor bigint CHECK (soft_review_threshold_minor IS NULL OR soft_review_threshold_minor > 0)`, `timezone text NOT NULL`, `version bigint NOT NULL DEFAULT 1 CHECK (version >= 1)`, `created_at timestamptz NOT NULL DEFAULT now()`, `updated_at timestamptz NOT NULL DEFAULT now()`.
   - Constraints: `UNIQUE (owner_id, currency)`, `UNIQUE (owner_id, id)`, `CHECK (per_order_hard_limit_minor <= daily_limit_minor)`, `CHECK (unit_limit_minor IS NULL OR unit_limit_minor <= per_order_hard_limit_minor)`, `CHECK (soft_review_threshold_minor IS NULL OR soft_review_threshold_minor <= per_order_hard_limit_minor)`.

2. **`budget_windows`**:
   - Columns: `id uuid PRIMARY KEY DEFAULT gen_random_uuid()`, `owner_id uuid NOT NULL REFERENCES users(id)`, `policy_id uuid NOT NULL`, `local_date text NOT NULL CHECK (local_date ~ '^\d{4}-\d{2}-\d{2}$')`, `timezone_snapshot text NOT NULL`, `starts_at timestamptz NOT NULL`, `ends_at timestamptz NOT NULL`, `policy_version bigint NOT NULL CHECK (policy_version >= 1)`, `created_at timestamptz NOT NULL DEFAULT now()`.
   - Constraints: `UNIQUE (owner_id, id)`, `UNIQUE (policy_id, starts_at, ends_at)`, `CHECK (ends_at > starts_at)`, `FOREIGN KEY (owner_id, policy_id) REFERENCES budget_policies(owner_id, id)`.

3. **`budget_reservations`**:
   - Columns: `id uuid PRIMARY KEY DEFAULT gen_random_uuid()`, `owner_id uuid NOT NULL REFERENCES users(id)`, `operation_id uuid NOT NULL`, `budget_id uuid NOT NULL`, `budget_window_id uuid`, `currency char(3) NOT NULL CHECK (currency ~ '^[A-Z]{3}$')`, `amount_minor bigint NOT NULL CHECK (amount_minor > 0)`, `status text NOT NULL CHECK (status IN ('ACTIVE', 'COMMITTED', 'RELEASED'))`, `created_at timestamptz NOT NULL DEFAULT now()`, `committed_at timestamptz`, `released_at timestamptz`, `investigate_after timestamptz`.
   - Constraints: `UNIQUE (operation_id)`, `UNIQUE (owner_id, id)`, `FOREIGN KEY (owner_id, operation_id) REFERENCES purchase_operations(owner_id, id)`, `FOREIGN KEY (owner_id, budget_id) REFERENCES budgets(owner_id, id)`, `FOREIGN KEY (owner_id, budget_window_id) REFERENCES budget_windows(owner_id, id)`, `CHECK ((status = 'ACTIVE' AND committed_at IS NULL AND released_at IS NULL) OR (status = 'COMMITTED' AND committed_at IS NOT NULL AND released_at IS NULL) OR (status = 'RELEASED' AND released_at IS NOT NULL AND committed_at IS NULL))`.

4. **`budget_entries`**:
   - Columns: `id uuid PRIMARY KEY DEFAULT gen_random_uuid()`, `owner_id uuid NOT NULL REFERENCES users(id)`, `budget_id uuid NOT NULL`, `budget_window_id uuid`, `operation_id uuid NOT NULL`, `kind text NOT NULL CHECK (kind IN ('SPEND', 'REFUND'))`, `amount_minor bigint NOT NULL CHECK (amount_minor > 0)`, `currency char(3) NOT NULL CHECK (currency ~ '^[A-Z]{3}$')`, `reference_spend_entry_id uuid`, `external_event_key text NOT NULL UNIQUE`, `posted_at timestamptz NOT NULL DEFAULT now()`.
   - Constraints: `UNIQUE (owner_id, id)`, `FOREIGN KEY (owner_id, budget_id) REFERENCES budgets(owner_id, id)`, `FOREIGN KEY (owner_id, operation_id) REFERENCES purchase_operations(owner_id, id)`.

5. **`execution_attempts`, `external_orders`, and `refunds`**:
   - `execution_attempts`: `id uuid PRIMARY KEY DEFAULT gen_random_uuid()`, `owner_id uuid NOT NULL REFERENCES users(id)`, `operation_id uuid NOT NULL UNIQUE`, `adapter_id uuid NOT NULL REFERENCES vendor_adapters(id)`, `adapter_version text NOT NULL`, `environment text NOT NULL CHECK (environment IN ('FIXTURE', 'SANDBOX'))`, `stable_request_key text NOT NULL UNIQUE`, `status text NOT NULL CHECK (status IN ('PREPARED', 'SUBMITTING', 'UNKNOWN', 'CONFIRMED_SUCCESS', 'CONFIRMED_FAILURE'))`, `provider_payment_ref text`, `vendor_order_ref text`, `requested_total_minor bigint NOT NULL CHECK (requested_total_minor > 0)`, `currency char(3) NOT NULL`, `submitted_at timestamptz`, `last_checked_at timestamptz`, `safe_error text`, `version bigint NOT NULL DEFAULT 1 CHECK (version >= 1)`, `created_at timestamptz NOT NULL DEFAULT now()`, `updated_at timestamptz NOT NULL DEFAULT now()`, `FOREIGN KEY (owner_id, operation_id) REFERENCES purchase_operations(owner_id, id)`.
   - `external_orders`: `id uuid PRIMARY KEY DEFAULT gen_random_uuid()`, `owner_id uuid NOT NULL REFERENCES users(id)`, `operation_id uuid NOT NULL UNIQUE`, `adapter_id uuid NOT NULL REFERENCES vendor_adapters(id)`, `environment text NOT NULL CHECK (environment IN ('FIXTURE', 'SANDBOX'))`, `vendor_order_ref text NOT NULL`, `provider_payment_ref text`, `vendor_status text NOT NULL CHECK (vendor_status IN ('PENDING', 'CONFIRMED', 'FAILED', 'CANCELLED'))`, `payment_status text NOT NULL CHECK (payment_status IN ('PENDING', 'CAPTURED', 'FAILED', 'REFUNDED', 'PARTIALLY_REFUNDED'))`, `verified_at timestamptz NOT NULL DEFAULT now()`, `sanitized_receipt jsonb NOT NULL DEFAULT '{}'::jsonb`, `UNIQUE (adapter_id, environment, vendor_order_ref)`, `FOREIGN KEY (owner_id, operation_id) REFERENCES purchase_operations(owner_id, id)`.
   - `refunds`: `id uuid PRIMARY KEY DEFAULT gen_random_uuid()`, `owner_id uuid NOT NULL REFERENCES users(id)`, `operation_id uuid NOT NULL`, `external_ref text NOT NULL UNIQUE`, `expected_amount_minor bigint NOT NULL CHECK (expected_amount_minor > 0)`, `confirmed_amount_minor bigint CHECK (confirmed_amount_minor IS NULL OR confirmed_amount_minor > 0)`, `currency char(3) NOT NULL`, `status text NOT NULL CHECK (status IN ('PENDING', 'CONFIRMED', 'FAILED'))`, `last_checked_at timestamptz NOT NULL DEFAULT now()`, `created_at timestamptz NOT NULL DEFAULT now()`, `FOREIGN KEY (owner_id, operation_id) REFERENCES purchase_operations(owner_id, id)`.

6. **Column & Constraint Extensions on Existing Tables**:
   - `approvals`: `ADD COLUMN IF NOT EXISTS policy_version bigint NOT NULL DEFAULT 1`, `ADD COLUMN IF NOT EXISTS consumed_at timestamptz`.
   - `purchase_operations`: `ADD COLUMN IF NOT EXISTS policy_version bigint NOT NULL DEFAULT 1`, `ADD COLUMN IF NOT EXISTS reservation_id uuid`, `ADD COLUMN IF NOT EXISTS dispatch_started_at timestamptz`. Update `purchase_operations_state_check` to allow `'DISCOVERING'`, `'QUOTED'`, `'AWAITING_APPROVAL'`, `'READY'`, `'RESERVED'`, `'SUBMITTING'`, `'RECONCILING'`, `'SUCCEEDED'`, `'FAILED'`, `'EXPIRED'`, `'CANCELLED'`, `'CANCEL_REQUESTED'`, `'FIXTURE_QUOTED'`, `'FIXTURE_AWAITING_REVIEW'`, `'FIXTURE_APPROVED'`, `'FIXTURE_COMPLETED'`, `'BLOCKED'`.
   - `vendor_quotes`: update `vendor_quotes_environment_check` to allow `environment IN ('FIXTURE', 'SANDBOX')`.
   - `procurement_obligations`: `ADD COLUMN IF NOT EXISTS external_account_ref text`. Create partial unique index `CREATE UNIQUE INDEX IF NOT EXISTS procurement_obligations_unique_bill_invoice ON procurement_obligations (owner_id, external_account_ref, COALESCE(external_invoice_ref, external_cycle_ref)) WHERE category = 'BILL' AND external_account_ref IS NOT NULL AND COALESCE(external_invoice_ref, external_cycle_ref) IS NOT NULL` (`AC-09`).

---

### Step 2: Domain Policy & Reservation Evaluation Helpers (`packages/domain/src/index.ts`)
1. Add pure deterministic policy evaluation functions in `packages/domain/src/index.ts`:
   - `evaluateSpendingPolicy(input: SpendingPolicyEvaluationInput): ValidationResult` checking:
     - Currency match across quote, instruction, budget, and policy (`CURRENCY_MISMATCH`).
     - Positive integer minor units and overflow/sign validation (`INVALID_MONEY`).
     - Unit price check: when `unitLimitMinor` is set and `unitPriceMinor > unitLimitMinor` → `UNIT_CAP_EXCEEDED`.
     - Per-order hard cap check: `totalMinor > perOrderHardLimitMinor` → `ORDER_HARD_CAP_EXCEEDED`.
     - Instruction ceiling check: `totalMinor > instructionMaxTotalMinor` → `INSTRUCTION_CAP_EXCEEDED`.
     - Shared budget allocation check: `totalMinor > availableBudgetMinor` → `INSUFFICIENT_BUDGET_CAPACITY`.
     - Daily window cap check: `totalMinor > availableDailyMinor` → `DAILY_LIMIT_EXCEEDED`.
2. Add unit tests in `packages/domain/test/domain.test.js` proving that each cap fails closed and cannot be bypassed by an `APPROVED` status flag.

---

### Step 3: API Endpoints for Budget Policies, Atomic Reservation, Dispatch & Refund Recovery (`apps/api/src/server.ts`)
1. **`PUT /api/v1/budget-policies` & `GET /api/v1/budget-policies`**:
   - Owner-scoped, idempotent creation/update of `budget_policies` (`perOrderHardLimitMinor`, `dailyLimitMinor`, `unitLimitMinor`, `softReviewThresholdMinor`, `timezone`).
   - Updating a policy increments `budget_policies.version` (`policy_version`) and invalidates pending approvals created under an older `policy_version` when the new limits are stricter (`AC-07`).
2. **`POST /api/v1/operations/:id/reserve-and-dispatch`** (and worker equivalent):
   - Executes **Phase 1 (Atomic Reservation)**:
     - Locks `procurement_instructions`, `purchase_operations`, `budgets`, `budget_policies`, and the current local-date `budget_windows` row in deterministic order (`FOR UPDATE`).
     - Verifies instruction `state === 'ACTIVE'`, quote lifecycle `state === 'ACTIVE'`, `q.expires_at > now()`, `permission_version` and `policy_version` match, and (when `REVIEW_REQUIRED` or above soft threshold) a valid unconsumed `APPROVED` approval row exists (`consumed_at IS NULL`) and marks `consumed_at = now()`.
     - Verifies vendor session and funding mandate are `ACTIVE` (`AC-12`).
     - Computes exact `availableBudgetMinor` and `availableDailyMinor` from `budget_entries` (`SPEND - REFUND`) and `budget_reservations` (`ACTIVE`, including unresolved earlier-window `ACTIVE` reservations).
     - Runs `evaluateSpendingPolicy(...)`. If any check fails, records `outcome_reason` (`ORDER_HARD_CAP_EXCEEDED`, `UNIT_CAP_EXCEEDED`, `INSUFFICIENT_BUDGET_CAPACITY`, `DAILY_LIMIT_EXCEEDED`, etc.), sets `purchase_operations.state = 'BLOCKED'`, and commits the block trace (`AC-07`, `AC-08`).
     - If all checks pass, inserts `budget_reservations (status = 'ACTIVE')` and transitions `purchase_operations.state = 'RESERVED'`.
   - Executes **Phase 2 (Pre-Dispatch Fencing, `AC-09`, `AC-10`)**:
     - Computes `stable_request_key = stableExecutionKey(operationId, quoteHash, permissionVersion)`.
     - Inserts `execution_attempts (status = 'SUBMITTING', stable_request_key, submitted_at = now())` (`ON CONFLICT (operation_id) DO NOTHING`).
     - Updates `purchase_operations` to `state = 'SUBMITTING', dispatch_started_at = now()` and commits **before** adapter I/O.
   - Executes **Phase 3 (Controlled Sandbox / Fault-Injectable Execution, `AC-10`)**:
     - Supports deterministic sandbox execution modes for testing and verification (`faultMode`: `'NONE'`, `'LOST_RESPONSE_AFTER_SUCCESS'`, `'CRASH_BEFORE_REFS'`, `'PAYMENT_CAPTURED_VENDOR_PENDING'`, `'DEFINITIVE_FAILURE'`).
     - On `'LOST_RESPONSE_AFTER_SUCCESS'` or `'CRASH_BEFORE_REFS'`: records external order in the sandbox provider store under `stable_request_key`, sets `execution_attempts.status = 'UNKNOWN'`, transitions `purchase_operations.state = 'RECONCILING'`, keeps `budget_reservations.status = 'ACTIVE'`, and enqueues a `RECONCILE` job (`dedupe_key = 'reconcile:' || operationId`).
     - On `'PAYMENT_CAPTURED_VENDOR_PENDING'`: records `payment_status = 'CAPTURED'` and `vendor_status = 'PENDING'`, keeps `purchase_operations.state = 'RECONCILING'` and `budget_reservations.status = 'ACTIVE'` (`AC-10`: payment success without confirmed vendor outcome stays unresolved).
     - On `'DEFINITIVE_FAILURE'`: sets `execution_attempts.status = 'CONFIRMED_FAILURE'`, `purchase_operations.state = 'FAILED'`, and `budget_reservations.status = 'RELEASED', released_at = now()`.
     - On `'NONE'` (confirmed payment + confirmed vendor outcome): sets `execution_attempts.status = 'CONFIRMED_SUCCESS'`, inserts `external_orders (vendor_status = 'CONFIRMED', payment_status = 'CAPTURED')`, sets `budget_reservations.status = 'COMMITTED', committed_at = now()`, inserts `budget_entries (kind = 'SPEND', external_event_key = 'spend:' || operationId)`, marks `procurement_obligations.satisfied_at = now()`, increments `procurement_instructions.fulfilled_count` (transitioning instruction to `'COMPLETED'` when `fulfilled_count >= completion_limit`), and sets `purchase_operations.state = 'SUCCEEDED'`.
3. **`POST /api/v1/operations/:id/refunds`**:
   - Records a `PENDING` or `CONFIRMED` refund in `refunds`.
   - When `status === 'PENDING'`, no `budget_entries` row is created and budget capacity is **not** restored (`AC-08`).
   - When `status === 'CONFIRMED'`, verifies cumulative confirmed refunds for `operation_id` do not exceed the original `SPEND` entry, inserts `budget_entries (kind = 'REFUND', amount_minor = confirmed_amount_minor, external_event_key = 'refund:' || external_ref)`, and updates `external_orders.payment_status` (`PARTIALLY_REFUNDED` or `REFUNDED`).

---

### Step 4: Worker Reconciliation & Lease-Expiry Safety (`apps/worker/src/worker.ts`)
1. Update `processJob` for `job_type === 'RECONCILE'` in `apps/worker/src/worker.ts`:
   - Looks up `purchase_operations`, `execution_attempts`, and `budget_reservations` by `operationId` under `withCurrentLease`.
   - Queries the sandbox/fixture provider state using the persisted `execution_attempts.stable_request_key` (never generating a new key or submitting a second purchase).
   - If the provider confirms both `payment_status === 'CAPTURED'` and `vendor_status === 'CONFIRMED'`, atomically transitions `execution_attempts.status = 'CONFIRMED_SUCCESS'`, `purchase_operations.state = 'SUCCEEDED'`, `budget_reservations.status = 'COMMITTED'`, posts `budget_entries (kind = 'SPEND')` idempotently (`ON CONFLICT (external_event_key) DO NOTHING`), and marks the obligation/instruction satisfied.
   - If the provider reports `payment_status === 'CAPTURED'` but `vendor_status === 'PENDING'`, keeps `purchase_operations.state = 'RECONCILING'` and `budget_reservations.status = 'ACTIVE'`.
2. Ensure expired worker lease recovery on a `SUBMITTING` / `RECONCILING` operation never re-runs Phase 1/2 dispatch and instead reconciles the existing `execution_attempts` row via `stable_request_key` (`AC-08`, `AC-09`, `AC-10`).

---

### Step 5: Dedicated PostgreSQL M3 Verification Suite (`scripts/test-m3-reservations-and-execution.mjs`)
1. Create `scripts/test-m3-reservations-and-execution.mjs` and register `"test:m3": "npm run test:domain && npm run build:api && npm run build:worker && node --env-file-if-exists=.env scripts/test-m3-reservations-and-execution.mjs"` in `package.json`.
2. Verify all four core M3 acceptance scenarios against live PostgreSQL (`127.0.0.1:5433`):
   - **Scenario 1 (`AC-07` — Hard Spending Caps & Policy Fencing)**:
     - Enforce unit cap (`UNIT_CAP_EXCEEDED`), per-order hard cap (`ORDER_HARD_CAP_EXCEEDED`), instruction ceiling (`INSTRUCTION_CAP_EXCEEDED`), budget allocation cap (`INSUFFICIENT_BUDGET_CAPACITY`), and daily window cap (`DAILY_LIMIT_EXCEEDED`).
     - Prove that an `APPROVED` approval cannot override a hard cap.
     - Prove that updating `budget_policies` increments `policy_version` and forces fresh evaluation (blocking a previously approved quote that exceeds the new lower cap).
   - **Scenario 2 (`AC-08` — Concurrent 50-Remaining vs. Two 40-Unit Obligations, Rollover & Refunds)**:
     - Seed a shared budget with `5000` minor units (`$50.00`) remaining and two eligible `4000` minor-unit (`$40.00`) operations across shared instructions.
     - Fire both `reserve-and-dispatch` requests concurrently via `Promise.all`.
     - Assert **exactly 1** succeeds (`SUCCEEDED` / `COMMITTED`, `SPEND = 4000`) and **1** blocks (`INSUFFICIENT_BUDGET_CAPACITY`), leaving `1000` (`$10.00`) remaining.
     - Test period rollover: an unresolved `ACTIVE` reservation from an earlier window continues to count against available capacity until resolved.
     - Test refunds: a `PENDING` refund of `1500` restores `0` capacity; a `CONFIRMED` refund of `1500` restores exactly `1500` (`available` becomes `2500`), and duplicate refund replay posts only once.
   - **Scenario 3 (`AC-09` — Idempotent Attempt Identity, One-Time Fulfillment Stop & Cross-Instruction Bill Deduplication)**:
     - Verify client retries, duplicate triggers, and expired worker leases reuse the exact same `stable_request_key` and `execution_attempts` row.
     - Verify a `ONE_TIME` instruction transitions to `state = 'COMPLETED'` (`fulfilled_count = 1`, `next_run_at = NULL`) after success and rejects any second dispatch.
     - Create two separate `BILL` instructions referencing the same `(external_account_ref, external_invoice_ref)` and verify PostgreSQL blocks the second obligation/payment from executing (`DUPLICATE_BILL_OBLIGATION`).
   - **Scenario 4 (`AC-10` — Lost Response, Worker Crash Before Refs & Unconfirmed Vendor Outcome)**:
     - Trigger `faultMode: 'LOST_RESPONSE_AFTER_SUCCESS'`: verify operation enters `RECONCILING`, `execution_attempts.status = 'UNKNOWN'`, `budget_reservations.status = 'ACTIVE'` (not released early), and worker `RECONCILE` job recovers the order to `SUCCEEDED` + `COMMITTED` using `stable_request_key` with **1** `SPEND` entry and **0** duplicate purchases.
     - Trigger `faultMode: 'PAYMENT_CAPTURED_VENDOR_PENDING'`: verify operation remains `RECONCILING` and reservation stays `ACTIVE` while vendor outcome is unconfirmed.
   - **Scenario 5 (`AC-02`, `AC-06`, `AC-12` — End-to-End `PRE_APPROVED` & `REVIEW_REQUIRED` Sandbox Operations)**:
     - Demonstrate 1 complete `PRE_APPROVED` sandbox operation and 1 complete `REVIEW_REQUIRED` sandbox operation with `liveExecutionEnabled: false` preserved on all `LIVE` adapters.

---

## 4. Verification & Exit Checklist

| Checkpoint | Target Contract | Verification Suite / Evidence |
| :--- | :--- | :--- |
| **AC-07 Pass** | Unit, order, instruction, allocation, and daily caps enforced; generic approval cannot override; policy edit forces fresh check | `npm run test:m3` + `npm run test:domain` |
| **AC-08 Pass** | Concurrent 50-remaining vs. two 40-unit obligations allows at most 1 reservation/dispatch; confirmed refund restores exact amount; unknown liability stays reserved | `npm run test:m3` (PostgreSQL `FOR UPDATE` concurrency race) |
| **AC-09 Pass** | Retries/expired leases reuse `stable_request_key`; one-time need stops at `COMPLETED`; duplicate bill across two instructions blocked | `npm run test:m3` |
| **AC-10 Pass** | Lost success response & worker crash before refs recovered via `RECONCILE` without second purchase; payment without vendor confirmation stays `RECONCILING` | `npm run test:m3` |
| **Full Regression** | Zero regressions across M0, M1, M2, and production web build | `npm run test:m0`, `test:ac03`, `test:m1:workflow`, `test:m2`, `test:auth`, `test:paypal`, `test:acceptance`, `npm run build` |

---

## 5. Completion Report — 2 November 2026

**M3 implementation is complete and verified against local PostgreSQL using the deterministic local fixture adapter. Provider sandbox checkout and live execution are not claimed or enabled.**

Delivered migration `016`, domain spending-policy validation, owner-scoped budget-policy APIs, atomic reservation and attempt persistence, stable-key local execution and reconciliation, confirmed-only refund ledgering, worker pre-approved dispatch, and the dedicated `test:m3` PostgreSQL suite. Existing bill-obligation writers now persist external bill identity and reject cross-instruction duplicates. `APPAI_EXECUTION_MODE=local-sandbox` is required for the local execution path; `liveExecutionEnabled` remains false.

| Date | Command | Environment / adapter | Result |
| :--- | :--- | :--- | :--- |
| 2 Nov 2026 | `npm run test:m3` | Local PostgreSQL at `127.0.0.1:5433`; deterministic local fixture execution | **PASS** — hard caps and policy fencing; shared-budget concurrency; one-time replay; confirmed-only refund restoration; prior-window liability; cross-instruction bill uniqueness; worker dispatch; lost-response recovery; captured-payment/vendor-pending hold. Domain 9/9; API and worker TypeScript builds passed. |
| 2 Nov 2026 | `npm run test:m0` | Local PostgreSQL; fixture capability adapters | **PASS** — AC-02, AC-12, AC-17, expired-session blocking, mandate revocation, preserved reconciliation. |
| 2 Nov 2026 | `npm run test:m2` | Local PostgreSQL; fixture discovery and quote workflows | **PASS** — M1 fixture workflow and M2 discovery, quote, approval, and watch coverage. |
| 2 Nov 2026 | `npm run test:ac03` | Local PostgreSQL; fixture worker | **PASS** — schedule, timezone, DST, edit fencing, and missed-tick matrix. |
| 2 Nov 2026 | `npm run test:auth` | Local auth test environment | **PASS** — invite enrollment, session, isolation, expiry, CSRF, and fail-closed configuration. |
| 2 Nov 2026 | `npm run test:paypal` | Local PayPal contract stubs; no provider call | **PASS** — 3/3 adapter contract and capability tests. |
| 2 Nov 2026 | `npm run test:acceptance` | Local deterministic acceptance matrix | **PASS** — 101/101 assertions. |
| 2 Nov 2026 | `npm run build` | Local Vite production build | **PASS** — production assets built with no errors. |

The M0 suite initially exposed a worker compatibility regression: legacy fixture `RECONCILE` jobs without an `operationId` no longer completed. The worker now preserves their existing completion behavior; operation-backed M3 reconciliation still uses the persisted stable request key. The rerun passed.

Remaining gates: provider-sandbox vendor checkout and live execution require separate capability evidence and approval; neither is enabled by this milestone. Commit checkpoint is recorded in `docs/WORK-STATUS.md` after commit creation (`260d1b9`).

---

## 6. Chief Engineer Review & Sign-Off — 2 November 2026

**Verdict: GREEN-LIT (`AC-07`, `AC-08`, `AC-09`, `AC-10` — Local PostgreSQL & Deterministic Fixture Execution Verified; Provider Sandbox Checkout & Live Execution Disabled)**

### Architectural & Code Audit Summary
1. **Migration `016` (`packages/persistence/migrations/016_m3_reservations_ledger_and_attempts.sql`)**:
   - Defines `budget_policies`, `budget_windows`, `budget_reservations`, `budget_entries`, `execution_attempts`, `external_orders`, and `refunds` with strict owner isolation, positive minor-unit checks, `UNIQUE(operation_id)` and `UNIQUE(stable_request_key)` fences on `execution_attempts`, and `reference_spend_entry_id` integrity on `REFUND` ledger entries.
   - Adds the `approvals_stamp_policy_version` trigger so every approval captures the current `budget_policies.version`, and `PUT /api/v1/budget-policies` invalidates unconsumed approvals from older policy versions.
   - Adds partial unique index `procurement_obligations_unique_bill_invoice` on `(owner_id, external_account_ref, COALESCE(external_invoice_ref, external_cycle_ref)) WHERE category = 'BILL'` to prevent duplicate bill obligations across instructions (`AC-09`).
2. **Domain Spending Policy (`packages/domain/src/index.ts` — `evaluateSpendingPolicy`)**:
   - Enforces currency alignment across quote, instruction, budget, and policy, alongside `UNIT_CAP_EXCEEDED`, `INSTRUCTION_CAP_EXCEEDED`, `ORDER_HARD_CAP_EXCEEDED`, `INSUFFICIENT_BUDGET_CAPACITY`, and `DAILY_LIMIT_EXCEEDED`.
   - Unit test in `packages/domain/test/domain.test.js` (`9/9` passing) verifies that an `APPROVED` decision never overrides any hard cap.
3. **Atomic Reservation, Pre-Dispatch Fencing, and Reconciliation (`packages/execution/src/reservations.ts`)**:
   - `prepareLocalExecution` acquires `FOR UPDATE` locks in deterministic order (`procurement_instructions` → `purchase_operations` → `vendor_accounts` → `budgets` → `budget_policies` → `budget_windows` → `vendor_quotes` → `funding_mandates` → `approvals`), recomputes net spend (`SPEND - REFUND`) plus `ACTIVE` reservations (including prior-window unresolved `ACTIVE` reservations on the same policy), consumes the quote-bound approval atomically, and persists both the `ACTIVE` `budget_reservations` row and `SUBMITTING` `execution_attempts` row with `stableExecutionKey(operationId, quoteHash, permissionVersion)` before any execution step.
   - `applyLocalSandboxOutcome` and `reconcileLocalSandboxExecution` recover `LOST_RESPONSE_AFTER_SUCCESS` and `CRASH_BEFORE_REFS` via `stable_request_key` without issuing a second purchase, hold `PAYMENT_CAPTURED_VENDOR_PENDING` in `RECONCILING` with its reservation kept `ACTIVE`, and only convert `ACTIVE` → `COMMITTED` + `SPEND` when both `payment_status = 'CAPTURED'` and `vendor_status = 'CONFIRMED'`.
4. **API & Worker Integration (`apps/api/src/server.ts`, `apps/worker/src/worker.ts`)**:
   - `GET/PUT /api/v1/budget-policies`, `POST /api/v1/operations/:id/reserve-and-dispatch`, and `POST /api/v1/operations/:id/refunds` enforce `APPAI_EXECUTION_MODE=local-sandbox` and confirmed-only refund restoration while preserving `liveExecutionEnabled: false`.
   - Worker `processOccurrence` and `RECONCILE` job handlers integrate seamlessly with `prepareLocalExecution`, `applyLocalSandboxOutcome`, and `reconcileLocalSandboxExecution` while preserving M0 compatibility for legacy fixture `RECONCILE` jobs.

### Independent Chief Engineer Verification Run (2 November 2026)
- `npm run test:m3`: **PASS** (`9/9` domain tests, API/worker builds, and all `AC-07`, `AC-08`, `AC-09`, `AC-10` PostgreSQL assertions).
- `npm run test:m0`: **PASS** (`AC-02`, `AC-12`, `AC-17`, `liveExecutionEnabled: false`).
- `npm run test:m2`: **PASS** (M1 fixture workflow + M2 discovery, quote, approval, and watch suites).
- `npm run test:paypal`: **PASS** (`3/3` PayPal contract & `AC-17` hold/deposit/bid block tests).
- `npm run test:acceptance`: **PASS** (`101/101` assertions across C01–C19).
- `npm run build`: **PASS** (`0` errors, production bundle emitted to `dist/appai-website`).

## 7. Mandatory Collaboration Lifecycle Gate

Per [`AGENTS.md`](../AGENTS.md):
> **Mandatory Collaboration Lifecycle**: Always follow **Problem → Solution → Plan → Signed → Implementation**.
> Halt and wait for user sign-off ("signed" / "proceed") before applying modifications.

**Lifecycle record**: Problem, solution, implementation plan, owner sign-off, implementation (`260d1b9`), and Chief Engineer verification & sign-off are **COMPLETE and GREEN-LIT**.
