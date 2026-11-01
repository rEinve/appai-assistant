# Harden & Close the 4 M1 Gaps — Implementation Plan

Status: **Complete & Verified (PostgreSQL & Acceptance Verified)**  
Date: **2 November 2026**  
Scope: Milestone M1 Technical Hardening (`AC-01`, `AC-03`, `AC-14`, `AC-20`, `M1-G`, `M1-H`)  
Related Specifications:
- [Technical Requirements](A-P-P-A-I-agent-technical-requirements-document.md) (§ 3, § 4, § 7)
- [Schema Specification](A-P-P-A-I-agent-schema.md) (§ 2, § 3)
- [Implementation Plan](A-P-P-A-I-agent-product-implementation-plan.md) (`M1-G`, `M1-H`, Priority Correction)
- [Acceptance Matrix](DEVELOPMENT-ACCEPTANCE.md) (`AC-01`, `AC-03`, `AC-11`, `AC-14`, `AC-20`)

---

## 1. Problem Statement & Root Cause Analysis

While Gate 1 (M1 Closeout) passes its current 101 acceptance assertions and the `AC-03` schedule matrix, a line-by-line code audit across `apps/api/src/server.ts`, `apps/worker/src/worker.ts`, `src/api/client.ts`, and `scripts/` identified **4 concrete technical & documentation gaps** between the implementation and the v1.1 contracts:

1. **Gap 1 — Schedule & Agreement Edits on Already-`ACTIVE` / `PAUSED` Instructions Are Blocked or Unfenced (`AC-03`, `AC-11`, `AC-20`)**
   - `PATCH /api/v1/instructions/{id}/configuration` (`apps/api/src/server.ts` line 929) rejects non-`DRAFT` instructions with `409 INSTRUCTION_NOT_EDITABLE`.
   - `POST /api/v1/instructions/{id}/agreement/confirm` (`apps/api/src/server.ts` lines 765–895) updates `current_agreement_id` and `version`, but does **not** increment `permission_version`, does **not** recompute `schedule_config` or `next_run_at`, does **not** fence queued `READY`/`RETRY_WAIT` jobs from the superseded schedule, and does **not** invalidate `PENDING` approvals in PostgreSQL.
   - `processOccurrence` (`apps/worker/src/worker.ts` lines 296–323) and `processObservation` (`apps/worker/src/worker.ts` lines 446–466) do **not** verify `Number(instruction.permissionVersion) === Number(scheduleVersion)` before executing a claimed job.

2. **Gap 2 — Private Supplier `PATCH` & `DELETE` PostgreSQL Acceptance + Frontend Client Wiring (`M1-H`, `AC-14`)**
   - `apps/api/src/server.ts` (lines 1264–1342) implements owner-scoped, `If-Match` version-checked `PATCH /api/v1/member-suppliers/{id}` and `DELETE /api/v1/member-suppliers/{id}` (including cascading cleanup of `budget_supplier_preferences` and bumping `budgets.version`).
   - However, `scripts/test-m1-fixture-workflow.mjs` (lines 201–256) only exercises `POST` and `GET` against PostgreSQL, and `src/api/client.ts` does not expose client methods for `/api/v1/suppliers` or `/api/v1/member-suppliers`.

3. **Gap 3 — `fulfilled_count` & `COMPLETED` Lifecycle Transition on One-Time / Scheduled Fixtures (`M1-G`, `AC-03`, `AC-09`)**
   - `procurement_instructions` defines `completion_limit` (default `1` for `ONE_TIME`, `SCHEDULED`, `WATCH`) and `fulfilled_count`, and `processOccurrence` (`apps/worker/src/worker.ts` line 321) checks `instruction.fulfilledCount >= instruction.completionLimit`.
   - However, when a fixture operation completes (`FIXTURE_COMPLETED` for `PRE_APPROVED` in `apps/worker/src/worker.ts` line 394, or `FIXTURE_APPROVED` for `REVIEW_REQUIRED` in `apps/api/src/server.ts` line 1942), `fulfilled_count` is never incremented, so `completion_limit` is never reached in PostgreSQL.

4. **Gap 4 — Remaining Stale References in `docs/M1-EVIDENCE.md` & `docs/A-P-P-A-I-agent-product-implementation-plan.md`**
   - While `docs/README.md` and `docs/WORK-STATUS.md` were updated on 2 November 2026, the top status banner of `docs/M1-EVIDENCE.md` (lines 3–4) and the status headers of `docs/A-P-P-A-I-agent-product-implementation-plan.md` (lines 3–4, 68, 120) still describe `AC-03` and `M1-H` as unaccepted.

