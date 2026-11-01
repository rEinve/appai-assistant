# A-P-P-A-I product requirements document

Version: **1.1** · Updated: **29 October 2026**  
Status: Owner-requested development amendment; implementation and integration evidence pending.  
Supersedes: v1.0 for current development. Original preserved in `archive/v1.0/`.  
Related: [technical requirements](A-P-P-A-I-agent-technical-requirements-document.md), [schema](A-P-P-A-I-agent-schema.md), [plan](A-P-P-A-I-agent-product-implementation-plan.md), [acceptance matrix](DEVELOPMENT-ACCEPTANCE.md).

## 1. Product purpose

A personal procurement assistant that remembers a member's needs, searches suppliers and offers, pays supported vendors/bills within explicit limits, and reports outcomes. A member states a need in their own words; Appai preserves that prompt and extracts only the constraints needed to search and act. Members configure budget and permission once rather than repeatedly completing category forms. The assistant acts for an individual; agent-to-agent payments are outside this release.

Two purchasing modes are first-class: **PRE_APPROVED**, where an eligible purchase executes under prior scoped permission, and **REVIEW_REQUIRED**, where the assistant finds an offer and completes the purchase after a user decision. **NOTIFY_ONLY** supports observation without authority to purchase. A human approval step does not require the human to complete vendor checkout.

Examples: pay a specified monthly bill within its allocation; watch hotel offers for a planned Arusha stay; find and buy an exact replacement product under an approved total. These are supported workflow types, not proof that any named vendor or geography is integrated.

## 2. Release boundaries

| Area | First release | Later / excluded |
| --- | --- | --- |
| Instructions | One-time, future-dated, recurring bill and persistent offer watch; edit, pause, revoke and expire | Unbounded autonomous negotiation |
| Discovery | Member-only, category/area supplier catalogue; member's private supplier history; backend MCP, WebMCP via validated host, JSON-LD, configured search and read-only scraping adapters | Public supplier website, member-to-member supplier history sharing, universal site compatibility, bypass of access controls, automated purchase through arbitrary scraped forms |
| Purchase categories | PRODUCT, BILL (including utilities), and ACCOMMODATION; online transport may be considered only for a validated PayPal path | Cash-only/public transit purchase, unsupported categories, multi-merchant carts |
| Permission | Per-instruction PRE_APPROVED, REVIEW_REQUIRED or NOTIFY_ONLY; finite scope and budget | Budget balance as unlimited purchasing authority |
| Payment | PayPal only for the initial rail; provider-hosted credentials/consent; status reconciliation | Cash, Bitcoin, direct card rail or another substitute without a product decision, raw financial credentials in the model, agent-to-agent payment |
| User channel | Responsive phone UI, durable inbox and push through a validated transport; authenticated decisions | Delivery inferred merely from enqueueing a notification |
| Funds | Non-custodial budget pockets, reservations, authority checks and spend ledger against a PayPal funding source | Appai-held customer funds, prepaid card, custodial wallet or escrow |
| Later extension | Capability boundary retained | Automatic merchant holds, deposits, bidding/auction execution and delayed capture after reservation |

The owner accepts that unavailable PayPal/vendor integration can stop or redirect this project. Validate it early. It does not prevent local domain/UI development with explicitly labeled fixtures. A fixture is never advertised as a completed provider integration.

## 3. Instruction and permission model

Each instruction preserves the member's original prompt and identifies owner, desired item/service or bill account, structured constraints, maximum payable total/currency, selected budget, trigger, validity window, timezone, approval mode and completion/stop rule. The assistant may extract constraints but cannot invent missing values or grant authority. A selected budget supplies currency, hard spending ceiling, optional date limits and preferred suppliers. An instruction may narrow those dates or set a lower maximum, never exceed the budget. There is no minimum purchase amount. Drafts may be incomplete; activation requires consequential gaps to be resolved and the member to confirm the resulting scope.

