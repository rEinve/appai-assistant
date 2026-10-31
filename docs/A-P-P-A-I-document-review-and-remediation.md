# A-P-P-A-I document review and proposed remediation

Review date: 29 October 2026  
Mode: Codex Operating Partner — Review / Brief  
Status: Proposed corrections; owner decisions remain open

Current scope: The owner clarified that the pre-purchase engine is a later extension. First release is the personal procurement assistant with persistent instructions, pre-approved purchasing and review-required purchasing. [Scope, build sequence and consequential MVP gaps](PROCUREMENT-SCOPE-AND-PHASES.md) supersedes the earlier phase assumptions below.

Amendment status: The development documents are now v1.1; start from [the current index](README.md). Findings and line-number evidence below describe the original v1.0 documents, preserved under [archive/v1.0](archive/v1.0/README.md). This review is historical rationale, not an additional list of unresolved development prerequisites.

Update, 29 October 2026: The subsequently supplied [pre-purchase engine source](PRE%20PURCHASE%20ENGINE.md) materially changes the central flow to continuous watch, automatic reservation/authorization and final user-approved capture. See the [current structural review](PRE-PURCHASE-ENGINE-STRUCTURAL-REVIEW.md) for that scope. The generic checkout framing below is historical supporting analysis.

## Review scope correction

The owner clarified that the purpose of this review is to expose structural blind spots that could invalidate the build or make purchasing fail. Marketing wording, approval metadata, visual polish and incidental syntax fixes are not the decision focus. The five findings immediately below are the actionable structural review. The earlier detailed audit is retained afterward for reference; its broader priority labels do not make those secondary items prerequisites for starting a prototype.

## Five structural blind spots to resolve first

### 1. The bridge from finding a product to actually ordering it is assumed

**Where:** TRD §3.2 steps 3–7 and §4.2; plan §3.1 and Phase 2.

The design can discover products from a catalog, then assumes it can post a payment token and product ID to a merchant checkout API. Catalog access alone does not establish a purchase integration. The documents do not identify a concrete merchant checkout contract, who operates it, or how that merchant accepts this application's delegated payment authority. Internal `/api/v1/...` examples do not supply that external capability.

**Failure:** The team completes chat, discovery, matching and payment abstractions, then discovers there is no supported way for this app to buy the selected products. The central product promise remains unimplemented even though every internal service works.

**Remedy:** Before broad implementation, identify one intended merchant and trace the actual supported path from catalog offer to checkout creation, customer authorization, payment, merchant order and order-status retrieval. Specify the merchant adapter and permitted application surface. Prove that path in a sandbox; if unavailable, deliberately choose a different integration or a narrower product. A generic mock cannot resolve this feasibility question.

**Decisive check:** Can this intended application create and retrieve one real sandbox merchant order through the chosen integration? If not, the autonomous-purchase architecture is still a hypothesis.

### 2. The purchase is missing an authoritative checkout session or quote

**Where:** TRD §4.1 catalog response and §4.2 checkout request; schema §3.4.

The flow jumps from a catalog candidate to governance/tokenization. It lacks a merchant-owned checkout session or equivalent authoritative quote binding SKU/variant, quantity, delivery address, shipping method, taxes, fees, currency, total and expiry. The checkout example submits its own unit price, while governance evaluates item price. A catalog listing is insufficient to establish the final purchasable offer.

**Failure:** The agent approves one amount or delivery promise, but checkout requires a different total, rejects an unavailable variant, or cannot fulfill to the address. The same product-selection mistake can affect every order.

**Remedy:** Add a required quote/session step before approval and payment. Merchant-confirmed payable details become the common reference for governance, consent and execution. Expired or changed terms must trigger revalidation rather than silently continuing.

**Decisive check:** Change shipping destination, tax or stock after discovery. The app must obtain valid purchase terms and must never execute using the previous approval when the change requires renewed consent.

### 3. Buyer identity, delivery setup and spending delegation have no complete lifecycle

**Where:** PRD UC-02; TRD §4.2 `shipping_address_ref`; chat flow begins at `/chat` with an already configured buyer.