---

## 2. Solution Architecture & Trade-Offs

| Gap | Selected Solution | Rationale / Invariant Preserved |
| :--- | :--- | :--- |
| **Gap 1: Active Schedule Fencing** | 1. Allow `PATCH /api/v1/instructions/{id}/configuration` and `POST /api/v1/instructions/{id}/agreement/confirm` to update `DRAFT`, `ACTIVE`, and `PAUSED` instructions.<br>2. On material/schedule change to an `ACTIVE`/`PAUSED` instruction: increment `permission_version`, recompute `schedule_config` and `next_run_at` (or `paused_next_run_at`), block queued `READY`/`RETRY_WAIT` jobs (`INSTRUCTION_SCHEDULE_UPDATED`), and mark `PENDING` approvals `INVALIDATED`.<br>3. Add `Number(instruction.permissionVersion) !== Number(scheduleVersion)` guard in `worker.ts` (`STALE_SCHEDULE_VERSION`). | Matches Schema § 3.1 (*"Activate/change/revoke instruction: update version and authority, invalidate stale approvals, fence future jobs, append audit and outbox atomically"*). In-flight/completed operations are untouched. |
| **Gap 2: Private Supplier CRUD & Client** | 1. Add typed `getSuppliers()`, `createPrivateSupplier()`, `updatePrivateSupplier()`, and `deletePrivateSupplier()` methods to `src/api/client.ts`.<br>2. Extend `scripts/test-m1-fixture-workflow.mjs` to test PostgreSQL `PATCH` and `DELETE /api/v1/member-suppliers/{id}`, stale `If-Match` (`412`), cross-member edit/delete denial (`404`), and cascade removal from `budget_supplier_preferences`. | Proves the full `M1-H` database contract and keeps the React client aligned with the backend API. |
| **Gap 3: Fulfillment Counter & Stop Rule** | Increment `fulfilled_count` when a purchasing fixture reaches terminal fixture completion (`PRE_APPROVED` → `FIXTURE_COMPLETED` in `worker.ts`; `REVIEW_REQUIRED` → `FIXTURE_APPROVED` in `server.ts`), while keeping `state = 'ACTIVE'` (or recording `fulfilled_count = 1`) and ensuring any subsequent occurrence trigger is blocked by `COMPLETION_LIMIT_REACHED`. | Exercises the `fulfilled_count <= completion_limit` check constraint and `COMPLETION_LIMIT_REACHED` worker guard without breaking existing pause/resume/revoke lifecycle tests. |
| **Gap 4: Docs Alignment** | Update the status headers in `docs/M1-EVIDENCE.md` and `docs/A-P-P-A-I-agent-product-implementation-plan.md` to reflect the 2 November 2026 M1 closeout evidence. | Eliminates contradictory status banners across the `docs/` tree. |

---

## 3. Step-by-Step Implementation Plan for Dev

### Step 1: Worker Schedule-Version Fencing (`apps/worker/src/worker.ts`)

1. **In `processOccurrence` (`apps/worker/src/worker.ts` around line 318)**:
   - Immediately after checking `instruction.state !== 'ACTIVE' || instruction.environment !== 'FIXTURE'`, enforce that the job's `scheduleVersion` matches the instruction's current `permissionVersion`:
     ```ts
     if (Number(instruction.permissionVersion) !== Number(scheduleVersion)) {
       return block('STALE_SCHEDULE_VERSION');
     }
     ```
2. **In `processObservation` (`apps/worker/src/worker.ts` around line 440)**:
   - Read `const scheduleVersion = job.payload['scheduleVersion'];` and select `permission_version AS "permissionVersion"` in the `SELECT ... FROM procurement_instructions` query.
   - Enforce:
     ```ts
     if (scheduleVersion !== undefined && Number(instruction.permissionVersion) !== Number(scheduleVersion)) {
       return block('STALE_SCHEDULE_VERSION');
     }
     ```

---

### Step 2: Active/Paused Instruction Schedule Edits & Fencing (`apps/api/src/server.ts`)