The member journey is **Instruction conversation → agreed plan in Planner → payment/outcome**. Instructions are persistent conversations, not prompts followed by intake forms. The assistant preserves messages, reuses known details, researches providers when requested or within existing search scope, presents source links and price evidence, and discusses alternatives until the member agrees. Ask only consequential missing questions in context; never require repeated category questionnaires or manual transcription of extracted fields. Saving a conversation does not require a budget, exact price, supplier or payment readiness.

Planner is a read-only agenda/to-do projection of the agreement, organized by the agreed action dates in the member's timezone. It shows the task, selected provider, quantity, timing, agreed cost or clearly labelled estimate, and status. It does not create instructions, edit agreement fields or contain budget-entry forms. An unresolved task may appear as provisional; it cannot be presented as ready to pay. To change a plan, **Edit instruction** returns to its existing conversation; the assistant incorporates the change and regenerates the plan after agreement.

Payment presents the payable total, remaining budget capacity and **Pay** or **Activate agreed schedule**, as appropriate. Confirmed funding availability is shown only when connected and verified; otherwise it is unavailable. Budget limits are not cash. Budget decisions and changes are discussed in the instruction conversation and applied through authenticated, versioned policy operations. Required provider consent remains a supported connection flow. Planner navigation and agreement to research do not grant payment authority.

For a need whose supplier is not known, search the member's successful supplier history and budget preferences first, then relevant category/area sources. Return a concise, ranked shortlist of up to three candidates with source, freshness, price and fit evidence. Catalogue presence and a supplier's claim to accept PayPal do not prove purchase capability. PRE_APPROVED permission can be supplier-independent only within the member's exact service, location, terms, date and maximum-price scope, and only when the selected supplier and PayPal path are validated. REVIEW_REQUIRED always requests approval bound to the current authoritative quote; NOTIFY_ONLY cannot initiate payment.

Member supplier history is private and owner-scoped. Successful real purchases may update only that member's private history. Fixtures do not create supplier relationships. The member-only supplier catalogue contains provider information and capability evidence, not other members' identities, budgets, instructions, purchase records or relationship history.

A one-time need or offer watch defaults to one successful fulfillment, not one purchase for every matching price. Recurring bills create one obligation per vendor account/invoice or billing cycle. A duplicate trigger cannot create another purchase for the same obligation. In MVP, a newly rejected candidate is not repeatedly re-notified; the watch may continue for materially changed offers until its expiry or successful fulfillment.

Rules apply in this order: supported capability and current user authority; exact instruction constraints; authoritative vendor quote; hard policy and available allocation; then approval-mode decision. PRE_APPROVED bypasses per-order review only when all checks pass. REVIEW_REQUIRED always requests review even below every budget threshold. NOTIFY_ONLY never creates payment authority; the user must explicitly change the instruction or create a purchasing instruction.

Hard caps and request ceilings cannot be overridden by a generic approval. To increase a limit, the user requests a policy/instruction change in the instruction conversation and explicitly confirms the authenticated, versioned change, which increments its version and causes re-evaluation. A configurable soft approval threshold can require review within hard limits. Changes/revocation invalidate unused older approvals and are rechecked before external submission. Once an external submission may have happened, revoke/pause prevents new submissions but does not imply rollback of that operation.

## 4. User journeys

### 4.1 Set and forget

User signs in and describes a need in an instruction conversation; the assistant researches and clarifies, the member agrees the plan and spending scope, Planner displays it, and the member pays or activates the agreed schedule with supported provider consent. Durable jobs execute while the UI is closed. Missing authentication or vendor support yields a visible BLOCKED reason and mobile action rather than repeated prompts or false success.

### 4.2 Pre-approved scheduled purchase or bill

At the configured time, load current instruction and obligation, check whether already paid, obtain current vendor terms, evaluate authority and budget, reserve allocation, execute once, reconcile the vendor/payment outcome and persist receipt. Notify the user. A provider-required interaction becomes an action-required interruption rather than permission bypass.

