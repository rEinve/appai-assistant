# A-P-P-A-I implementation plan and coding handoff

Version: **1.1** · status reviewed 2 November 2026  
Status: M1 durable instruction and job foundation closeout passed on 2 November 2026 (AC-01, AC-03 schedule matrix, AC-14 M1 ownership, AC-18, AC-19–21). Active schedule fencing, private supplier CRUD/preference cascade, and fulfillment counters are verified. M0 external access is not proven; payment execution stays disabled until its gate passes.  
Read with [PRD](A-P-P-A-I-agent-product-requirements-document.md), [technical requirements](A-P-P-A-I-agent-technical-requirements-document.md), [schema](A-P-P-A-I-agent-schema.md), [flows](A-P-P-A-I-agent-user-flow-chat.md) and [acceptance](DEVELOPMENT-ACCEPTANCE.md).

## Priority correction — owner-authorized 1 November 2026

**Instruction conversation → agreed Planner projection → payment** replaces the manual configuration journey. Earlier M1-C/E/F/H/I descriptions below record delivered work and evidence; their field-editing, manual proposal-save and non-persistent dialogue interactions are superseded requirements, not patterns to extend. Existing builds/tests do not establish acceptance of this correction.

| Step | Implementation work | Exit evidence |
| --- | --- | --- |
| 1. Domain and persistence | Add durable ordered conversation, research provenance and versioned member agreement per schema; retain existing instruction/budget/financial aggregates; migrate existing drafts without inventing agreement | PostgreSQL owner isolation, ordered reload, append retry, stale agreement conflict and unconfirmed backfill |
| 2. Assistant orchestration | One persistent composer; reuse known facts; supported read-only research with links; discuss provider/price alternatives; collect consequential gaps conversationally; label estimates and unavailable tools | Multi-turn provider rejection/research/reload journey; no repeated intake, invented prices or reply-count cutoff |
| 3. Agreement and changes | Summarize operational details and scope in dialogue; bind member confirmation to versions; changes return to that conversation and regenerate projection | Agreed provider/quantity/date/cost preserved; material change invalidates unused approval; in-flight history retained |
| 4. Planner and navigation | Replace budget dialog/manual setup with read-only day/month tasks from agreements/occurrences; remove New instruction inside existing detail and Planner; Edit instruction returns to original dialogue | Rendered phone/desktop AC-19/20; undated research has no fabricated scheduled date; no separate plan editor |
| 5. Payment | Present total, remaining allocation and Pay/Activate agreed schedule; verified funds separately where available; reuse consent, quote, reservation, idempotency and reconciliation | AC-21 plus existing AC-06–12; no payment from navigation, stale plan, estimate or unsupported provider |
| 6. Acceptance and handoff | Run focused domain/database/journey/recovery checks and applicable existing financial regressions; record environment, fixtures versus real adapters and screenshots | AC-19–21 evidence and updated status; external execution remains disabled pending M0 |

Implement this sequence before further UI polish or expanding category forms. No new payment rail, escrow or custody is introduced. No application changes or new acceptance passes are claimed by this documentation amendment.

## 1. Outcome and constraints

Build the personal procurement assistant first: persistent instructions, scheduled purchases/bills, offer monitoring, PRE_APPROVED and REVIEW_REQUIRED execution, phone notifications and supported vendor outcomes. NOTIFY_ONLY has no purchasing authority. Add pre-purchase holds/authorization-capture later.

The implementation must not regress to requiring the user to visit checkout manually for every purchase. A provider-required interaction is an explicit capability/action-required state. Do not hide unsupported integration behind a mock success screen.

The workspace contains an Angular 18 member area, invite-only PostgreSQL-backed authentication, owner-scoped instruction management, fixture-only activation and lifecycle controls, a durable PostgreSQL worker, synthetic quote/review and notify-only watch flows, a fixture PayPal demo panel, and a TypeScript domain package. Real provider execution, public recovery delivery, and production acceptance remain incomplete. Original v1.0 examples are archived.

Current evidence is deliberately split: the website, fixture API, adapter contract tests and domain tests are local code evidence; the migration passed against a temporary PostgreSQL 16 cluster with idempotence and authority-constraint checks; no real sandbox credentials, buyer approval or live provider evidence exists.

## 2. Engineering defaults and boundaries

Use a TypeScript modular application, authenticated HTTP API, separate durable worker and PostgreSQL. Select/pin a maintained web framework, authentication library, migration tool and testing runtime in M0 based on supported deployment. These are implementation choices; there is no existing Go service code or approved microservice topology to preserve. Start without Kafka or Redis dependency.

