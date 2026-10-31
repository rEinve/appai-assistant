# A-P-P-A-I current user flows

Baseline: **v1.1 · 29 October 2026**. This Markdown document replaces `A-P-P-A-I-agent-user-flow-chat.pdf` v1.0 as the development flow contract. The PDF remains historical and unchanged. States and permissions follow the [technical requirements](A-P-P-A-I-agent-technical-requirements-document.md).

## 1. Onboarding and configuration

Unauthenticated visitor → invitation-only local account enrollment or email/password sign-in through Better Auth → authenticated member workspace. Sign-out revokes the server session; expiry returns to sign-in after preserving a safe return path. Public sign-up, email verification/reset and MFA or step-up for sensitive purchasing changes must be completed before public rollout. No shared demo credentials or client-side bypass are allowed. PayPal purchasing consent is a separate connection flow.

Overview is the first signed-in screen. Show the member's active budget limits, confirmed spending, account funds, remaining spend, and assistant savings alongside an Instructions card, current setup needs, pending instruction/review actions, recent account activity and upcoming scheduled checks. Place the New instruction action inside the Instructions card. Budget allocations are limits, not account cash. Until a payment ledger and funding balance are connected, label spending, remaining funds and available account balance as unavailable; never infer them from a budget ceiling or a local fixture. Savings requires confirmed purchases and verified comparable reference prices, so label it unmeasured until those sources exist. Fixture activity and upcoming fixture checks must be identified as local only.

After sign-in: set explicit timezone/currency → create allocation/limits → connect supported vendor/funding authority → enable mobile notification transport where available. The user may draft or watch before a purchasing connection is active. Purchasing activation shows actionable configuration blocks rather than requesting raw financial credentials.

A connection flow uses provider-hosted consent or the selected supported session mechanism. If authentication expires, show ACTION_REQUIRED with a reconnect action. Display actual vendor/category capabilities. Never label a fixture or unsupported booking/bill category as connected for real purchases.

## 2. Create a lasting instruction

The Instructions workspace stays in one place. The left rail shows newest-first Recent entries followed by collapsible Personal, Household, Work, Travel and Other groups. Each life-area group has a plus action that starts a new instruction with that area already selected; the conversation does not ask the member to choose it again. Selecting a DRAFT opens it in the conversation on the right; preserve its wording and allow the member to revise the prompt, area and budget there. Saving a change is versioned and keeps the instruction a DRAFT. At compact widths, show the instruction rail above the conversation and keep the selected instruction visible at the top of its chat. Draft deletion removes it from the member's visible list while retaining the cancelled record and audit history. Active or paused instructions use revoke, not hard deletion. These life-area labels organize prompts and do not set procurement category or permission. The conversation starts with the need in the member's own words, then offers an organizational label when no area was preselected and an optional budget in a guided local flow. Preserve the exact prompt. This flow does not use AI to extract amounts, deadlines or other request details. Category, need type and purchase permission are not required to save the draft; an unclassified draft cannot activate. Do not require a separate Appai-authored form for every category. Link a budget, then inherit its currency, maximum and optional date limits. Supplier rankings by budget are deferred until a connected discovery/price comparison flow makes them useful. The user can narrow dates or lower the instruction maximum but cannot exceed the budget. After supplier selection, reuse the prompt and collect only fields that supplier requires. User confirms before activation:

- What: exact product/variant, vendor bill account/invoice or stay dates/occupancy/terms.
- When: now, future date, recurring bill schedule or watch until a deadline, with timezone.
- Where/from whom: allowed vendor/payee and delivery/account/guest references.
- Limit: use the selected budget's hard maximum and optional instruction-specific lower maximum. Do not add a minimum purchase amount. The maximum payable total and allocation are separate controls.
- Dates: inherit the budget's optional start/end limits; a prompt can narrow the period. To activate, resolve any required validity and completion rule in the selected IANA timezone. Never assume or silently overwrite dates from the prompt.
- Authority: PRE_APPROVED, REVIEW_REQUIRED or NOTIFY_ONLY; activation requires explicit validity and completion rules.

Save DRAFT → show prompt and inherited budget bounds → resolve category and supplier → collect any supplier-required fields → review the complete instruction. Search the member's private successful supplier history and budget preferences first, then category/area catalogue and configured sources. Show at most three strong candidates with source, freshness, price and match details. A chosen supplier's supported form/contact flow may reuse prompt details and ask only for missing fields. No unsupported or unverified form is submitted as a purchase. Supplier discovery is not connected in the current local build, so newly saved drafts remain blocked from activation.

The Planner opens to today's day agenda and offers a month view. It shows instruction validity starts, deadlines and scheduled run dates using the account timezone; selecting a month date opens its day agenda. Budget allocations are created and reviewed in the Planner and supply spending limits/date windows to linked instructions. Each budget appears on its actual creation day, based on server-owned `createdAt` in the account timezone, including in month indicators. Its optional start date and deadline govern when it can be used; they do not determine its Planner placement. Later spending remains associated with that budget without moving its creation entry. Budget allocations are not money held in Appai, available bank balance or a payment card. Until a real AI connection is implemented, the chat-style intake is a guided local interface and must not imply that a model has interpreted the prompt or searched suppliers.

Planner presentation: Day/Month controls sit above a single date heading. In Day view, a plus button beside the date opens the budget dialog; the selected date prefills the editable start date, and the member chooses the start time and optional deadline. The permanent budget form, global budget list and Planner-specific New instruction/empty-state instruction actions are removed. The day area lists only that day's instruction entries and budgets created that day, and stays blank when there are none. Saving while viewing another day confirms the actual creation date and offers View day. Failed saves retain form values and the idempotency key for retry.

