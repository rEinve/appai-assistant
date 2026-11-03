# Development acceptance and QA contract

Baseline: **v1.1 · 29 October 2026**. These are required scenarios, not passed tests. No application or provider execution was tested during the documentation amendment.

Use [PRD](A-P-P-A-I-agent-product-requirements-document.md), [technical requirements](A-P-P-A-I-agent-technical-requirements-document.md) and [plan](A-P-P-A-I-agent-product-implementation-plan.md). Each implementation report must record actual environment, fixture/real adapter, test data, observed result and evidence reference.

| ID | Requirement IDs | Scenario and required outcome | Milestone |
| --- | --- | --- | --- |
| AC-01 | FR-02, FR-08, FR-17 | Parse an incomplete need into DRAFT; missing price/date/payee/authority is not invented. Activation requires complete constraints. Exercise PRE_APPROVED, REVIEW_REQUIRED and NOTIFY_ONLY; each retains its exact authority and stop rule | M1 |
| AC-02 | FR-05, FR-12, FR-15 | Record selected real vendor/payment capability and correct buyer/caller/payee roles. Prove provider consent and sandbox execution/status lookup where available. Unsupported or missing consent remains blocked; fixtures are labeled and live execution is off | M0/M3 |
| AC-03 | FR-08, FR-09, FR-16 | Activate a future purchase, offer watch and recurring bill fixture; close UI and restart worker. Due work resumes once per occurrence/obligation. Test DST/midnight, schedule edits and missed ticks without catch-up duplicate charges | M1 |
| AC-04 | FR-01, FR-02, FR-03, FR-11 | Validate category constraints: product variant/quantity/delivery; bill account/invoice/cycle/unpaid status; stay dates/guests/room/rate/cancellation. Incorrect or ambiguous candidates never become executable quotes; no-match watches continue to expiry | M2 |
| AC-05 | FR-01, FR-03, FR-11 | Discover via allowed adapter, then verify vendor final total/currency/terms/expiry. Shipping/tax/fees/discount arithmetic is exact. Search snippets, stale stock and scraped prices alone cannot authorize checkout | M2 |
| AC-06 | FR-04, FR-07, FR-13, FR-17 | Review-required match emits one durable mobile action and waits; approval executes through the assistant. Pre-approved match executes without per-purchase review only within scope; soft threshold still requests review. Notify-only never executes | M2/M3 |
| AC-07 | FR-06 | Full payable total, unit/order cap, instruction allocation and daily cap all enforced. Generic approval cannot override hard caps. Currency mismatch, negative/overflowing money and unknown total block; changing policy causes fresh evaluation | M3 |
| AC-08 | FR-06, FR-10 | With 50 units remaining, concurrent 40-unit obligations allow at most one reservation/dispatch. Repeat across shared budgets, cache loss, expired worker lease and period rollover. Confirmed refund restores only its amount; unknown liability stays reserved | M3 |
| AC-09 | FR-04, FR-09, FR-10 | Duplicate watch events, client retries, schedule ticks and stale workers reuse the same domain/attempt identity. One-time need stops after fulfillment. Duplicate bill across two instructions is blocked by account/invoice identity | M3 |
| AC-10 | FR-04, FR-10, FR-14 | External purchase succeeds but response is lost; worker crashes before recording refs. Outcome becomes pending and is recovered using stable identity. No second purchase or early reservation release. Payment success without confirmed vendor outcome stays unresolved | M3 |
| AC-11 | FR-07, FR-11, FR-17 | Price, payee, dates, cancellation terms, policy or instruction version changes invalidate old consent. Replay/expired/cross-user approval rejected. Concurrent approve/reject accepts one decision. Opening notification/deep link is read-only | M2/M3 |
| AC-12 | FR-12, FR-15, FR-16 | Expire vendor/browser session and revoke mandate/instruction before dispatch: no new external call. Revoke after dispatch: stop future work but keep reconciliation. Close phone UI; selected WebMCP host behaves as proven or returns action-required, never silently succeeds | M0/M3 |
| AC-13 | FR-13 | Push transport delays/fails, permission disabled, device offline and duplicate delivery. Domain progress remains durable; inbox shows action/outcome. Retry notification without repeating a purchase. Test actual phone delivery separately from a stub | M4 |
| AC-14 | FR-05, FR-08, FR-13 | Cross-user instruction/quote/approval/budget/receipt access denied. Merchant prompt injection, arbitrary URL/redirect and forged client price cannot invoke payments. Usable tokens/session secrets absent from model, URL, UI and logs; callbacks verified before processing | M1/M4 |
| AC-15 | FR-14 | Cancel before dispatch produces no external purchase. Cancel after dispatch resolves vendor outcome; rejection is visible. Confirmed cancellation with pending refund does not erase spend; duplicate/partial refund evidence posts exactly once | M4 |
| AC-16 | FR-04, FR-06, FR-09, FR-14 | Disable execution/circuit-break adapter with jobs in flight. No new dispatch, while status/cancel/reconciliation continue. Restore backup/restart without losing reservations or replay protection; rollback retains ability to resolve earlier operations | M4/M5 |
| AC-17 | FR-15, FR-18 | Current interfaces cover future reservation capability but MVP cannot invoke unimplemented hold/deposit/bid/capture workflows. Every real category/adapter has a capability gate; unsupported categories show blocked, not simulated success | M0/M5 |
| AC-18 | FR-19 | Invite-only local email/password sign-in creates one Better Auth user mapped to one application member; database-backed session, sign-out, expiry and account disablement revoke access. Missing auth configuration/database, invalid or repeated enrollment, unauthenticated and cross-user requests fail closed. Verify rate limits and that no password/session token enters app tables, model or browser storage; email recovery and sensitive-action step-up gate public rollout | M1 |
| AC-19 | FR-02, FR-08, FR-20 | Start an incomplete need, research providers with links, reject a high price and request alternatives in the same conversation; reload preserves all turns and evidence. No duplicate prompt form, repeated category intake or fixed six-reply cutoff. Estimates never become authoritative prices; unavailable search is honest | Priority correction/M1–M2 |
| AC-20 | FR-08, FR-20 | Confirm provider, quantity, dates and cost in dialogue; Planner opens on today's Day view and offers Day, Monday-start Week, and Monthly calendar tabs with date navigation. Dated tasks appear on the matching read-only calendar date; tasks without a reliable action date remain in Undated. No New instruction, budget dialog or agreement-field editor in Planner or existing instruction detail. Edit instruction returns to the same conversation; confirmed change regenerates the plan, rejects stale writes and invalidates unused approvals. Owner isolation holds | Priority correction/M1–M2 |
| AC-21 | FR-04, FR-06, FR-07, FR-20 | Payment shows exact total and remaining budget, distinct from verified funds or unavailable balance. Navigation never pays. Pay binds current agreement and quote; future activation binds explicit finite scope. Missing budget is resolved through conversation; expired/changed quote, unknown total, unsupported provider or stale agreement cannot dispatch. Retry cannot double-pay; PRE_APPROVED avoids repeated approval within scope | Priority correction/M2–M3 |