Suggested logical layout, to be converted into actual files by the coding agent:

- apps/web: responsive instruction, inbox, approval, settings and receipt views; authenticated API boundary.
- apps/worker: schedules, observations, execution and reconciliation, independent of the browser UI.
- packages/domain: category schemas, permission decisions, operation states and exact money.
- packages/persistence: migrations, repositories, job/outbox claiming and budget transactions.
- packages/adapters: search/catalog, vendor quote/order, funding/payment and notification contracts.
- apps/browser-host: isolated WebMCP session/tool runtime where proven necessary.
- tests: deterministic fixtures, transaction/concurrency tests, adapter contracts and journey tests.

Model output may propose an instruction or rank candidates. It cannot grant spending authority, choose arbitrary payment recipients or invoke execution adapters directly. Provider/browser secrets never enter the model or public API. Keep the UI design tokens in the current design document; do not make protocol/token debugging the user journey.

## 3. Milestones and exit contracts

### M0 — Prove the runtime and intended integration

Local decisions and open external gates are tracked in [M0 capability decision record](M0-CAPABILITY-DECISION-RECORD.md).

Work:
- Register a decision record with actual first vendor/category, market/currency, supported PayPal path, caller/payee roles, consent and status lookup operations.
- Choose the WebMCP agent/browser host; test intended background session behavior and reauthentication. Backend MCP/API support is a separate recorded capability, not assumed WebMCP equivalence.
- Pin Better Auth with PostgreSQL for local email/password members. Generate/review its auth migration, configure invite-only enrollment, server sessions, sign-in/out, rate limits and account mapping. Record email verification/reset delivery as a public-rollout prerequisite. Do not use a fixture account as authentication.
- Select discovery source/allowed origins/rates and initial mobile push transport. Record unavailable capabilities explicitly.
- Choose framework/auth/migration/test tools, supported Node/PostgreSQL versions and local launch commands; do not invent package versions in documentation.
- Define fixture/sandbox/live isolation and default execution-off switches. Write adapter contract fixtures and an integration capability matrix.

Exit: AC-02, AC-12 and AC-17 evidence for selected capabilities; official operation references and redacted sandbox evidence where access exists. If external access is unavailable, mark M0 external gate OPEN and allow M1/domain/fixture work to proceed. No real payment activation or claim of completed integration.

Stop/redirection condition: no supported purchasing arrangement for the intended PayPal/vendor path. Report the specific missing capability; the owner has accepted that this can end or redirect the project. Do not silently switch providers.

### M1 — Durable instruction and job foundation

Progress: M1 local fixture workflow is complete and hardened; `npm run test:m1:workflow` exercises owner-scoped fixture activation, lifecycle transitions, synthetic immutable quotes, review decisions, UTC monthly recurrence, notify-only observations, expired-lease recovery, prompt/budget bounds, private supplier CRUD (`PATCH`/`DELETE` with version conflict and preference cascade), and fulfillment counter advancement without vendor/payment calls. `npm run test:ac03` verifies the full schedule and timezone matrix, including active/paused schedule amendments, job fencing (`INSTRUCTION_SCHEDULE_UPDATED`), approval invalidation, DST transitions, and missed-tick recovery. See [work status](WORK-STATUS.md) and [M1 evidence](M1-EVIDENCE.md) for full records.

Work:
- Scaffold application/worker/database and document reproducible local startup.
- Implement Better Auth database-backed member sessions, idempotent mapping to application users and authenticated ownership, exact-money/category schemas, instruction drafts/activation, versioned permissions and supported connection references.
- Implement migrations per schema spec, durable occurrences/obligations/jobs, stop rules, pause/revoke and outbox/inbox.
- Provide fixture adapters in explicitly labeled local mode; prove work continues with UI closed and recovers from worker restart.

Exit: AC-01, AC-03 and AC-14 pass for domain access; valid migrations, state transition tests, recurring occurrence identity and durable job replay. Financial execution remains off. Evidence: local launch instructions, migration results and focused test report.

#### M1-A — Member identity checkpoint (reviewed 30 October 2026)

This checkpoint delivered and was reviewed after the user signed in and inspected the authenticated workspace. It remains distinct from the full M1 exit. The first post-review member slice is owner-scoped instruction draft creation and listing; it does not activate instructions or enable a worker/payment path.