The flow assumes the application already knows where to deliver and has authority to obtain a payment credential. Budget settings express limits; they do not establish provider-recognized permission to spend from the buyer's account. The documents do not connect onboarding, provider authorization, address ownership, approval and revocation into one executable flow.

**Failure:** A user reaches checkout but cannot authorize payment through the selected provider, or the worker continues acting after permission has been revoked. Adding a token-request function cannot by itself supply the missing customer authorization journey.

**Remedy:** Specify how a new buyer authenticates, selects/validates an address, grants the supported payment authority, sees its scope and revokes it. Bind execution to that buyer and current authority. If the provider requires confirmation for every purchase, make that an explicit product behavior; unattended buying requires a supported delegation mechanism.

**Decisive check:** Follow a brand-new user from signup to sandbox purchase without pre-seeded account/address/payment authority, then revoke permission and verify that pending work cannot start a new purchase.

### 4. The app has no safe answer to “did the purchase actually happen?”

**Where:** TRD §5.2 and §7.3; schema §3.7 transaction states.

The design treats a failed response as a failed transaction and proposes token revocation. A merchant may accept an order before its response is lost. Payment and merchant order creation also span different systems; a local rollback cannot make them one atomic operation.

**Failure:** The app reports failure although the buyer was charged, retries into a duplicate order, or leaves a charge with no trackable merchant order.

**Remedy:** Define one durable purchase operation, stable idempotency, an unknown/pending outcome, merchant/provider status lookup, and reconciliation. Define recovery for both “payment succeeded, order not confirmed” and “order accepted, local persistence failed.” Never release budget or start a replacement purchase merely because a response timed out.

**Decisive check:** Let the external purchase succeed, drop its response and restart the worker. The app must recover the outcome without purchasing again.

### 5. Spending safety has no single durable owner

**Where:** TRD §4.4; schema §4–5; detailed finding R06 identifies an additional persistence ambiguity in the chat flow.

The plan spreads spending state across PostgreSQL, Redis counters, short locks and service events without defining one durable reserve/commit/release operation. Checking the balance and incrementing a counter are not sufficient unless the entire decision is atomic and recoverable. Different sections also disagree on whether approval can override a hard cap.

**Failure:** Two individually valid orders together exceed the daily budget; cache loss or process restart restores apparent spending capacity; a pending purchase loses its reservation while its external outcome remains unknown.

**Remedy:** Define a durable budget ledger and atomic reservation before execution. All purchase paths, including approved exceptions and retries, must use it. Commit confirmed spend, release definitively unused reservations, and retain liability for unknown outcomes. Resolve absolute caps versus explicit overrides as one product rule. Persist financial results in backend processing, independent of receipt navigation.

**Decisive check:** With 50 remaining, submit two purchases of 40 concurrently, restart processing and lose the cache. At most one may gain purchasing authority, and the remaining budget must recover correctly.

**Recommended immediate work:** Write and test one complete merchant purchase journey covering these five contracts before expanding services, merchant coverage or UI. This tests whether the central product can work and whether failure recovery preserves its correctness. It does not require polishing the marketing or completing every item in the earlier audit.

---

## Earlier broad audit — supporting reference

## Assessment

The documentation establishes a useful product direction: structured product discovery, tokenized checkout, and deterministic spending controls for individual buyers. The exclusions around browser scraping, multi-merchant carts, and corporate approval chains keep the concept focused.

The package is **not yet a consistent engineering baseline for purchasing with real money**. The most consequential gaps concern integration feasibility, spending authority, concurrent budget reservations, ambiguous payment outcomes, and server-owned transaction persistence. The documents call themselves approved, but the reviewed folder does not supply supporting approval records or integration evidence.

This is a specification review, not an implementation audit. The workspace contains ten source documents and no application implementation. Findings describe conflicts and missing contracts, not observed production defects. No executable migrations, provider transactions, or performance tests were run. Existing source documents were not changed.

## Documents reviewed and authority

