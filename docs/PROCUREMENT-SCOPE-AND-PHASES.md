# Personal procurement assistant: scope clarification and build sequence

Date: 29 October 2026  
Basis: Owner clarification in this chat after review of the pre-purchase engine  
Purpose: Correct the scope used by the reviews and identify only consequential gaps in the existing PRD. Reconciled into the v1.1 PRD, technical requirements, schema, implementation plan and current Markdown flows on 29 October 2026; application implementation remains pending. See [development index](README.md).

## Product intent

This is a personal procurement officer acting for a person and paying vendors/service providers. It is not an agent-to-agent payment network. Provider and vendor support is an explicit feasibility condition; the owner accepts dropping or changing the direction if the necessary payment integration is unavailable.

The user configures needs, timing, budgets and purchasing permissions ahead of time. The assistant does the searching, monitoring and supported purchasing work. Notifications and decisions arrive on the user's phone. A user approval step does not mean the user must manually visit each vendor and complete checkout.

Interpretation of the spoken terminology: “WMCP / Webu MCP” refers to WebMCP; references to “paper” in the payment integration discussion are interpreted as PayPal. These spellings are not separate requirements.

## First release and later extension

| Stage | Behavior | Authority |
| --- | --- | --- |
| First release: approved purchases | Execute a configured bill or purchase when its conditions are met; notify the user of the result | Prior scoped user permission and supported provider/vendor authorization |
| First release: review before purchase | Search/watch for an eligible offer; notify the user; execute after the user green-lights that offer | Explicit approval before purchase |
| Later extension: pre-purchase engine | Secure a vendor-supported reservation/hold, notify the user, then capture or release according to the agreed policy | Separate authority to reserve/authorize, followed by the required capture decision |

The later feature is an extension, not a replacement for the first release and not a prerequisite for delivering it. “Premium” here describes the later capability; no commercial tier or pricing model has been decided.

Examples from the owner: a planned Arusha trip with hotel-offer monitoring, budgeted bills due on known dates, and purchases that can execute automatically within a prior instruction. These examples establish intended workflows, not a promise that every travel or billing provider is supported in the initial release.

## Can the later engine be added without rebuilding the first?

Yes, provided the first release separates the following responsibilities:

1. **Procurement instruction:** What to obtain/pay, when, for whom, eligible vendors, constraints, maximum total and stop/expiry condition.
2. **Permission policy:** Execute automatically, ask first or only notify. A valid budget alone is not enough to identify the permitted item, payee or billing obligation.
3. **Durable job:** Scheduled bill, one-time purchase or persistent watch; survives closing the phone UI and restarting a worker.
4. **Vendor quote/order adapter:** Resolves actual purchase terms and executes supported vendor actions.
5. **Payment adapter:** Executes only the actions supported by the selected payment arrangement; records external references and reconciles unknown outcomes.
6. **Budget accounting:** Reserves capacity before purchase, records settled outcomes and supports concurrent jobs.
7. **Mobile notification and decision:** Approval tied to the exact offer, status retrieval, revocation and supported cancellation.

Later, add reservation/authorization/capture/release capabilities to the adapters and additional reservation accounting. Do not build those later mechanisms now. Avoid baking the assumption “purchase is one immediate charge with no intermediate states” into the domain.

An allocated budget, linked funding account, funded wallet and escrow are different implementation choices. The owner has proposed wallet/escrow as a possibility, not selected custody of funds as an MVP requirement. The first release can model allocation and purchasing permission independently of the eventual funding product.

## Consequential gaps identified before v1.1

The following findings explain the amendment. They describe the earlier documents; the current implementation contract now addresses them. Use the development index rather than treating this historical rationale as a competing specification.

### 1. WebMCP execution and set-and-forget operation need a runtime decision

The PRD describes backend MCP/JSON-LD discovery and direct checkout APIs. WebMCP is a browser/page tool interface; these are not interchangeable execution environments.