1. Provision a reproducible development PostgreSQL database; pin a compatible Better Auth version, generate/review its auth migrations, and configure required secrets and production cookie settings without exposing credentials.
2. Create invite-only member enrollment and the one-to-one Better Auth user → application `users` mapping. Repeated enrollment must not create a second app member.
3. Deliver sign-in, an authenticated session endpoint and one owner-scoped profile/data endpoint, protected workspace navigation, sign-out, idle/absolute expiry and account-disable revocation. Deny unauthenticated and cross-user access server-side.
4. Prove fail-closed startup/configuration, login rate limiting, CSRF protection and absence of passwords/session tokens from app tables, browser storage and model context. Record how email recovery and sensitive-action step-up will be completed before public enrollment/live pilot.
5. Record AC-18 results against PostgreSQL, with exact commands, environment, observed behavior and any remaining failures. A build or fixture demo alone does not close this checkpoint.

The identity checkpoint is complete. Continue the remaining M1 work from persisted drafts toward validation/activation, durable jobs and restart recovery. Do not treat M1-A or draft persistence as authorization to enable external execution.

#### M1-B — Member instruction drafts

**Decision record, 30 October 2026:** after reviewing the signed-in workspace, the owner chose persisted instruction drafts as the first member action. Reuse the existing `procurement_instructions` model and authenticated API; do not use browser-only state or a second draft table. The server derives owner identity from the session, validates enum values and description length, writes an audit event, and uses `api_idempotency` so retries cannot create duplicates. Drafts may preserve a permission preference without a funding mandate, but remain `DRAFT` and cannot schedule or purchase. This implements create/list only; activation and workflow execution remain later M1 work.

#### M1-C — Activation readiness

The read-only readiness check reports account, budget, validity/timezone and typed criteria gaps. It separately reports fixture readiness and real-execution blockers. Fixture activation can only set `execution_environment=FIXTURE`; it never enables provider execution or financial authority. M0 vendor/provider capability remains open.

#### M1-D — Account settings and internal allocations

The member configures IANA timezone, ISO currency, and explicit minor-unit scale, then creates owner-scoped internal allocations in that currency. Parse decimal input exactly into integer minor units. Currency/scale changes are blocked after allocations exist to protect their meaning. An allocation is a policy limit, not held funds or provider authority. M1-E linked allocations to drafts. M1-H subsequently added inherited maximum and optional date limits; acceptance of those new inheritance paths remains open.

#### M1-E — Link allocations to instruction drafts

Reuse `procurement_instructions.budget_id`; do not add another allocation model. A member may choose an active allocation while creating a draft or attach/change/clear it on an existing draft. The API derives owner identity from the session, verifies active status and ownership, copies the allocation currency to the draft, and uses version-checked updates for edits. M1-H now inherits the budget maximum and optional dates, with lower/narrower instruction limits allowed. This remains draft configuration only: it does not activate the instruction, reserve funds, schedule work, or authorize a purchase. Readiness must continue to identify unresolved requirements.

#### M1-F — Configure draft limits, validity and typed request criteria

Allow members to set a positive maximum total in the account currency, an optional validity window entered in the selected IANA timezone, and category-specific request criteria. Convert local date-times to instants server-side; reject nonexistent local times and choose the earlier instant for an ambiguous clock time. Validate dates, positive quantities and guest/room counts, and category enums on the API. Store only non-secret user criteria: product quantity/variant/delivery date; bill provider label/due date and time/non-secret invoice label; accommodation destination/local dates/guest and room counts/cancellation preference. Never collect vendor passwords, payment credentials or raw bill account numbers in these draft fields. Update drafts with owner scoping, version checks, audit events and permission-version increments. Readiness distinguishes saved user criteria from vendor-verified stock, unpaid status, availability, rates, totals and terms; this work does not make a draft executable.

#### M1-G — Durable worker lease and occurrence foundation

Run a separate PostgreSQL worker in local development. Scan due fixture instructions into deduplicated jobs; claim with `SKIP LOCKED`, bounded batches, expiring leases and monotonically increasing lease generations. Retry failures with bounded backoff. Persist unique occurrence/obligation/operation identities, immutable synthetic quotes and audit/outbox records transactionally. REVIEW_REQUIRED creates a quote-bound fixture decision; PRE_APPROVED records a fixture simulation only. Monthly bill schedules and notify-only watch observations are deterministic fixtures. The M1 workflow acceptance script verifies restart/replay and ownership. No vendor/payment request is permitted.

For a recurring bill that is overdue after downtime, queue its current occurrence once and advance `next_run_at` directly to the first future local monthly schedule. Do not enqueue each elapsed monthly tick. The real adapter must still resolve the current unpaid obligation before any external action; the fixture schedule is not evidence of that capability. AC-03 timezone transitions, schedule edits, job fencing, and missed-tick recovery have passed acceptance coverage.

#### M1-H — Prompt-first instruction and budget inheritance (owner-confirmed 30 October 2026)