| Source | Useful contribution | Authority problem to resolve |
| --- | --- | --- |
| [PRD](archive/v1.0/A-P-P-A-I-agent-product-requirements-document.md) | Three pillars, FR-01–FR-07, scope exclusions | Product approval asserted without supporting sign-off; hard-cap behavior conflicts with approval behavior |
| [Technical requirements](archive/v1.0/A-P-P-A-I-agent-technical-requirements-document.md) | API examples, security boundaries, failure handling | Provider capabilities assumed; states and fields differ from schema |
| [Schema](archive/v1.0/A-P-P-A-I-agent-schema.md) | Detailed relational entities and cache/event examples | Invalid DDL syntax and incomplete transaction lifecycle |
| [Implementation plan](archive/v1.0/A-P-P-A-I-agent-product-implementation-plan.md) | Milestones and exit gates | Payment precedes governance; access and delivery estimates lack evidence |
| [Chat/user flow PDF](A-P-P-A-I-agent-user-flow-chat.pdf) | Main screens and actions, four pages | Persistence wording depends on navigation; error and onboarding paths missing |
| [Design system](A-P-P-A-I-agent-design.md) | Visual tokens and core components | Consumer UI overemphasizes implementation details; interaction acceptance incomplete |
| [Website meta-prompt](archive/v1.0/A-P-P-A-I-agent-website-meta-prompt.md) | Marketing and component direction | Prototype labeled production-ready; unverified claims and implied provider endorsement |
| [MVP notes](Autonomous%20Procurement%20MVP.md) | Concise original concept | Discovery input, not a verified integration contract |
| [Pain points](User%20Painpoints%20Summary.md) | Potential buyer concerns | No underlying source links, sample details, or evidence classification |
| [Trends](Trends%20Summary.md) | Market hypotheses and protocol landscape | Quantitative and current-product claims lack source records |

Proposed precedence after owner confirmation: PRD owns product behavior; an integration decision record owns provider capability; API/state contracts own service interaction; schema implements those contracts; UX and generation prompts consume them. Research summaries inform decisions but do not prove capabilities. Record actual approvers and decisions, or use “Draft — pending validation.”

## Findings and remedies

Priority meaning: P0 must be resolved before enabling purchases with real money; P1 must be specified before the affected implementation; P2 improves delivery clarity. Proposed responsibilities below identify roles, not confirmed people.

### R01 · P0 · Payment integration feasibility is unproven

**Evidence:** PRD §10.1 depends on PayPal Agent Ready developer endpoints. Plan lines 66–71 assumes sandbox and production access is active. TRD lines 195–251 defines internal token/checkout routes without identifying the corresponding provider operations; lines 325 and 351 assume immediate revocation and a fixed 15-minute lifetime.

**Why it matters:** Internal route examples are insufficient evidence that an independent buyer agent can mint a payment token and submit it to arbitrary merchants.

**External check:** PayPal's current [Agent Ready overview](https://developer.paypal.com/agent-ready/overview), checked 29 October 2026, describes distinct ACP/Braintree and UCP integration paths. Its [ACP guide](https://developer.paypal.com/agent-ready/agentic-commerce-protocol) describes a ChatGPT app, checkout sessions, delegated tokens and merchant-side Braintree processing. This does not establish the generic standalone buyer-side API assumed by the project. It also does not prove that a suitable arrangement is unavailable.

**Remedy:** Create a provider/merchant capability record identifying the application surface, buyer and merchant roles, merchant of record, eligible region/currency, consent flow, credentials, documented API operations, token restrictions, status lookup, idempotency, callbacks and reversal behavior. Confirm actual access with one cooperating merchant. Mark internal endpoints as proposed application APIs. Gate real-money work on a supported end-to-end integration; use clearly labeled simulation while access remains unresolved. Do not silently change the product into a ChatGPT app just because that integration is documented.

**Exit evidence:** A redacted sandbox execution and status lookup mapped to official operations; unsupported capabilities explicitly excluded. Owner: integration lead + product owner.

### R02 · P0 · Hard limits conflict with approval exceptions