Official [Chrome WebMCP documentation](https://developer.chrome.com/docs/ai/webmcp) says tools execute in the page and clients must visit a site to discover them. It describes local browser workflows as the primary design and notes limits for headless use. The [WebMCP project](https://github.com/webmachinelearning/webmcp#goals--non-goals) distinguishes it from backend MCP and excludes purely server-side autonomous workflows from its intended scope. Checked 29 October 2026.

**Failure if overlooked:** The assistant works while a page is open, but the promised scheduled/background operation stops when that browser session disappears. A phone notification channel does not supply the missing execution runtime.

**Remedy:** Choose and prove the agent host: an owned persistent browser runtime for supported WebMCP sites, backend vendor MCP/APIs where supported, or a defined combination. Specify session expiry/reauthentication and how jobs pause/resume. Do not assume WebMCP itself provides a scheduler, persistent sessions or unattended payment authority. This is a runtime limitation to solve, not proof that the product is impossible.

### 2. The written MVP lacks the persistent instructions and jobs the owner expects

PRD UC-01 begins with an immediate prompt. The schema has order intents but no complete lifecycle for future-dated instructions, recurring bills or offer watches.

**Failure if overlooked:** The team ships a purchase chat interface, but “watch this for next month” or “pay this bill when due” cannot run without another prompt.

**Remedy:** Add a durable procurement instruction/job model with schedule/watch triggers, stop conditions, current permission, deduplication and restart recovery. Separate a long-lived instruction from each purchase attempt. A watch can produce many observations but must not repeatedly buy the same need; a recurring bill needs one operation per vendor obligation/cycle.

### 3. Discovery coverage and service purchase contracts disagree with the use cases

PRD §2.2 and §9.2 explicitly exclude scraping. The owner's desired discovery includes search/scraping. Existing examples and schema center on a stocked SKU with delivery date rather than a stay, service plan or bill.

**Failure if overlooked:** The assistant cannot find offers on the intended sources or can find a hotel price without enough information to book the requested stay correctly.

**Remedy:** Separate read-only discovery from purchase execution. Decide which search/scraping sources are supported initially, validate discovered offers with the vendor before paying, and define one initial purchase category. For accommodation, dates/guests/room/rate and cancellation terms are part of the quote. For a bill, account/invoice/cycle and paid status matter. A generic SKU/price record is not a complete contract for either. Other categories may be added through adapters rather than promised universally in release one.

### 4. Prior permission must describe the purchase, not just the available balance

PRD UC-02 allows execution after matching and budget checks; approval primarily handles threshold exceptions. It does not fully express the owner's per-task choice between automatic execution and review first.

**Failure if overlooked:** The assistant buys an unwanted substitute within budget, repeatedly pays one bill, or purchases an offer the user intended only to monitor.

**Remedy:** Persist the instruction's mode, permitted payee/product/category, exact constraints, maximum total, frequency/quantity and validity period. Re-evaluate that permission when acting. Approval-required instructions remain approval-required even below the budget cap. This preserves automatic execution for the purchases the user pre-approved.

### 5. Immediate notification does not guarantee reversibility or transaction correctness

Phone delivery reduces response delay but cannot guarantee that an accepted booking or captured payment is cancellable. Existing documents also lack a complete unknown-outcome/reconciliation contract.

**Failure if overlooked:** The user taps cancel but the vendor has already committed a non-cancellable purchase; a timeout retry duplicates it; simultaneous jobs exceed their shared allocation.

**Remedy:** Obtain relevant cancellation terms before execution and incorporate them into the instruction/approval policy. After purchase, cancellation is a vendor operation whose success must be confirmed. Implement stable purchase identity/idempotency, unknown/pending outcomes, status reconciliation and atomic budget reservations in the first release. Phone notifications report and control these operations; they do not replace them.

## Revised build direction

1. Validate one supported vendor/payment execution path; retain the owner's explicit integration feasibility condition.
2. Define persistent procurement instructions, permission modes and one initial category's quote/order contract.
3. Build durable jobs, budget reservations and safe payment execution; prove a pre-approved scheduled purchase and an approval-required offer purchase.
4. Prove mobile notification/decision, restart recovery, duplicate-trigger handling and supported cancellation.
5. Expand vendor/category coverage based on actual adapters.
6. Add the pre-purchase engine later, applying the vendor reservation and authorization/capture findings from its separate review.

Existing PRD foundations around discovery, payment isolation and budget governance remain useful. The major amendment is to make persistent instructions and permission modes first-class, settle the WebMCP runtime, and align the supported discovery/purchase categories. The later reservation feature should not delay this first-release design.