Preserve the member's exact plain-language need as the instruction source. Remove the requirement to fill Appai-authored category forms before saving a draft. Link the instruction to an owned budget that supplies currency, hard maximum, optional date limits and preferred suppliers. An instruction may narrow a date window or lower the maximum, never exceed the budget; there is no minimum purchase amount. Keep extracted constraints separate, visible and correctable; ask only for consequential missing details. Add budget dates and supplier preferences with owner-enforced constraints. Do not claim live assistant parsing unless a supported model/service is selected and configured.

M1-H local exit, **passed**: the PostgreSQL workflow verifies exact prompt create/edit/reload, budget inheritance/bounds, stale-version and retry behavior, cross-member instruction/budget access, private supplier isolation and CRUD/preference cascade, and owner-bound ranked budget preferences. Rendered compact-width review and unresolved detail display are verified. Supplier discovery and real purchasing remain outside this slice.

**Owner direction, 30 October 2026:** private suppliers are editable/removable from Account, including their service categories and areas. Keep budget-level supplier ranking controls out of the current UI until an active discovery/price-comparison flow makes them useful. Preserve private ownership and audit/version rules for supplier changes.

#### M1-I — AI-assisted instruction refinement (Gemini adapter implemented locally; provider gate open)

The Instructions composer offers an explicit **Ask assistant** action backed for now by the Gemini `generateContent` API. It returns a JSON-schema proposal with a faithful summary, only stated maximum/date constraints, and clarifying questions. The original prompt stays unchanged. Members can edit the suggestions before saving them to a DRAFT; a selected budget remains an enforced upper bound and date window. The proposal endpoint is owner-authenticated, origin-checked, limited to eight calls per member per minute and a 20-second provider timeout. It has no tools, does not retain a conversation in the application, and cannot schedule, activate, contact suppliers or purchase. Manual guided intake remains available when the provider is unconfigured or unavailable.

The API reads `GOOGLE_KEY` and optional comma-separated `GOOGLE_MODELS` (default `gemini-3.8-flash`) from its server environment. It accepts `GEMINI_API_KEY` and `GEMINI_MODEL` as alternate names. A configured second model is tried only when the first returns a model-unavailable, rate-limit, or server error. The key must never be exposed to the browser. A member prompt is sent to Gemini only after they select **Ask assistant**. Review Google's current Gemini API data controls and the account's retention settings before using real personal information; the application makes no zero-retention claim. Synthetic authenticated provider extraction and confirmed draft persistence have passed locally; rendered owner review and varied extraction acceptance remain open.

M1-I exit remains open until a configured-provider call and rendered owner review are evidenced, including prompt-only and unavailable-provider paths. Extracted values require member review and explicit draft save. They never grant purchasing or scheduling authority.

### M2 — Discover, quote and review without financial execution

An explicit, read-only Serper web-search probe is present in Instructions. It returns unverified links only and does not rank or save supplier candidates. After the local key was corrected, an authenticated synthetic search returned three source links. Rendered acceptance, market coverage and verified supplier discovery remain open; the M2 discovery exit is not met.

Work:
- Implement the signed-in category/area supplier catalogue and configured read-only discovery. Rank the member's private successful supplier history and budget preferences before new sources; show at most three strong candidates with source/freshness evidence.
- Keep catalogue provider data separate from private member supplier relationships. Never expose another member's supplier history or purchases; no member-to-member list sharing or public supplier website.
- Collect supplier-required fields only through a validated supplier flow after selection; reuse prompt/profile values and ask for missing information. Do not synthesize category forms or automate arbitrary scraped checkout forms.
- Implement typed PRODUCT, BILL and ACCOMMODATION validation contracts. Build the real adapter only for M0's validated first category/vendor; other categories remain fixture-only/unsupported until enabled.
- Add schedule/watch UI, no-match continuation, material-offer deduplication, quote expiry and one-time authenticated approvals.
- Persist mobile notification/inbox requests; use transport adapter for local delivery and then M0-selected sandbox transport.

Exit: AC-04, AC-05, AC-06 and AC-11 pass; one Arusha-style stay watch works against controlled fixture terms without being represented as real travel booking. No approval link mutates state on open; no stale approval silently purchases changed terms.

### M3 — Policy, reservations and safe sandbox purchasing

Entry: M1/M2 contracts pass. External sandbox execution additionally needs the M0 payment/runtime gate.

Initial payment direction: PayPal only. The budget pocket is a non-custodial ledger/policy control, not stored value or a prepaid card. Appai does not hold member funds. Other rails require a separate decision.