### 4.3 Watch, review, buy

Search on schedule/event until an eligible offer is found. Obtain an authoritative quote including final total and cancellation terms. Persist a quote-bound approval and send mobile notification. On authenticated approval, revalidate quote/current policy, reserve budget and execute. A price, dates, payee or cancellation change requiring new consent returns to review. No response causes approval expiry, not purchase. Continue the watch within its stop rules.

### 4.4 Cancel and recover

Before external submission, cancel the purchase operation without charging. After possible submission, show pending status until reconciled. A post-purchase cancellation is a vendor request; report success only after confirmation. Refunds are tracked separately from cancellation and do not restore allocation until the agreed accounting rule is met.

## 5. Functional requirements

Amended 1 November 2026: FR-20 and AC-19–AC-21 define the owner-authorized conversational journey. Existing execution safety contracts remain binding.

IDs FR-01–FR-07 retain their original domains and are amended below. New IDs cover the previously missing behaviors.

| ID | Requirement | Acceptance coverage |
| --- | --- | --- |
| FR-01 | Read validated catalog/offer data through capability-declared discovery adapters; record source and freshness | AC-04, AC-05 |
| FR-02 | Extract typed intent constraints; clarify missing/ambiguous values without inventing price, dates, payee or authority | AC-01, AC-04 |
| FR-03 | Apply deterministic constraints before ranking; separate found offers from purchasable vendor quotes | AC-04, AC-05 |
| FR-04 | Execute supported vendor checkout/payment through controlled adapters; prevent duplicate execution and reconcile uncertain outcomes | AC-06, AC-09, AC-10 |
| FR-05 | Keep usable payment credentials in provider/isolated adapter paths, outside prompts, client responses, audit payloads and discovery storage | AC-02, AC-14 |
| FR-06 | Enforce exact full-total hard limits and atomic shared-budget reservations; no spending capacity invented by cache loss | AC-07, AC-08 |
| FR-07 | Require review per mode/soft threshold; bind each decision to user, obligation, quote and current permission version | AC-06, AC-11 |
| FR-08 | Persist instruction lifecycle, mode, constraints, validity, timezone, stop rules and version | AC-01, AC-03 |
| FR-09 | Run durable scheduled/watch jobs with bounded retries, leases, recovery and trigger deduplication | AC-03, AC-09 |
| FR-10 | Identify a unique purchase obligation and allow at most one unresolved execution for it | AC-08, AC-09, AC-10 |
| FR-11 | Obtain vendor-confirmed typed quote with total, currency, terms, expiry and category identifiers | AC-04, AC-05, AC-11 |
| FR-12 | Configure supported provider consent/vendor sessions; pause for reauthentication and respect revocation | AC-02, AC-12 |
| FR-13 | Persist notifications/inbox; dispatch mobile push, retry independently and distinguish delivery/decision state | AC-06, AC-13 |
| FR-14 | Present durable receipt/history, current operation status and supported cancel/refund progress | AC-10, AC-15 |
| FR-15 | Declare adapter capability and environment; unsupported actions cannot enter executable paths | AC-02, AC-12, AC-17 |
| FR-16 | Keep scheduler/execution independent of phone UI; validate browser-host session survival for WebMCP actions | AC-03, AC-12 |
| FR-17 | Support watch-only mode and authenticated mode changes without silently granting purchase authority | AC-01, AC-06, AC-11 |
| FR-18 | Retain vendor/payment boundaries for later reservation workflows without executing that extension in MVP | AC-17 |
| FR-20 | Persist the instruction conversation, research evidence and versioned agreement; derive read-only Planner entries; route changes to the same conversation and bind payment to current agreed scope | AC-19, AC-20, AC-21 |
| FR-19 | Provide local email/password sign-in through a maintained authentication library backed by PostgreSQL; keep member data private to the authenticated owner and support sign-out, session expiry and account recovery | AC-14, AC-18 |

## 6. Money and policy rules