**Evidence:** PRD MTR-02 and FR-06 require strict caps, while UC-03 permits approval after a cap breach. TRD lines 297–305 and schema lines 253–257 resume tokenization after approval. The website calls limits “unbreakable” while its approval component offers a hard-cap exception.

**Remedy:** Separate non-overridable hard limits from a lower approval threshold. Recommended behavior: any hard-limit violation blocks execution; a threshold violation within hard limits requests approval. A user may separately authenticate to change policy, after which a fresh evaluation runs. If one-order overrides are desired, define a separate explicit mandate and revise the compliance metric. Never treat a generic approval click as unlimited spending authority. Validate threshold/cap relationships and remove unconfirmed defaults from the baseline.

**Exit evidence:** One decision table covers request ceiling, item cap, order total, daily cap, approval threshold, rejection and expiry. Owner: product owner.

### R03 · P0 · Budget checks omit full payable cost and durable reservations

**Evidence:** TRD lines 258–299 evaluates `proposed_item_price`. Schema lines 133–135 includes shipping in a derived total but omits taxes and fees; lifecycle rules still compare item price. Schema lines 268–269 uses a floating counter and 30-second lock; TRD promises a 15-minute spend lock. No durable reservation entity or recovery contract is specified.

**Risk example:** With a daily cap of 200 and settled spend of 150, two simultaneous orders of 40 can each pass a read-based check. A 45 item plus 10 delivery can also exceed a 50 total request ceiling even though item-price checks pass. These are illustrative failure scenarios, not measured incidents.

**Remedy:** Obtain a merchant quote with quantity, variant, currency, tax, delivery, fees, discounts, final total and expiry. Define which limits apply to unit price versus the payable total. Use exact money representations. Atomically check and reserve against a durable budget ledger so settled spend plus active reservations plus the proposed total stays within the cap. Commit, release or retain reservations according to authoritative outcomes; cache loss or lock expiry must not authorize new spend. Specify timezone/day boundaries, refunds, pending charges and policy changes. Start with a single explicitly selected currency; reject currency mismatch until conversion is specified.

**Exit evidence:** Concurrent-order, restart, cache-loss, quote-change and midnight tests preserve the budget invariant. Owner: backend lead.

### R04 · P0 · Timeout handling can lose track of a completed charge

**Evidence:** TRD lines 325 and 397–402 treats token revocation after merchant failure as transaction atomicity and zero financial loss. Plan line 223 proposes retries without an idempotency contract. Schema transaction states only include success, decline, API error and timeout.

**Remedy:** Specify durable checkout attempts, stable idempotency keys, provider/merchant references, and an `OUTCOME_UNKNOWN` state. A lost response or HTTP 500 is not sufficient proof that no order or charge exists. Reconcile through supported status queries and verified callbacks before retrying or releasing reservations. Model authorization, capture, order acceptance and compensation separately where the selected integration exposes them. Revocation cannot substitute for checking whether a token was already consumed. Document manual recovery when automatic reconciliation is unavailable.

**Exit evidence:** A successful charge followed by a lost response, worker restart and duplicate callback converges to one order and one accounting result. Owner: payment lead.

### R05 · P0 · Execution and approval authorization are underspecified

**Evidence:** TRD lines 140, 202 and 262 accepts `user_id` in requests; lines 229–239 accepts purchase details and token identifiers. Roles are listed at lines 353–359, but endpoint ownership checks and approval proof are not defined. The schema hashes an approval token without specifying one-time consumption or binding to an immutable quote.

**Remedy:** Derive user identity from authenticated context; validate ownership for intents, matches, addresses, approvals and receipts. Keep payment commands internal. The server must load authoritative quote amounts and policy state, rather than trust client/model prices. Bind each approval to user, intent, merchant, exact quote/version, currency, amount, expiry and policy version; consume it once. Quote or policy changes require re-evaluation and renewed approval where relevant. Define session protection, notification retries, replay handling and revocation of delegated authority. Add prompt-injection and outbound-fetch protections: merchant content is untrusted data and cannot grant payment permissions or choose arbitrary internal URLs.