Work:
- Implement atomic allocation/daily limits, reservations, approval consumption and exclusive dispatch guard before payment enablement.
- Implement vendor/funding adapters, stable idempotency, durable attempt references, status lookup and unknown-outcome recovery.
- Integrate sandbox checkout for the chosen category/vendor. Demonstrate one PRE_APPROVED operation and one REVIEW_REQUIRED operation.
- For bill auto-pay enablement, prove obligation identity/paid-status checks and original collection coordination. If the first adapter is another category, bill auto-pay remains visibly disabled until a bill adapter passes the same gate.

Exit: AC-07, AC-08, AC-09, AC-10 and AC-12 pass. Evidence includes duplicate-trigger/parallel-spend tests and lost-success-response recovery, not only a happy-path transaction ID. Real adapter availability and unsupported category list are explicit.

### M4 — Mobile control, cancellation and operational recovery

Work:
- Complete responsive onboarding, instruction editing, inbox, approval, pending state and receipt history.
- Validate actual selected push transport on a phone with UI closed; explain permission-disabled/unavailable delivery and retain inbox fallback.
- Implement supported vendor cancellation/refund tracking and show unsupported/non-cancellable terms before automatic purchase authorization.
- Add operator view for stuck jobs/unknown liabilities, adapter circuit breaker and disable-new-execution controls.

Exit: AC-13, AC-14, AC-15 and AC-16 pass. Cancellation rejection is visible; no false refund/budget release; recovery continues with new execution disabled.

### M5 — Supported first-release acceptance and pilot readiness

Work:
- Complete AC-01–AC-18 for the enabled slice, with environment/capability evidence. Fixtures validate domain behavior; they do not substitute for external capability validation.
- Document provider/vendor account setup, deployment configuration, keys/callbacks, notification consent, backup/restore and incident recovery.
- Record data retention/deletion policy, credential access, dependencies and residual unsupported actions.
- Confirm first-release scope delivered: persistent future need; review-required watch-to-purchase; pre-approved scheduled purchase; real bill payment only with validated bill adapter. If a required capability is absent, mark the release scope incomplete rather than declaring universal procurement support.

Exit: named evidence for enabled capabilities, safety scenarios passed, clear remaining external constraints and operational runbook. Live deployment/payment activation is a distinct authorized action with verified credentials and limits, not an automatic consequence of finishing documentation.

### M6 — Later pre-purchase extension (not MVP work)

After first-release acceptance, implement supported vendor reservation, prior authorization/hold permission, capture sign-off, hold-liability budgets, expiry and compensation. Reuse instructions, jobs, vendor/payment adapters, notification and reconciliation infrastructure. Use [pre-purchase review](PRE-PURCHASE-ENGINE-STRUCTURAL-REVIEW.md) at that time. Do not build universal holds, escrow, bids or agent-to-agent settlement speculatively.

## 4. Remaining M1 acceptance brief

The member identity checkpoint and a fixture workflow subset have passed local PostgreSQL tests. The local fixture workflow uses explicit test allocation/currency, PRE_APPROVED and REVIEW_REQUIRED modes and deterministic synthetic quotes. Execution is demonstrably fixture-only. The list below describes the remaining proof; it is not a request to rebuild the implemented foundation.

M1 closeout work:
1. Exercise prompt-only draft save/reload, budget inheritance/bounds, supplier preference ownership/ranking and member categories with PostgreSQL and rendered member journeys; record negative and retry cases (AC-01, AC-14).
2. Complete local-time schedule, daylight-saving, schedule-edit and multi-month missed-tick recovery cases without duplicate obligations (AC-03).
3. Review responsive sign-in, Planner, instructions, Account, supplier preferences, fixture review and History in a browser; record observed failures and fixes.
4. Keep the fixture-only authority boundary explicit in the evidence and status. Continue the M0 vendor/PayPal/WebMCP decision record independently; do not interpret M1 acceptance as external capability.

Current evidence and remaining M0/browser/production gates are recorded in [M1 evidence](M1-EVIDENCE.md).

Do not begin by polishing a landing page or copying archived payment-token endpoint examples. Payment side effects only enter after the permission/reservation/dispatch contract exists.

## 5. Tracking and change control

Each milestone report lists requirement/AC IDs, implemented scope, test evidence, real versus fixture adapters and remaining blockers. Separate code complete, contract tested, sandbox proven and live enabled. No unsupported fixed four-week estimate is retained; estimate after M0's access and stack choices.

For any scope change, update PRD behavior, technical/state contracts, schema, flow and acceptance rows together. Financial invariants cannot be waived by coverage percentages or human approval. A provider limitation is recorded as a capability block with a precise remedy or explicit product decision.