Use exact integer minor units and an explicitly configured ISO currency/minor-unit scale; do not assume all currencies have two decimals. An instruction, quote, allocation and funding authority must share the enabled currency. No currency conversion in MVP. Start with one deployment-configured supported currency; there is no assumed live default or automatic allocation amount.

The payable total includes quantity, taxes, fees, shipping and applicable discounts. Unit caps, per-order ceilings, daily limits and instruction allocation have distinct meanings and must all pass where configured. Fail closed on unknown final cost. Availability is allocation/limit minus counted settled spend and active reservations, calculated transactionally. Refund accounting restores capacity only for confirmed refunded amounts, never while refund status is unknown. No cross-user pooling. Daily periods use the user's saved IANA timezone with explicit period boundaries; unresolved prior-day liability remains counted until resolved.

## 7. Non-functional requirements

- Safety invariants: no execution without current scoped authority; no duplicate settled purchase per obligation; no hard-limit overrun; no UI-dependent financial persistence.
- Privacy/security: authenticated ownership on every object; isolated secrets/session references; allowlisted external origins and bounded fetches; untrusted pages cannot change permission or call payment tools. Audit state-changing user/worker actions and redact payloads.
- Reliability: durable jobs, notification outbox and reconciliation survive restart. Lost responses become pending/unknown, not assumed failure. Execution can be disabled per adapter/environment without disabling reconciliation.
- Performance targets for measurement, not provider guarantees: internal policy/reservation p95 ≤200 ms at 10 concurrent eligible operations per test user; API acknowledgement p95 ≤1 second under documented local/staging load; due jobs begin within 60 seconds under that test load. Watch frequency obeys source limits; vendor latency, human wait and browser launch are measured separately. Revisit these targets using M0 measurements.
- Accessibility: mobile keyboard and screen-reader operation, clear pending/action states, authenticated approval via a deep link; a notification preview cannot itself approve a purchase.
- Data policy: minimize raw prompt/feed retention; document selected retention and deletion before live pilot rather than asserting a universal seven-year rule. Preserve financial reconciliation references under the agreed policy.

## 8. Acceptance and success metrics

[DEVELOPMENT-ACCEPTANCE.md](DEVELOPMENT-ACCEPTANCE.md) owns AC-01–AC-17 and release evidence. Every safety scenario must pass; percentages cannot hide an unsafe case. Report qualified instruction fulfillment, watch detection delay, review-required approval completion, notification delivery failures and pending-reconciliation age with environment, denominator and supported vendors. Parsing quality uses a versioned test corpus covering missing values and category constraints; safety-relevant uncertainty blocks activation rather than being accepted within an overall accuracy score.

## 9. Development sequence and live gate

Follow M0–M5 in the [implementation plan](A-P-P-A-I-agent-product-implementation-plan.md). Establish permissions, quote contracts and reservations before enabling payment execution. One validated category/vendor slice precedes broad coverage. Domain contracts include all three categories, but each real adapter remains disabled until its own validation; do not describe a fixture as live bill/hotel support.

Open external selections: initial vendor/category pair, supported market/currency, actual PayPal integration/consent path, WebMCP host, search source and mobile push transport. M0 records them and evidence. These are bounded integration tasks, not reasons to redesign the product as a manual checkout tool. No funds move until the relevant gate passes.

## 10. Later pre-purchase extension

After first-release acceptance, add vendor-supported reservation, separate authorization/capture permission, outstanding-hold capacity and expiry/compensation. The existing instruction/job/quote/payment boundaries are reused. A funds hold must not be equated with a merchant reservation or service extension. No deposits, bids or custodial escrow are implied by this roadmap.

## 11. Revision record

| Version | Change |
| --- | --- |
| 1.0 · 28 October 2026 | Original discovery, tokenized payment and governance concept |
| 1.1 · 29 October 2026 | Owner-requested persistent procurement, permission modes, runtime/adapter contract, safe execution and staged pre-purchase extension |