1. **In `PATCH /api/v1/instructions/{id}/configuration` (`apps/api/src/server.ts` around line 929)**:
   - Relax the state guard from `current.state !== 'DRAFT'` to allow `DRAFT`, `ACTIVE`, and `PAUSED`:
     ```ts
     if (!['DRAFT', 'ACTIVE', 'PAUSED'].includes(current.state)) {
       await db.query('ROLLBACK');
       return json(response, 409, { code: 'INSTRUCTION_NOT_EDITABLE', message: 'Cancelled, expired, or completed instructions cannot be reconfigured.' });
     }
     ```
   - When `current.state === 'ACTIVE'`, set `next_run_at = effectiveFirstRunAt ?? COALESCE(effectiveValidFrom, now())`. When `current.state === 'PAUSED'`, set `next_run_at = NULL` and `paused_next_run_at = effectiveFirstRunAt ?? COALESCE(effectiveValidFrom, now())`.
   - When `current.state === 'ACTIVE'` or `'PAUSED'`, atomically fence any queued jobs and pending approvals in the same transaction:
     ```ts
     await db.query(
       `UPDATE jobs SET state = 'BLOCKED', last_error_code = 'INSTRUCTION_SCHEDULE_UPDATED',
               lease_owner = NULL, lease_expires_at = NULL, updated_at = now()
        WHERE instruction_id = $1 AND owner_id = $2 AND state IN ('READY', 'RETRY_WAIT')`,
       [configurationMatch[1], member.id],
     );
     await db.query(
       `UPDATE approvals SET status = 'INVALIDATED', decided_at = now(), version = version + 1
        WHERE owner_id = $1 AND status = 'PENDING'
          AND operation_id IN (SELECT id FROM purchase_operations WHERE instruction_id = $2 AND owner_id = $1)`,
       [member.id, configurationMatch[1]],
     );
     ```
2. **In `POST /api/v1/instructions/{id}/agreement/confirm` (`apps/api/src/server.ts` around lines 864–883)**:
   - Accept optional `validFromLocal`, `validUntilLocal`, and `dueAtLocal` in the request payload to update schedule timing when confirming a revised agreement.
   - Increment `permission_version = permission_version + 1` along with `version = version + 1`.
   - Run the same two `UPDATE` statements on `jobs` (`INSTRUCTION_SCHEDULE_UPDATED`) and `approvals` (`INVALIDATED`) so confirming a new agreement version in chat strictly invalidates unused approvals and fences stale queued jobs in PostgreSQL (`AC-20`).

---

### Step 3: Private Supplier Client Wiring & PostgreSQL `PATCH`/`DELETE` Tests (`src/api/client.ts` & `scripts/test-m1-fixture-workflow.mjs`)

1. **In `src/api/client.ts`**:
   - Add interfaces `ApiCatalogueSupplier` and `ApiPrivateSupplier` and methods on `ApiClient`:
     - `getSuppliers(): Promise<{ catalogue: ApiCatalogueSupplier[]; mySuppliers: ApiPrivateSupplier[] }>` (`GET /api/v1/suppliers`)
     - `createPrivateSupplier(data: { name: string; categories: string[]; serviceAreas?: string[]; privateNotes?: string }): Promise<{ supplier: ApiPrivateSupplier }>` (`POST /api/v1/member-suppliers` with `Idempotency-Key`)
     - `updatePrivateSupplier(id: string, version: number | string, data: { name: string; categories: string[]; serviceAreas?: string[]; privateNotes?: string }): Promise<{ supplier: ApiPrivateSupplier }>` (`PATCH /api/v1/member-suppliers/${id}` with `If-Match: "${version}"`)
     - `deletePrivateSupplier(id: string, version: number | string): Promise<void>` (`DELETE /api/v1/member-suppliers/${id}` with `If-Match: "${version}"`)
2. **In `scripts/test-m1-fixture-workflow.mjs` (after line 255)**:
   - Add PostgreSQL integration assertions for:
     - `PATCH /api/v1/member-suppliers/{ownerSupplierOneId}` with valid `If-Match: "1"` → `200 OK`, `version === 2`, updated `serviceAreas` and `privateNotes` persisted.
     - `PATCH /api/v1/member-suppliers/{ownerSupplierOneId}` with stale `If-Match: "1"` → `412 VERSION_CONFLICT`.
     - Cross-member `PATCH` and `DELETE` by `other.cookie` against `ownerSupplierOneId` → `404 PRIVATE_SUPPLIER_NOT_FOUND`.
     - Create a third temporary supplier `ownerSupplierThree`, rank it in `PUT /api/v1/budgets/{budgetId}/suppliers`, then `DELETE /api/v1/member-suppliers/{ownerSupplierThreeId}` with `If-Match: "1"` → `204 No Content`.
     - Verify `GET /api/v1/budgets` no longer includes `ownerSupplierThreeId` in `preferredSuppliers` and that `budgets.version` incremented.

