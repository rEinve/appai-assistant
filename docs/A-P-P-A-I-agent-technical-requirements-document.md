# A-P-P-A-I technical requirements

Version: **1.1** · 29 October 2026  
Status: Development contract; provider/runtime validation pending.  
Authority: [PRD v1.1](A-P-P-A-I-agent-product-requirements-document.md). Related: [schema](A-P-P-A-I-agent-schema.md), [implementation plan](A-P-P-A-I-agent-product-implementation-plan.md).

## 1. Architecture decision for initial implementation

Use one modular application with authenticated API, background worker and PostgreSQL. TypeScript is the initial engineering default; pin maintained dependencies during M0. Separate domain modules for instructions, scheduling, discovery, quotes, permissions, budget, execution, notifications and adapters. These are logical boundaries, not a requirement for three independently deployed microservices. Split later only with a demonstrated isolation/scaling need.

PostgreSQL owns durable state, budget reservations, job leases and transactional outbox. Redis may cache read-only results later; losing it cannot change purchasing authority. Kafka, distributed redlocks and floating-point spend counters are not prerequisites. A separate isolated browser-host process can serve WebMCP adapters and contain browser sessions. Mobile UI is a client, never the worker or accounting authority.

### Member authentication and identity

The member workspace uses local email/password accounts through Better Auth with PostgreSQL as the auth database. Select and pin a compatible stable release during M0. Start with invitation-only enrollment so the first private member slice does not depend on public registration or an email delivery service. Before public registration or a live pilot, configure verified email delivery, password reset/recovery, abuse controls and MFA or a documented step-up method for changes to purchasing authority. Do not ship a shared demo account, client-side auth flag or local bypass as member authentication.

Better Auth owns password hashing, its user/account/session/verification tables and login endpoints. Generate and review its SQL migrations rather than hand-writing a password or session system. Map Better Auth's stable user ID to one existing application `users.id` through `identity_provider_subject` (the column name is historical and now stores the local auth user ID); enforce a unique mapping and idempotent member creation. The application remains the authority for procurement ownership and never accepts a browser-supplied user ID. PayPal buyer consent is separate from member login.

Use database-backed server sessions with HttpOnly, Secure and SameSite cookies in production; validate server-side on private requests and recheck current authority for purchase/limit changes. Disable client-side session caching if it delays revocation. Protect mutations against CSRF, enforce idle and absolute expiry, rotate/revoke sessions on sign-in, sign-out, account disablement and sensitive recovery, and rate-limit login/recovery. Keep session tokens out of localStorage. Missing auth secret/database configuration fails closed. Email verification/recovery requires a real delivery mechanism before public rollout. OAuth issuer/audience/PKCE checks belong to future optional external sign-in or to separate payment-consent flows, not this local login.