PRE_APPROVED can proceed with a new or known supplier without a per-quote approval when every instruction, budget, service, date, price, supplier-capability and PayPal check passes. REVIEW_REQUIRED presents the authoritative quote for approval before payment. NOTIFY_ONLY reports matches and never pays. PayPal is the sole initial rail. The internal "wallet" is a non-custodial budget/reservation/ledger view; Appai does not hold money or issue a prepaid card. Users can close the phone interface; the worker retains an active instruction. One-time/watch defaults to one successful fulfillment. Changing mode or scope is an authenticated versioned edit, not a side effect of selecting an offer.

Member supplier history is private to its owner. The supplier catalogue is available within the signed-in workspace; there is no public supplier website or member-to-member sharing of supplier histories. Fixtures cannot appear as real suppliers or purchases.

## 3. Background discovery and watch status

A durable schedule/event triggers discovery, not another user prompt. `/instructions/{id}` shows last check, next check and blocked/stale source state. No match continues until stop/expiry. A material eligible offer creates a vendor-confirmed quote; duplicate observations do not repeatedly notify or purchase. Search results are candidates, not guaranteed reservations.

If source credentials expire or the agent/browser host is unavailable, show paused/action-required state with its reason. Reconnect resumes under current policy. Worker restart catches up without duplicate obligations.

## 4. Review-required offer

QUOTED → AWAITING_APPROVAL → persist inbox item → dispatch mobile alert linking to `/approvals/{id}`.

Show real vendor, item/service details, dates/quantity, final total and components, cancellation terms, quote expiry and current allocation impact. Controls: **Approve purchase** and **Reject offer**. Opening the notification/link never approves or pays. Authenticated POST decision consumes no payment itself; the worker rechecks current quote/permission/policy and dispatches through the purchase path.

Changed/expired quote → “Offer changed/expired” → obtain new quote and request fresh review when needed. No response expires the approval without spending; watch may continue within its original rules. Rejected candidate is not automatically reoffered unchanged. Notification arrival is not proof that a merchant held the offer.

## 5. Pre-approved scheduled purchase or bill

At due time, resolve the current obligation and unpaid status → authoritative quote → exact instruction/permission/budget checks → internal reservation → exclusive dispatch → RECONCILING → confirmed receipt or pending/action state.

No per-purchase review when prior authority covers every term and all caps pass. A soft threshold can still require review. A hard-cap violation shows **Blocked by spending limit**, with actions to change settings or cancel; no “approve exception” bypass. A provider-required interactive step is shown honestly, not substituted with fake automatic success.

The outcome notification links to `/operations/{id}`. The backend persists financial outcome, budget entries and receipt even if the user never opens it. A bill already paid by the vendor's normal renewal process is not paid again.

## 6. Phone notification and approval states

Notification settings show enabled, permission denied, disconnected or unavailable transport. Durable `/inbox` contains all important actions and outcomes. Failed/delayed push is retried independently of purchase. User can read status after signing in on another device. No promise that OS push is instantaneous or that a sent event means the user viewed it.

An old approval notification loads current state: pending, decided, expired, invalidated or action-required. Replayed/conflicting clicks return the existing outcome or conflict; they cannot create a second payment. Mobile action pages support keyboard/screen reader navigation, focus management, readable totals and non-color status explanations.

## 7. Pending purchase and recovery

When an external call times out or worker restarts around submission, show **Confirming purchase outcome** with latest verified information. Do not show “failed, buy again” while a charge/order may exist. Reconciliation queries supported vendor/provider status. If automatic recovery is unavailable, show a support action and keep financial exposure reserved; no user interface click releases unknown liability.

A confirmed payment without a confirmed vendor order remains pending/investigation under the integration contract. Receipt success requires the actual vendor entitlement/order and the required payment state.

## 8. Pause, revoke and cancel

`/instructions/{id}`: pause stops new scheduling/dispatch; resume revalidates policy and connection; revoke stops future authority and invalidates unused approvals. Show in-flight operations that still need reconciliation. A revocation after dispatch cannot guarantee recall.

`/operations/{id}`: before dispatch, cancel internally and release unused reservation. After possible submission, request vendor cancellation only if supported, show **Cancellation pending**, then confirmed or rejected. Non-cancellable terms are visible before permission/approval. A confirmed cancellation may still have **Refund pending**; only confirmed refunded amounts restore applicable allocation. No “instant cancel” success inferred from the phone action alone.

## 9. Receipt/history and settings

`/receipts`: persisted vendor order/payment reference, item/service, quote total, time, instruction mode, budget impact, cancellation/refund state. Show no usable payment tokens or browser credentials. Audit details are optional diagnostics and cannot be presented as proof that all external systems stored zero credentials.

`/settings`: allocations/hard limits, timezone/currency, connections, device notifications. Versioned policy changes re-evaluate pending purchases; they do not rewrite historical receipts or erase prior liabilities.

The Account private supplier list is member-managed. Allow the member to edit or remove a private supplier's name, service categories, service areas and notes. Changes are owner-scoped and version-checked; removing a supplier clears its non-authorizing discovery preference references. Keep budget-level supplier ranking controls out of the current UI until connected discovery and comparable supplier results make them useful.

## 10. Later extension

Pre-purchase “deal held” screens are not part of current execution. When added, they must display a real vendor reservation plus its expiry and payment authorization separately. Reuse inbox/approval/receipt components; do not imply a hold during the first-release AWAITING_APPROVAL state.
