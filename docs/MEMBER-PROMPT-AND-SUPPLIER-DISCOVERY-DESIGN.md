# Member prompt and supplier discovery design

Status: **Owner-confirmed product direction; implementation and provider validation pending**  
Date: 30 October 2026  
Authority: product behavior direction for revision of the PRD, flow, technical contract and schema. This document does not enable external search or payment.

## Understanding summary

- Members state a need in their own plain-language prompt rather than completing a long Appai-created category form.
- Preserve the prompt as written. Extract useful constraints from it, reuse known member details, and ask only for missing information that affects fit, price, service, or safe fulfillment.
- Budgets hold a maximum spending limit, currency, optional date limits, and preferred suppliers. Instructions inherit those values; an instruction may narrow them, not exceed them. There is no minimum purchase amount.
- Search the member's own prior suppliers and budget preferences first, then relevant suppliers from a category- and location-aware catalogue/search. Show a short, ranked list (up to three strong matches) with price, date/area fit, source and freshness.
- The catalogue is for signed-in members, organized by service category and area. It is not a public website or a member-to-member directory. Each member's supplier history and purchases remain private.
- After a member chooses a supplier, reuse prompt details in that supplier's supported form/contact flow and ask only for missing required fields. Do not invent a separate long form for every category.
- PayPal is the first payment rail. No cash or Bitcoin purchasing. Other rails require a later decision. The "wallet" means internal budget pockets, authorization checks and a durable spend ledger; Appai does not hold customer funds or issue a prepaid card.

## Permission and purchase behavior

- **PRE_APPROVED:** may proceed with a new or known supplier without asking for approval on each matching offer, only when the instruction, supplier capability, exact amount, deadline, budget, and verified PayPal path all satisfy the user's scope.
- **REVIEW_REQUIRED:** present the authoritative supplier quote and require the member's approval for that specific purchase.
- **NOTIFY_ONLY:** search and report; never initiate payment.
- Selecting a search result identifies the preferred candidate. It is not, by itself, new authority. Existing instruction permission determines whether final review is required.
- Supplier details from listings are candidates until verified. A fixture, search snippet, or supplier's claim to accept PayPal does not prove Appai can complete or reconcile a real purchase.

## Supplier records and privacy

- Keep an Appai-maintained/catalogue record separate from a member-owned supplier relationship and purchase history.
- Rank a member's previously used suppliers and budget-preferred suppliers first. Successful real purchases may update only that member's private history.
- Do not expose member identity, instructions, budget, receipts, pricing history, or supplier relationship to other members. Member-to-member supplier-list sharing is out of scope.
- Catalogue records should carry category, service area, source, last-checked time, and separate discovery/payment capability states. Categories can describe transport, utilities, accommodation, products and other services, but search or purchasing stays disabled unless that category and provider path are supported.
- Transport is considered only for services with an online flow and a verified PayPal path. Cash-only providers and Bitcoin are not eligible for purchase.

## Budget inheritance

- The budget's maximum is the hard ceiling. An instruction may specify a lower ceiling in its prompt or follow-up, never a higher one.
- Optional budget start/end dates are defaults for linked instructions. Instruction dates may narrow the interval; they cannot expand beyond budget dates.
- The prompt may include a deadline or travel dates. Extract them and show the interpreted values so the member can correct them. Do not silently replace user dates with assumed dates.
- The current budget model has amount/currency/active state only. Adding budget dates and preferred suppliers requires a schema/API change. The current instruction/category form is not yet the agreed prompt-first experience.

## Assumptions and non-functional constraints

- The member workspace is the only surface for member supplier history and catalogue use; all member-owned records remain owner-scoped in PostgreSQL.
- Search must be useful on a phone, return a concise shortlist, and distinguish unknown, advertised and verified capabilities.
- Appai stores no PayPal password, card number or bank credentials. Use provider-owned consent/credential flows selected and validated through M0.
- Before public/live use, verify search origins, supplier identity, regional availability, PayPal consent/checkout support, authoritative quotes, idempotency and purchase-status recovery. Do not claim real discovery or execution from fixture results.

## Decision log

| Decision | Chosen direction | Alternative considered | Reason |
| --- | --- | --- | --- |
| Need capture | Preserve a plain-language member prompt; ask only consequential missing details | Appai-authored forms for each category | Reduce repeated entry and keep the user's stated need visible |
| Budget relationship | Budget owns cap, optional dates and preferred suppliers; instructions inherit and may narrow | Re-enter those values on every instruction | Avoid duplicate data and conflicting limits |
| Supplier order | Member history, budget preferences, then new category/area discovery | Search all providers equally or require a known provider | Respect existing relationships while allowing new suppliers |
| Results | At most three strong candidates, with evidence and freshness | Long unranked list | Keep choices manageable and useful |
| Directory visibility | Member-only catalogue plus private per-member supplier history; no sharing feature | Public web directory or shared member lists | Preserve member privacy while supporting category-based search |
| Purchase modes | PRE_APPROVED may act within exact scope; REVIEW_REQUIRED asks per quote; NOTIFY_ONLY never pays | Ask approval for every purchase | Honor bounded prior authorization without weakening review-required behavior |
| Initial payment | PayPal only; investigate other rails later | Direct card, cash, Bitcoin, or generic payment abstraction | Keep initial integration narrow and verifiable |
| Funds | Internal budgets/pockets and spend ledger; no Appai custody or prepaid card | Custodial wallet | Reduce custody risk and keep funds with the member's provider |

## Implementation order and open capability gates

1. Align PRD, user flow, technical contract and schema on prompt preservation, budget date/supplier inheritance, owner-scoped supplier history and permissions.
2. Implement a prompt-first draft and budget inheritance using local fixtures; make unresolved details explicit rather than fabricating them.
3. Build category/area supplier discovery only against explicitly configured sources. Keep fixture and live search states distinct.
4. Validate the intended vendor/browser and PayPal paths in M0 before enabling supplier forms, messages or purchases. PRE_APPROVED can only execute after the full capability and recovery gates pass.
5. Add secure PayPal consent/reference and durable budget/reservation accounting without storing funds or raw credentials in Appai.

Open engineering decisions: initial search sources and market coverage; how supplier catalogue records are sourced/refreshed; provider form/communication capabilities; exact PayPal consent, execute and status APIs; trusted browser/worker runtime; and which transport providers/categories pass those checks. These are capability investigations, not assumed integrations.