---

### Step 4: Fulfillment Counter & Active-Schedule Edit Verification (`apps/worker/src/worker.ts`, `scripts/test-ac03-schedule-matrix.mjs`)

1. **In `apps/worker/src/worker.ts` (`processOccurrence` around line 394)**:
   - When `instruction.mode === 'PRE_APPROVED'` transitions a newly created fixture operation to `FIXTURE_COMPLETED`, increment `fulfilled_count` on `procurement_instructions`:
     ```ts
     if (instruction.mode === 'PRE_APPROVED') {
       await db.query(
         `UPDATE procurement_instructions
          SET fulfilled_count = CASE
                WHEN completion_limit IS NOT NULL THEN LEAST(completion_limit, fulfilled_count + 1)
                ELSE fulfilled_count + 1
              END,
              updated_at = now()
          WHERE id = $1 AND owner_id = $2`,
         [instructionId, job.owner_id],
       );
     }
     ```
2. **In `scripts/test-ac03-schedule-matrix.mjs` (`Scenario C` around line 420)**:
   - Extend Scenario C so that **after** the recurring instruction is `ACTIVE`:
     - Enqueue a `READY` job with the old `permission_version` (while worker is paused/stopped).
     - Call `PATCH /api/v1/instructions/{editInstId}/configuration` on the `ACTIVE` instruction to change `dueAtLocal` to Day 20 at `16:00`.
     - Assert HTTP `200`, `permission_version` incremented (`3 → 4`), the pre-edit `READY` job is now `state = 'BLOCKED'` with `last_error_code = 'INSTRUCTION_SCHEDULE_UPDATED'`, and when the worker runs the new schedule, it executes only the `permission:4` job without creating duplicate obligations.

---

### Step 5: Documentation Status Sync (`docs/M1-EVIDENCE.md` & `docs/A-P-P-A-I-agent-product-implementation-plan.md`)

1. **In `docs/M1-EVIDENCE.md` (lines 3–4)**:
   - Update `Status:` to:
     `Status: **Gate 1 (M1 Closeout) complete — M1-A auth, M1 fixture workflow, full AC-03 schedule/DST/missed-tick matrix, M1-H prompt/budget/supplier CRUD, Priority Correction (AC-19–21), and dependency triage (0 vulnerabilities) passed; M0 external capability and live execution remain gated**`
   - Update `Date: 2 November 2026`.
2. **In `docs/A-P-P-A-I-agent-product-implementation-plan.md` (lines 3–4, 68, 120)**:
   - Update status lines to note that M1 closeout (`AC-01`, `AC-03`, `AC-14` M1 ownership, `AC-18`, `AC-19`–`AC-21`) passed on 2 November 2026, while M0 external provider capability and M2–M5 remain the active backlog.

---

## 4. Verification & Exit Checklist

Run the following commands in order and confirm `0` errors / `100%` pass before committing:

```bash
# 1. Compile domain, API, worker, and frontend production bundle
npm run build:domain
npm run build:api
npm run build:worker
npm run build

# 2. Run domain unit tests
npm run test:domain

# 3. Run the 101-assertion acceptance matrix (Suites C01–C19)
npm run test:acceptance

# 4. Run the PostgreSQL AC-03 Schedule & Timezone Matrix (with active schedule edit fencing)
npm run test:ac03

# 5. Run the PostgreSQL M1 Fixture Workflow (with private supplier PATCH/DELETE & preference cascade)
npm run test:m1:workflow

# 6. Run the PostgreSQL M1-A Member Auth suite
npm run test:auth
```

### Expected Exit Evidence
- `npm run build`: `0` errors (`dist/appai-website` emitted cleanly).
- `npm run test:acceptance`: `101 PASSED, 0 FAILED`.
- `npm run test:ac03`: `ALL SCENARIOS PASSED` (including active-instruction schedule edit fencing `INSTRUCTION_SCHEDULE_UPDATED` and worker `STALE_SCHEDULE_VERSION` guard).
- `npm run test:m1:workflow`: `PASSED` (including private supplier `PATCH`, `DELETE`, `412` stale version rejection, `404` cross-member denial, and budget preference cascade cleanup).
- `npm run test:auth`: `PASSED`.