**Exit evidence:** Cross-user access, forged price, direct checkout, expired/replayed approval and malicious catalog tests all fail safely. Owner: security/backend lead.

### R06 · P0 · Receipt navigation appears to trigger financial persistence

**Evidence:** Chat-flow PDF §2.4, page 3, places log persistence and permanent spend updates under what happens when the user clicks “Return to Chat” or “View Audit Trail.” The high-level screen table repeats this association.

**Remedy:** Specify server-owned persistence and budget reconciliation on authoritative transaction outcome, independent of whether a browser remains open. Receipt screens read persisted state. Financial state and its event publication must recover together, using a transactional outbox or an equivalent durable mechanism. On ambiguous outcomes show pending status, not success.

**Exit evidence:** Close the client immediately after submission; background processing still persists the order, updates its reservation and permits a correct receipt after login. Owner: backend + UX lead.

### R07 · P1 · Schema is not migration-ready

**Evidence:** Schema lines 71–72, 112, 164, 212, 215 and 232 uses `NULLABLE` in SQL column declarations. API/event examples use prefixed IDs such as `usr_...` and `int_...`, while tables require UUIDs. A hash-only payment-token record does not define how an executing/recovering worker obtains the usable provider credential. The checkout address reference has no corresponding address/consent model.

**Remedy:** Correct SQL nullability syntax; choose canonical ID formats; define address references, quote snapshots, budget reservations, checkout attempts and provider references. Add constraints preventing multiple active selections/attempts where prohibited and mismatched user/intent/match associations. Specify a protected ephemeral token handoff or vault reference and recovery behavior; do not expose token material to model context or consumer logs. Hashes are useful for correlation but cannot reconstruct a token.

**Exit evidence:** All DDL executes against the selected PostgreSQL version; API fixtures validate and round-trip through the schema; ownership and uniqueness constraints have negative tests. Owner: data/backend lead. Syntax issues were identified by inspection; no migration was executed during this review.

### R08 · P1 · State, API and event contracts disagree

**Evidence:** TRD lines 113 and 301–305 uses `GOVERNANCE_HOLD`, `USER_CONFIRMED`, `APPROVED_FOR_TOKENIZATION`, `CANCELLED_BY_USER` and `EXPIRED_HOLD`; schema lines 88–103 defines a different enum. The PDF introduces `SUCCESS / EXECUTED`. Only five example routes and two event types are specified; approval, policy settings, order recovery and receipt retrieval lack complete contracts.

**Remedy:** Establish one transition table with state owner, allowed actor, preconditions, durable side effects, timeout and recovery behavior. Distinguish intent, payment attempt, approval and fulfillment states. Include clarification, no match, quote expired, cancellation, outcome unknown and reconciliation. Define request/response/error schemas, authentication, idempotency and concurrency semantics. For async events specify schema version, deduplication, ordering scope, retry policy and dead-letter recovery.

**Exit evidence:** PRD, API examples, schema and UI map to the same contract and cover every reachable terminal/pending state. Owner: technical lead.

### R09 · P1 · Onboarding, matching and post-purchase workflows are incomplete

**Evidence:** Chat-flow PDF starts with an already configured user. PRD personas mention price monitoring, but no monitoring trigger/lifecycle is specified. Parsing examples assume price and date can be extracted without ambiguity. Checkout uses a default shipping address without defining its setup. Pain points emphasize disputes and incorrect deliveries, but operational support is missing.

**Remedy:** Define account setup, address validation, payment consent, budget/currency/timezone settings and revocation. Add clarification for missing/ambiguous constraints, deterministic hard filters for variant/quantity/delivery eligibility, ranking rules, no-match results and quote revalidation. Explicitly defer background monitoring if not part of MVP. Provide order status, receipt/history, cancellation eligibility and a documented manual support/return/refund path; automated dispute handling may remain out of scope.

**Exit evidence:** A new user can complete a supported sandbox purchase; an ambiguous request cannot silently buy a substitute; a failed delivery has an identified support owner. Owner: product + UX lead.

### R10 · P1 · Security, audit and retention claims exceed specified mechanisms