The next developer checkpoint is the private member identity slice in the [implementation plan](A-P-P-A-I-agent-product-implementation-plan.md#m1-a--member-identity-checkpoint). Prove invite-only sign-in, an authenticated owner-scoped API response, session revocation/expiry and sign-out against PostgreSQL; report AC-18 evidence and stop for review before implementing persisted instructions, worker execution or payment flows. Public enrollment and live purchasing have separate gates.

## 2. Runtime and integration contract

WebMCP tools run in vendor browser pages. Backend MCP servers, JSON-LD feeds and read-only scrapers are separate adapters. A persistent worker chooses a declared adapter and invokes an owned browser host when required. Browser/session lifecycle, expiry, reauthentication and host availability must be proven in M0; a visible phone page is not required for durable scheduling. An expired session returns ACTION_REQUIRED and cannot be bypassed by replaying checkout.

M0 must record actual browser/agent versions, origin, authentication arrangement, allowed tool names and runtime lifecycle. If unattended WebMCP is unsupported, record that capability as false and choose a supported backend path or return blocked; do not silently convert the owner's purchasing mode or call unsupported tools.

References checked 29 October 2026: [Chrome WebMCP](https://developer.chrome.com/docs/ai/webmcp), [WebMCP goals and non-goals](https://github.com/webmachinelearning/webmcp#goals--non-goals). These distinguish page tools from backend integrations; this document does not assert universal headless support.

PayPal is the only initial rail. Internal API names below are application-owned and do not assert corresponding generic PayPal endpoints. Implement only official operations selected in M0 with actual merchant/provider authorization. A linked funding reference, an allocated budget and authority to purchase are separate records. Credentials stay with the provider or isolated credential store. Direct card, cash and Bitcoin payment paths are not enabled.

### Adapter capability record

Each vendor adapter declares: ID/version, environment, allowed origins, categories, discovery methods, quote freshness, accepted/verified payment rail, automatic execution support, review-required execution support, idempotency mechanism, order/payment status lookup, notification/webhook verification, cancellation/refund support, credential requirements, supported region/currency and later reservation support (false by default). Missing quote/execute/status capability prevents real purchasing. A supplier can be discoverable while payment remains unsupported. Unsupported category operations fail explicitly.

The initial "wallet" is a non-custodial application ledger: budgets, reservations, authorization decisions and confirmed spend. Appai does not hold customer funds or issue a prepaid card. PayPal or the funding provider retains payment credentials and funds. An internal limit is not a bank-enforced spending cap; M0/M3 must prove what the selected PayPal operations can enforce and reconcile before execution is enabled.

### Adapter operations

| Operation | Contract |
| --- | --- |
| discover(instruction, cursor) | Read-only candidate observations with source IDs, timestamp and next cursor; never purchase authority |
| quote(candidate/obligation, constraints) | Immutable vendor-confirmed terms, exact total/currency, category details, expiry and opaque external quote reference |
| checkObligation(account, invoice/cycle) | For bills, authoritative unpaid/paid/unknown status and correct bill identity |
| execute(operation, quote, mandate, idempotencyKey) | Submit exactly one intended purchase using validated payee/terms; return external references and confirmed or unknown outcome |
| getStatus(external refs, operation identity) | Resolve payment and vendor order separately; supports recovery after response loss |
| cancel(operation, key) / getCancellationStatus | Explicit supported cancellation and refund progression; no implied universal reversal |

A single vendor checkout may encapsulate payment; do not charge via a separate payment adapter as well. If payment and vendor order are separate operations, M0 must define their sequencing, compensation and status reconciliation. A provider token hash alone is not an executable credential. Use an isolated short-lived handoff or credential-store reference where supported; never expose a usable token to the model or consumer UI.

## 3. Shared value contracts

All object IDs are unprefixed UUID strings; external IDs are opaque text in dedicated fields. Dates/times use RFC 3339 instants; schedules retain IANA timezone and local calendar rules. Monetary amounts are integer minor units serialized as decimal strings in JSON to avoid JavaScript precision loss, with ISO currency and configured scale. Domain arithmetic uses exact integers, not binary floats.

A normalized instruction preserves the exact member prompt and contains kind, category, mode, structured constraints, budget ID, maximum total, inherited/narrowed validity, schedule/watch configuration, completion limit and version. Prompt parsing proposes constraints; it cannot grant authority or fill consequential facts from guesses. Show the interpretation and ask only for missing data needed to search, quote or act. A linked budget supplies currency, hard cap, optional dates and preferred suppliers; instruction limits cannot exceed it.

Supplier discovery combines the member's private successful supplier history, suppliers preferred on the selected budget, and category/area results from configured catalogue/search adapters. Return a short ranked list of up to three candidates with identity, source, freshness, price/fit evidence, service-area match and separate discovery/payment capability. The signed-in catalogue must not reveal another member's supplier history or purchases. Search snippets and supplier claims are candidates, not authoritative quotes or proof of PayPal support.

### Category constraints and vendor quote

Common quote: owner, instruction and obligation IDs; merchant/payee identity; immutable version/content hash; currency; quantity; item/subtotal, shipping, tax, fees, discount and total; expiry; terms/cancellation snapshot; source freshness; external reference and adapter version. The line-item arithmetic must equal the total. Unknown or mismatched currency/total is not executable. Any vendor-permitted change still passes the application policy; the provider's possible overcapture allowance is not an application allowance.

| Category | Required typed details before execution |
| --- | --- |
| PRODUCT | SKU/variant, quantity, destination reference, stock, delivery eligibility/window and total |
| BILL | Vendor account reference, invoice ID or vendor-guaranteed cycle identity, due time, amount and authoritative unpaid status; resolve against existing renewal retries |
| ACCOMMODATION | Property/room/rate identifiers, check-in/out local dates, guest/room counts, availability, tax/fee total, guest reference and cancellation terms |

Versioned JSON schemas validate each category. Raw search snippets and LLM rankings cannot substitute for these fields. Reject an impossible date range, missing tax treatment, unsupported term or changed payee rather than inventing defaults. Approval is bound to the complete quote hash and permission/policy versions. The app can retain multiple candidates but only one unresolved execution per obligation.

## 4. Durable workflows and canonical states

Instruction state: DRAFT → ACTIVE; ACTIVE ↔ PAUSED; any nonterminal state → CANCELLED or EXPIRED; ACTIVE → COMPLETED when its completion rule is satisfied. A NEEDS_ACTION block is a reason on a paused instruction, not proof of failure of any in-flight purchase.

Job state: READY → RUNNING → SUCCEEDED; RUNNING → RETRY_WAIT → READY, BLOCKED or DEAD. Expired leases recover through compare-and-swap and generation checks. Reconciliation jobs are allowed when instruction is paused/cancelled or new execution is disabled.

Approval state: PENDING → APPROVED, REJECTED, EXPIRED or INVALIDATED. Decisions are one-use, authenticated and compare-and-swap. Expiry/version checks use server time. Concurrent opposite decisions produce one accepted decision and conflict for the other.

### Purchase operation state (independent of instruction)

| State | Meaning / permitted next transitions |
| --- | --- |
| DISCOVERING | Acquire/refresh a candidate or bill; → QUOTED, BLOCKED, FAILED or CANCELLED |
| QUOTED | Validated offer exists; → AWAITING_APPROVAL, READY, BLOCKED, EXPIRED or CANCELLED |
| AWAITING_APPROVAL | No merchant/payment hold promised; → READY after valid consent, QUOTED for replacement quote, EXPIRED or CANCELLED |
| READY | All relevant consent available; → RESERVED after fresh authority/quote/budget checks, QUOTED if refresh needed, BLOCKED or CANCELLED |
| RESERVED | Durable internal allocation reserved; → SUBMITTING only through exclusive dispatch guard, or CANCELLED/EXPIRED/BLOCKED with release before any external submission |
| SUBMITTING | External execution may happen; → RECONCILING; never retry blindly or release on timeout |
| RECONCILING | Resolve external payment plus order; → SUCCEEDED, FAILED only with definitive no-liability result, or remain pending with operator action |
| SUCCEEDED | Order accepted and payment state satisfies integration contract; → CANCEL_REQUESTED when supported |
| CANCEL_REQUESTED | Vendor cancellation pending; → CANCELLED if confirmed, or SUCCEEDED with recorded cancellation rejection |
| CANCELLED | No purchase submitted, or confirmed vendor cancellation; any refund liability remains in financial entries until confirmed |
| BLOCKED | Unsupported/reauth/policy issue; → DISCOVERING, QUOTED or READY after resolution and revalidation, or CANCELLED/EXPIRED |
| EXPIRED / FAILED | Terminal no-new-execution result; unresolved external exposure cannot use these states to release liability |

A watch with no match schedules its next observation without a charge or success receipt. Rejection/quote expiry terminates that candidate operation; its instruction may continue under stop rules. One-time and watch fulfillment stops after one successful purchase by default. Bill occurrences are separate obligations. A persisted outcome and its notification event commit together, without requiring receipt navigation.

### Jobs and recurring time

Persist next run, job type, deduplication key, attempt count, retry time, lease owner/expiry/generation and last error. Claim jobs transactionally (for example row locks with skip-locked behavior), complete by lease generation, and treat delivery as at least once. Unique domain keys and operation dispatch guards supply idempotency. Bound exponential retries with jitter for read-only/transient tasks; repeated authentication failures block rather than hammering a vendor.

Use per-source configured polling intervals with backoff/rate limits. Missed recurring dates after downtime are resolved to real unpaid obligations; do not create one charge for each missed tick. For nonexistent local times use the next valid instant; for duplicated local times use the first occurrence, with one occurrence identity. Schedule edits version future jobs and do not create duplicate obligations.

## 5. Authority and dispatch transaction

1. Load the current active instruction, actor ownership, current funding mandate, obligation and unexpired authoritative quote.
2. Validate category/payee/terms, instruction validity, mode, approval and policy versions. For bills check paid status before submission through the supported integration.
3. In one database transaction, lock applicable budget/period records in deterministic order and the obligation; verify no unresolved competing operation; create idempotent reservation; transition READY → RESERVED; append outbox/audit event.
4. Immediately before submission, under a short instruction/operation dispatch lock, recheck revocation/version and execution switch, atomically consume approval where required and transition RESERVED → SUBMITTING with stable execution identity. Commit before the network call. This transition is the linearization point: a subsequent revoke/cancel cannot promise to retract an external submission.
5. Submit with the server-owned operation idempotency key. Record external references and schedule reconciliation. A crash after step 4, before or after the call, requires status reconciliation using that same identity, not a new order/key.
6. Apply authoritative outcomes, ledger changes, receipt and outbox event transactionally. If the integration cannot resolve whether a submission occurred, keep the operation pending for recovery; do not guess.

Never hold a database transaction open around a vendor network call. Stale job leases cannot re-grant dispatch. Execution credentials are restricted to this path. Revocation wins if committed before dispatch; otherwise notify the user that cancellation depends on vendor outcome.

## 6. Budget transaction contract

Budgets are internal allocations, not proof of available external funds. Reject funding failures without trying to change funding permissions. Lock shared budget accounts and relevant daily windows while checking and reserving. Amounts counted against a budget are confirmed spend less confirmed refunds plus active unresolved reservations. Apply instruction total, category/unit cap and daily policy checks independently.

Daily windows are explicit local-calendar intervals in the user's saved timezone. Keep unresolved reservations from earlier windows counted against the current daily available capacity until resolved; do not count them twice in the same window. On settlement, apply the defined budget attribution to the reservation's original window and release carry-forward exposure. A timezone change affects future windows only; it cannot erase accrued spend or liability. Schema and tests must cover window overlap and midnight.

Reservation lifecycle: ACTIVE → COMMITTED after confirmed success, or RELEASED after definitive no-liability outcome. Reservation TTL only schedules investigation; it does not authorize release for SUBMITTING/RECONCILING. COMMITTED spend is reduced only by unique confirmed REFUND entries. Cancellation alone is not a refund. Every monetary posting has a unique operation/external-event key. Cache counters may never decide spend availability.

## 7. Application API contract

Implementation generates OpenAPI/JSON schemas from the domain schemas during M1. These are internal application contracts, not copied provider routes. Public actor identity is derived from the authenticated session; never trust request `user_id`. Return only owned objects. All mutations require CSRF/origin protection appropriate to the authentication scheme, an Idempotency-Key for create/decision/cancel actions and version preconditions for updates.

| Route | Contract / response |
| --- | --- |
| GET /api/v1/session | Return the current authenticated member and minimal profile, or 401; never infer identity from client state |
| POST /api/v1/auth/logout | Revoke the current application session and clear its cookie; idempotent |
| POST /api/v1/instruction-drafts | Parse prompt into draft plus unresolved fields; 201, never activate implicitly |
| POST /api/v1/instructions | Preserve exact member prompt and optional owned budget on an incomplete DRAFT; optionally save member-reviewed maximum/date constraints after validating currency, timezone and budget bounds; category resolution and supplier-specific fields may be deferred; 201 |
| POST /api/v1/assistant/refine | Authenticated, origin-checked and rate-limited structured proposal from an explicitly submitted prompt; no persistence or tools; 200/4xx/5xx |
| PATCH /api/v1/instructions/{id} | If-Match version, update permissible fields/mode/constraints; invalidate stale work; 200 or 409 |
| PATCH /api/v1/instructions/{id}/configuration | If-Match version; edit a DRAFT's exact prompt, member area, budget and configuration; increment versions, retain DRAFT and append audit; 200/409 |
| POST /api/v1/instructions/{id}/activate | Validate completeness, scope, configuration; return ACTIVE or explicit block; 200/422 |
| POST /api/v1/instructions/{id}/pause, /resume, /revoke | Versioned lifecycle action; return status plus possibly in-flight operation refs; 200/409 |
| GET /api/v1/instructions, /instructions/{id} | Owned status, next run, block reason and current operation |
| GET /api/v1/operations/{id} | Persisted quote/approval/execution/cancellation state and sanitized receipt |
| POST /api/v1/approvals/{id}/decision | APPROVE or REJECT with quote hash, approval version; authenticated one-time decision; 200/409/410 |
| POST /api/v1/operations/{id}/cancel | Before dispatch cancel internally; otherwise start supported vendor cancellation; 200/202 or 422 unsupported |
| GET/PATCH /api/v1/budgets/{id} | Owned allocation/current liability and authenticated versioned limits; no modification by LLM |
| GET/POST /api/v1/budgets | List/create explicit owned allocations with currency and limit; no implied custody or automatic funding |
| GET /api/v1/suppliers | List active catalogue entries and only the caller's private suppliers; include source/discovery/payment evidence states; never return another member's relationship or purchase data |
| POST /api/v1/discovery/search | Authenticated, member-initiated, read-only Serper web search for 3–160 character query; return at most three source-linked results and fetch time. Results are unverified leads, never quotes, catalogue ownership, payment capability or execution authority. Rate limited; provider failure is explicit and no query/results are persisted. |
| POST /api/v1/member-suppliers | Add a private member-entered supplier with categories and service areas; owner-scoped and idempotent |
| PATCH /api/v1/member-suppliers/{id} | If-Match version; edit the owner's private supplier name, service categories, areas and notes; append audit event; 200/404/412 |
| DELETE /api/v1/member-suppliers/{id} | If-Match version; remove only the owner's private supplier and its non-authorizing budget preference links; retain audit event; 204/404/412 |
| PUT /api/v1/budgets/{id}/suppliers | Replace the owner's ranked supplier preferences with owner-bound IDs; preferences affect discovery order, not purchase permission |
| GET/PATCH /api/v1/settings | Timezone, enabled currency, hard/soft policies and notification preferences; versioned edits cannot erase liabilities |
| GET/POST /api/v1/fulfillment-profiles | List/create owned encrypted address, guest or service-beneficiary references; validate category-specific required fields |
| GET/PATCH /api/v1/fulfillment-profiles/{id} | Read/update owned profile with version preconditions; material changes require fresh quote validation |
| POST /api/v1/connections/{adapter}/begin | Start provider-hosted consent/session setup; return supported next action, never raw credentials |
| GET/POST /api/v1/connections/{adapter}/callback | Integration-specific consent completion with one-use state/nonce and required PKCE/signature validation; binds authenticated setup to the correct owner/account |
| GET /api/v1/connections/{id} | Sanitized mandate/session status and permitted capabilities |
| POST /api/v1/connections/{id}/revoke | Revoke local authority immediately; invoke supported external revocation and reconcile |
| GET /api/v1/inbox, /receipts | Owned durable inbox and receipt history |
| POST/DELETE /api/v1/push-subscriptions/{id} | Register/revoke user-owned device delivery reference; permission-denied state is explicit |
| POST /api/v1/provider-events/{adapter} | Signature-authenticated callback, not a user session; unique provider event key; 202 after durable receipt |

Worker-only commands (discover, quote, reserve, dispatch, reconcile) are not public payment/token endpoints. Notifications link to owned approval/receipt pages; opening a link is a GET with no financial side effect. No secrets in URLs. State/API errors include code, safe explanation, retryability and action-required; distinguish NO_MATCH, UNSUPPORTED, REAUTH_REQUIRED, POLICY_BLOCKED, QUOTE_CHANGED, APPROVAL_EXPIRED, BUDGET_UNAVAILABLE, EXECUTION_PAUSED and OUTCOME_UNKNOWN.

Limit reductions below existing counted liability are rejected; pausing/revoking stops future dispatch without erasing earlier exposure. Currency changes apply to new compatible allocations/instructions only. Fulfillment-profile edits create a new version; quotes and decisions retain their versioned snapshot, and a material beneficiary/address change requires quote revalidation.

## 8. Notifications and external data

Persist an outbox row in the same transaction as each relevant domain state. Dispatcher uses stable delivery identity, independent retry/backoff, sent/ack/failure timestamps and a durable inbox fallback. Delivery is not consent. Duplicate notification clicks resolve to the same approval. Push transport selection and behavior when OS delivery is unavailable are M0/M4 tasks; no guarantee of instantaneous delivery. WhatsApp can be added as a transport after its integration is selected; it is not a required hidden dependency.

Search/scraping adapters are read-only. Allowlisted sources/origins, safe redirects, SSRF defenses, size/time limits and per-source rates apply. Do not pass session cookies between vendors. Merchant tool descriptions and page content are untrusted: they cannot change budgets, choose arbitrary payees or call privileged execution paths. Strip/redact raw payloads in logs; store only needed verified fields and minimal diagnostic references.

## 9. Operations, rollout and failure handling

Default EXECUTION_ENABLED=false. Separate local fixture, provider sandbox and live environments, credentials and callback URLs. Validate adapter capability before enabling it. A circuit breaker stops new external submission for the affected adapter while jobs for lookup, reconciliation and cancellation remain available. Human approval cannot bypass that breaker.

Monitor due-job lag, stuck SUBMITTING/RECONCILING, unknown-liability age, vendor/session health, approval expiry, notification delivery failures and reservation mismatches. Define an operator recovery view; manual decisions require recorded evidence and audit, not direct balance edits. Database backup/restore rehearsal must preserve operation identity, reservations and outbox deduplication. Rollbacks must retain ability to reconcile already submitted operations; additive migrations precede code depending on them.

No universal external latency, automatic cancellation, capture success or audit-retention guarantee is assumed. M5 requires a data inventory/retention decision, access controls, recovery procedure and actual integration evidence. [Acceptance matrix](DEVELOPMENT-ACCEPTANCE.md) defines the required failure-path tests.

## 10. Later extension boundary

The payment/vendor adapters may later declare reserve, authorize, capture, void and release capabilities. Keep financial attempt and vendor order records independent now. Do not add active merchant reservation or delayed-capture states to the MVP API. The later engine will introduce its own reservation deadlines, permission rules and outstanding-hold budgets; it must not turn existing review-required purchases into automatic captures.