## Required test layers

- Domain: typed instruction/category validation, permission decision table, canonical state transitions, exact money and quote hash/version binding.
- Database: actual PostgreSQL constraints, simultaneous reservations, job lease generations, operation/obligation uniqueness and transactional outbox. In-memory mocks alone are insufficient for concurrency claims.
- Adapter contracts: deterministic fixtures for all categories; real sandbox tests for enabled adapters, including status lookup and supported failure behavior. Record which capabilities the provider cannot simulate.
- User journeys: responsive onboarding, future instruction, review action, pre-approved outcome, reauthentication, cancellation and receipt recovery. Keyboard/screen reader names, focus and pending states work on mobile.
- Recovery: faults before/after each external call and local commit, duplicate/out-of-order callbacks, unknown outcomes and operator resolution. Demonstrate that a new random idempotency key is never used to escape uncertainty.

## Permission decision table

| Condition | Result |
| --- | --- |
| Inactive/expired/revoked instruction, invalid funding authority or unsupported adapter | Block; no new external submission |
| Missing or changed material constraints/quote | Clarify or refresh; new review where needed |
| Hard cap/allocation/daily rule fails | Block; user may discuss and explicitly confirm a versioned limit change in the instruction conversation; old approval cannot override |
| NOTIFY_ONLY | Observe/notify only |
| REVIEW_REQUIRED or soft threshold reached, no valid consent | Request review; no payment |
| PRE_APPROVED, exact constraints/current authority and all limits pass | Reserve and dispatch once |
| Valid quote-bound review decision and all current checks pass | Reserve and dispatch once |
| Submission may already have happened | Reconcile; do not retry as a new purchase |

## Evidence and completion rules

Use statuses NOT_STARTED, FIXTURE_PASSED, SANDBOX_PASSED, BLOCKED or FAILED per scenario/capability. No scenario is marked passed by this document. Record provider/version, supported category, test dataset and evidence location. Live-ready scope requires sandbox/vendor evidence for real execution plus passed safety/recovery tests; fixture-only bill or accommodation journeys do not establish real bill payment or booking.

Measure internal policy/reservation p95 ≤200 ms at 10 concurrent eligible operations per user, API acknowledgement p95 ≤1 second and due-job start within 60 seconds under recorded local/staging load. External latency and human wait are separate. A target miss is reported with impact; an authority/double-purchase/budget invariant failure blocks execution enablement regardless of performance or coverage.

Before pilot: resolve data/retention policy and credentials, rehearse restore/reconciliation, identify support/recovery ownership, test mobile transport and enumerate unsupported categories/terms. Enable only evidenced adapters; deployment/payment activation remains a separate action.