**Evidence:** Schema lines 223–241 calls an ordinary table partitioned, immutable and tamper-evident without specifying partitioning, access controls, signature verification or external anchoring. Schema line 317 specifies encrypted email while line 48 applies ordinary uniqueness without an encrypted lookup design. Raw prompts, feed payloads and response JSON create additional sensitive-data paths. TRD line 331 and schema line 319 assert seven-year compliance without a selected jurisdiction or documented basis.

**Remedy:** Document the trust boundary, least-privilege roles, secrets/key rotation, encrypted-field lookup strategy, payload allowlisting/redaction, backup/restore and audit verification. Define what evidence supports tamper resistance and what an administrator can still change. Treat fixed retention periods as proposed until jurisdiction, record types and legal basis are reviewed; distinguish operational PII from required transaction records. Define deletion/anonymization and backup handling. An audit screen cannot prove that credentials never traversed any system.

**Exit evidence:** A data inventory maps each sensitive field to owner, storage, access, redaction and retention; audit verification and restore exercises have documented results. Owner: security/operations + product owner.

### R11 · P1 · Delivery order and operational gates need correction

**Evidence:** Plan lines 123–163 and TRD lines 412–414 place payment integration before governance. Plan lines 201–206 promises a four-week sequence without confirmed staffing or access. TRD line 435 routes a payment-error circuit breaker to approval rather than disabling the unhealthy execution path.

**Remedy:** Validate integration feasibility first; build policy, ownership checks and durable reservations before enabling payment execution. Payment adapters can be explored in an isolated sandbox earlier. Separate simulated, sandbox and production environments with explicit execution flags. A payment circuit breaker must disable affected new executions and preserve reconciliation; human confirmation does not fix an unhealthy payment system. Define incident ownership, alert routing, stuck-order detection, restore objectives and safe rollback with backward-compatible state/schema changes. Re-estimate after access and team capacity are known.

**Exit evidence:** Discovery remains usable when execution is disabled; no newly approved order bypasses the breaker; in-flight orders remain recoverable across rollback. Owner: delivery/operations lead.

### R12 · P1 · Quality targets lack a shared measurement contract

**Evidence:** TRD sets catalog p95 ≤500 ms, governance ≤100 ms and token generation ≤400 ms (lines 317–320). Plan accepts catalog <1.5 seconds and governance <200 ms (lines 115–116 and 161). PRD's “100% autonomous checkout” measures avoidance of form navigation without separating execution success or failure. Parser >95% accuracy has no supplied dataset or scoring definition.

**Remedy:** Separate safety invariants from empirical performance/product targets. Define qualified-order denominator, supported merchant set, successful order rate, human approval rate, parsing error categories and support burden. Specify load, percentile, sample size, warm/cold conditions, timing boundaries and treatment of human waiting time. Treat external-provider latency as a measured dependency, not an assured capability. Add failure-path acceptance scenarios, especially R02–R06; statement coverage alone is insufficient.

**Exit evidence:** One requirements-to-test matrix has consistent thresholds, named evidence and explicit unmeasured targets. Owner: QA + product lead.

### R13 · P1 · Research and marketing evidence is not traceable

**Evidence:** Trends and pain-point summaries supply statistics, forecasts, product claims and payment-protection assertions without source links. Website meta-prompt lines 30–32 and 121–126 adds competitor outcomes and comparisons; lines 104–110 presents unproven product guarantees as trust metrics. A missing `DESIGN-intercom.md` is referenced by the design system.

**Remedy:** Build a claim register with original URL, publication/retrieval date, exact scope, sample/method, confidence and permitted wording. Distinguish forecast, anecdote, requirement, test result and achieved outcome. Remove or qualify unsupported comparisons and avoid implied PayPal certification/partnership. Use targets and clearly labeled example data until product evidence exists. Review payment-protection statements against the selected market and official terms before relying on them. This review did not independently validate every market statistic or legal claim.

**Exit evidence:** Every public quantitative or provider claim has a supporting source or is removed. Owner: research/content + product owner.

### R14 · P2 · UI specification and generation prompt are incomplete as a build contract

