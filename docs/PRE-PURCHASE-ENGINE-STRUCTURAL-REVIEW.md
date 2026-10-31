# Pre-purchase engine: structural review

Date: 29 October 2026  
Status: Review and proposed remedies, not an accepted implementation design  
Primary source: [PRE PURCHASE ENGINE.md](PRE%20PURCHASE%20ENGINE.md)

Scope correction after owner clarification: This review concerns a later extension, not an MVP prerequisite or replacement direction. The first release supports pre-approved purchases and purchases requiring review. See [current scope and phases](PROCUREMENT-SCOPE-AND-PHASES.md); the hold-specific findings here apply when that extension is added.

Amendment status: The first-release PRD, technical requirements, schema and plan were revised to v1.1 on 29 October 2026. Comments below about gaps in the existing implementation plan/schema refer to the pre-amendment baseline, not the revised files. Start implementation from [docs/README.md](README.md).

## Corrected understanding

The intended product is an unattended opportunity and continuity engine:

**Watch a vendor/account → detect a valuable deal or renewal risk → automatically secure a supported reservation and payment authorization → notify the user → capture on approval or release on rejection/expiry.**

Automatic action before the notification is intentional. The review does not recommend removing it. The source specifies final user approval for capture, so this version should distinguish authority to reserve/authorize from authority to settle a payment. Prior user/provider consent may enable unattended actions; its concrete integration still needs to be established.

The embedded requests to search data and generate a specification in the source are reference material, not instructions followed by this review.

This document supersedes the earlier review's generic checkout framing for this engine. Earlier material on duplicate transactions and durable accounting remains relevant, but should be applied to reservations, authorizations and capture separately. Marketing, naming, styling and document approval labels are outside this review.

## Assessment

The central structural risk is that the document combines three different things into one “lock”: a payment authorization, a merchant reservation, and continued subscription access. The design must connect all three through supported vendor behavior; a PayPal call alone does not establish that connection.

The concept is feasible to pursue with vendors that support the required reservation/continuity behavior and payment authority. The supplied documents do not yet establish such an integration. Vecteezy is the owner's motivating experience, not a verified supported integration; this review makes no claim about Vecteezy's actual APIs or policies.

## 1. Critical: holding funds does not establish a merchant reservation or prevent service suspension

**Source:** Lines 11–14 says initializing a PayPal transaction tells the vendor not to release a slot or cut service. Lines 48–59 jumps from a PayPal order/authorization to a vendor slot lock. No vendor operation or acknowledgement is defined for that jump.

**Concrete failure:** The agent obtains payment authorization and records a deal as locked, but the vendor never reserves the seat, honors the discount or extends the existing subscription. The seat sells or the service is suspended while the app reports success. Every payment call can be technically successful while the core product fails.

**Verified distinction:** PayPal describes authorization as holding the buyer's funds before later capture. Its integration explicitly leaves business tasks such as stock verification to the merchant. It does not define a universal command to reserve an external vendor's inventory or extend service access. See [PayPal authorize and capture](https://developer.paypal.com/v5/checkout/auth-capture).

**Required remedy:** Add a vendor reservation/continuity contract. It must return a vendor reservation reference, precise offer/price/seat or subscription entitlement, binding expiry, conditions of release and status lookup. For renewal protection, require explicit vendor acknowledgement of the grace period or continuity extension. Do not enter `DEAL_LOCKED` merely because a PayPal ID exists. If a vendor cannot provide the commitment, the engine can detect/notify or purchase under separately authorized rules, but the proposed hold behavior is not established for that vendor.

**Decisive test:** A cooperating vendor confirms the reservation or extension, competing purchase/expiry is exercised in its test environment, and the promised entitlement remains protected until the agreed deadline.

## 2. Critical: the PayPal sequence skips actual authorization and its authority boundary

**Source:** Lines 48–56 depicts create order with `intent: AUTHORIZE` immediately returning an order ID and authorization token. Line 59 treats a create-order call as a strict hold request. Line 75 assumes this application's backend can later capture or void the vendor's authorization.

**Concrete failure:** The worker creates an order, has no actual authorization to capture, and cannot act while the user is asleep because the selected integration still requires buyer approval. Alternatively, it authorizes a payment under the app's own merchant account without creating any obligation at the intended vendor.

**Verified distinction:** PayPal exposes separate create-order and authorize-order operations. The standard integration obtains buyer approval before authorizing; later capture uses an authorization ID. Developer credentials authenticate an API client, but are not by themselves a buyer's spending delegation or permission to manage another merchant's payment. See [Orders v2](https://developer.paypal.com/api/orders/v2) and [standard authorization flow](https://developer.paypal.com/v5/checkout/auth-capture).

**Required remedy:** Identify the buyer, payee, API caller and authorized capture/void actor. Establish the actual supported prior-consent/delegation flow for unattended authorization. Store order ID, authorization ID and vendor reservation ID as different references. Verify whether the app invokes a vendor endpoint or acts through a supported partner integration. Define separately the final in-app sign-off that permits capture. A new app-level approval is meaningful only if the app has effective control over the capture operation through the chosen integration.

**Decisive test:** After initial onboarding, with the user offline, the worker obtains a valid sandbox authorization for the intended vendor and can later request capture/void through the authorized path. A simulated ID does not prove this capability.

## 3. Critical: renewal rescue is not yet connected to the existing subscription obligation

**Source:** Lines 3 and 21 make prevention of service cuts the motivating outcome. Lines 42–59 proposes monitoring expiry and creating an authorization, without mapping it to the vendor's existing subscription, billing cycle or failed invoice.

**Concrete failure:** The same expired card or unavailable funds causes the rescue authorization to fail. Or the original renewal is retried successfully while the agent pays separately, creating duplicate billing. A successful new order may still leave the old subscription unpaid because the vendor does not apply it to that account/cycle.

**Required remedy:** Treat renewal continuity and a new discounted purchase as distinct workflows. For renewals, identify the vendor account, subscription, cycle/invoice, outstanding balance, original collection attempts, service cutoff and vendor-confirmed remedy. Determine why collection failed. A new order cannot be assumed to repair it. Coordinate retries through the vendor; use an already supported alternative payment source if the user has authorized one. If no valid source or grace arrangement exists, escalate with an honest unresolved state.

**External support:** PayPal's subscription documentation describes failed-payment retries and outstanding-balance recovery on the subscription itself. This supports the need to account for existing collection attempts; it does not establish any particular vendor's billing behavior. See [payment failures and recovering balances](https://developer.paypal.com/subscriptions/payment-failure-retry/).

**Decisive test:** Cause a renewal failure, trigger the agent and the original billing retry concurrently, and verify that exactly one intended cycle is paid and the original entitlement remains active or is restored.

## 4. High: continuous detection has no defined access to the facts it needs

**Source:** Lines 9–11 promises continuous scanning of discounts and dwindling seats. Lines 42–43 assumes access to vendor pricing, tier metrics, renewal status and impending failure. The older documents mainly specify public product discovery after a prompt.

**Concrete failure:** The system can read a public price but cannot see the account-specific renewal failure or true remaining seat count. It misses a short-lived opportunity between polls, mistakes missing data for a healthy subscription, or stops watching after a worker restart.

**Required remedy:** Specify a persistent watch rule per account/offer, authenticated source for each signal, events versus polling, rate limits, freshness, trigger deduplication and worker restart recovery. Distinguish a known renewal date from a predicted payment failure. Define what “predictive” adds beyond scheduled checks; a due date alone cannot establish that a payment will fail. Missing or stale status must become unknown rather than healthy.

**Decisive test:** Feed a real vendor test event or supported account response into the worker; it detects the condition within the vendor's useful action window and recovers missed work after restart. If only mock data is available, detection for that vendor remains unproven.

## 5. High: the hold and approval lifecycle can expire or split across systems

**Source:** Lines 20–22 and 62–75 assumes alert delivery, a 25-minute hold, final capture or instant cancellation. No persisted expiry worker, conflicting-decision handling, vendor-release confirmation or failed-capture recovery is defined.

**Concrete failure:** A reservation expires while a delayed approval is in transit. The app captures against a lost seat. Or the vendor reservation succeeds but payment authorization fails; the reverse leaves funds held with no deal. An offline user can miss every short approval window. An approval click and cancellation can race.

**Required remedy:** Persist vendor reservation, payment authorization, user decision, capture and entitlement as separate coordinated lifecycles. Track each deadline; payment authorization validity does not extend a merchant's reservation. Capture only within a still-valid vendor commitment and approval scope. Define compensation and status reconciliation for every partial outcome. Retry notifications without recreating holds. On no response, apply the agreed expire/release rule and record that service continuity may end unless the vendor has granted a grace period. Do not silently add auto-capture; the source reserves capture for final sign-off.

**Cancellation distinction:** Voiding payment authorization, releasing the vendor reservation and the customer's funding availability are separate outcomes. Confirm each through its owning system; the document's instant, zero-penalty release is not established by the described flow.

**Decisive test:** Inject failures between every pair of external actions; expire the vendor hold before approval; deliver approve/cancel twice and out of order. No capture may occur for an invalid reservation, and all unmatched holds must enter cleanup/reconciliation.

## 6. High: speculative holds can exhaust the buyer's capacity without any captures

**Source:** Lines 11–12 lets the engine catch opportunities continuously and mixes upfront payments, partial payments and placeholder authorizations. The existing daily spend model primarily accounts for executed orders.

**Concrete failure:** Multiple overlapping offers each place a hold. Captured spend remains zero while available funds are tied up. Those holds can obstruct the very subscription renewal the agent is intended to protect. Repeated detection can also duplicate the same reservation.

**Required remedy:** Distinguish authorization, deposit and settled purchase as different financial actions. Define a total outstanding-authorization budget, maximum active holds and one active action per subscription cycle/opportunity. Reserve capacity durably before calling external systems; retain it while the external outcome is unknown. Decide whether equivalent offers replace one another and how essential renewals take priority. Deposits require their own cancellation/refund behavior and cannot inherit the semantics of an uncaptured authorization.

**Decisive test:** Detect many overlapping opportunities and replay the same event. The worker neither exceeds hold capacity nor duplicates a hold, including after cache loss or restart.

## Drift in the existing implementation plan

The current PRD and plan would mainly deliver a prompt-driven catalog search and immediate-checkout product. This source makes continuous monitoring and a long-lived reservation/approval workflow central. The existing schema lacks first-class watch rules, subscription cycles, vendor reservations, payment authorizations, notification attempts and expiry/reconciliation work.

Following the existing milestones unchanged could therefore produce a working application that misses the intended product. Rebase the plan around **one vendor watch → one supported hold → user decision → capture/release → verified vendor outcome**. Discovery/chat should serve this engine rather than determine its architecture.

“Bidding” also needs an explicit boundary: the document defines discount detection and reservation, but no bid submission, auction rules or award lifecycle. If actual bidding is intended, it is an additional integration workflow; do not assume a discount watcher supplies it.

## Proposed first feasibility slice

Use one cooperating vendor and one account/offer type, with sandbox money. Choose either a reservable offer or an existing subscription renewal for the first experiment; both remain within the overall product direction.

1. Obtain an authentic supported monitoring signal and resolve it to the exact account/offer/cycle.
2. Establish prior authority for the unattended action and reserve internal hold capacity.
3. Obtain the vendor commitment and actual payment authorization in the integration's supported order; compensate if only one succeeds.
4. Persist both references and deadlines, then send the action notification.
5. On authenticated sign-off, confirm reservation validity and request capture exactly once; on rejection/expiry, request release/void and reconcile.
6. Verify the vendor outcome: promised entitlement/seat/price, or payment applied to the correct subscription cycle. A payment success alone is insufficient.
7. Repeat with lost responses, capture failure, original renewal retries, user silence and process restart.

The first experiment should answer: **Can this vendor actually protect the opportunity or service while settlement is deferred, and can this app control that lifecycle?** If yes, the rest of the build has a concrete foundation. If no, revise the vendor strategy or supported behavior before investing in a general engine.

## Verification limits

This review inspected the new source and compared it with the existing PRD, technical requirements and schema. Official PayPal documentation was checked on 29 October 2026. No provider account, vendor integration, Vecteezy private API, live funds or application implementation was accessed. External API examples establish general payment semantics, not project-specific access or a working vendor reservation.