**Evidence:** Meta-prompt lines 169–190 accepts `isOpen` without using it and omits dialog semantics/focus behavior; its “complete” HTML at lines 198–288 only contains navigation, hero and metrics. Design breakpoints omit clear behavior across 1024–1279 px. Technical identifiers and token displays dominate consumer-facing components.

**Remedy:** Label embedded code as illustrative and non-production. Specify keyboard interaction, focus containment/return, accessible names, status announcements, non-color error cues, contrast verification, zoom/reflow and approval timeout handling. Cover all viewport ranges and loading/error/empty/pending states. Show merchant, product, total, delivery and permission consequences first; keep protocol details in optional diagnostics and never display usable tokens. Choose a frontend stack and component source only after architecture/surface decisions; document any Material 3 interpretation rather than implying conformance from colors alone.

**Exit evidence:** The UX acceptance checklist covers full journeys, keyboard/mobile use and failure recovery; generation prompts refer to the accepted contracts. Owner: UX/frontend lead.

## Proposed remedy sequence

| Stage | Work | Completion gate |
| --- | --- | --- |
| A — Product and feasibility decisions | Resolve R01–R02; choose application surface, initial market/currency, cooperating merchant and spending-authority rules | Supported integration identified; owner records the scope and policy decision |
| B — Consistent implementation contract | Resolve R03–R10; align PRD, provider adapter, APIs, lifecycle, schema, UX and data policy | Quote, authority, reservation and recovery contracts agree; DDL and examples can be validated |
| C — Governed sandbox slice | Discovery → quote → policy/reservation → approval if needed → sandbox execution → reconciliation → receipt | Critical happy/failure paths pass against the selected merchant/provider |
| D — Pilot readiness | Resolve R11–R14; run operational recovery, security/UX checks and claim review | Named owner accepts evidence and sets narrow pilot limits |

Architecture recommendation for discussion: preserve Discovery, Governance and Payment as strict logical boundaries. Compare a modular application with a background worker and PostgreSQL against the proposed three-service/event-bus setup before committing to Kafka, gRPC and independent deployments. Record the decision based on staffing, isolation needs and measured load; the current documents do not establish that the extra infrastructure is required.

## Minimum acceptance scenarios for the implementation brief

1. Within all limits, one supported quoted product produces one confirmed sandbox order and one settled budget entry.
2. Any hard-limit breach blocks execution even when an approval message is submitted.
3. A soft approval threshold requests consent bound to the exact valid quote; rejection/expiry cannot resume checkout.
4. Tax, shipping, quantity, currency, address, price or policy changes force re-evaluation; required renewed consent cannot be bypassed.
5. Parallel requests, duplicate delivery and double-clicks cannot over-reserve budget or duplicate a charge.
6. A provider timeout after successful execution enters reconciliation; restart/retry cannot create another purchase.
7. Cross-user requests, forged prices, malicious catalog content and replayed approvals cannot authorize execution.
8. Client closure, worker crash and cache loss do not lose financial state; a reopened receipt reflects the durable outcome.
9. Missing price/date, ambiguous variants, no match, stale stock and expired quotes return understandable non-purchasing states.
10. Execution disablement and provider circuit breaking stop new payments while permitting status reconciliation.
11. Refund/cancellation/support behavior follows the selected provider contract and documented budget-accounting rules.
12. Logs, notifications and model context contain no usable payment credentials; sensitive payload retention follows the accepted data policy.

## Decisions still required from the owner

- Is the first product a standalone buyer assistant or an app on an existing AI platform? Which initial market, currency and merchant are intended?
- Must hard caps remain absolute, with a separate lower approval threshold, or should explicitly scoped one-order overrides exist?
- Should the first pilot require confirmation for every purchase, with unattended execution enabled later under a revocable mandate?
- Who owns merchant onboarding and post-purchase support, and what team capacity is available?

Recommended next deliverable: a revised PRD plus provider-feasibility decision record. Those decisions should precede a coding handoff; broader website generation and infrastructure scaffolding do not resolve the purchasing contract.
