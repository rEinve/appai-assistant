# A-P-P-A-I current user flows

Baseline: **v1.1 · 29 October 2026**. This Markdown document replaces `A-P-P-A-I-agent-user-flow-chat.pdf` v1.0 as the development flow contract. The PDF remains historical and unchanged. States and permissions follow the [technical requirements](A-P-P-A-I-agent-technical-requirements-document.md).

## 1. Onboarding and configuration

Unauthenticated visitor → invitation-only local account enrollment or email/password sign-in through Better Auth → authenticated member workspace. Sign-out revokes the server session; expiry returns to sign-in after preserving a safe return path. Public sign-up, email verification/reset and MFA or step-up for sensitive purchasing changes must be completed before public rollout. No shared demo credentials or client-side bypass are allowed. PayPal purchasing consent is a separate connection flow.

Home provides a concise task/status summary and access to Instructions, Planner and payment actions. Starting a new instruction is an intentional action in the Instructions workspace, not an action inside an existing instruction or plan. Do not make Home a configuration dashboard or show internal readiness checklists as the member's next task. Missing connections are explained when relevant to the requested action.

Members can begin research and save a conversation before budget or payment setup. Reuse known timezone/currency; clarify consequential ambiguity conversationally.
A connection flow uses provider-hosted consent or the selected supported session mechanism. If authentication expires, show ACTION_REQUIRED with a reconnect action. Display actual vendor/category capabilities. Never label a fixture or unsupported booking/bill category as connected for real purchases.

## 2. Instruction conversation → Planner → payment

1. **Instruction:** member describes the need in ordinary language. Save the exact message and subsequent dialogue in one owner-scoped conversation. Existing instructions reopen that conversation with one composer. Do not display New instruction inside it, a second original-prompt field, extracted-field editor, duplicated draft controls or a fixture blocker checklist.
2. **Research and dialogue:** assistant uses known context and supported read-only sources, brings a short list of suitable providers with verifiable links, source dates and labelled prices, and explains fit. Member can reject a price/provider and request another search in the same conversation. Estimates are not quotes; a search result does not prove PayPal acceptance. Clarify only missing consequential details, without a fixed reply-count cutoff or repeated questionnaire. Unsupported discovery is explained honestly.
3. **Agreement:** assistant summarizes the chosen provider/payee, quantity, service details, dates/timezone, price basis, total/currency, budget ceiling and payment permission in natural language. Member agreement creates a versioned plan. Unresolved facts remain explicit; no guessed deadline, budget or payee becomes authority. Saving and continuing research remain available before agreement.
4. **Planner:** show the agreed task as a clear day/month agenda entry, with provider, quantity, timing, cost and status as relevant. Provisional tasks are labelled. No budget form, New instruction action or editable agreement fields. **Edit instruction** reopens the same conversation. **Payment** opens the payment view without spending. Open-ended research remains undated rather than acquiring its creation date as a false execution date.
5. **Payment:** show final payable total, remaining budget capacity and payment action. Show verified available funds only when supported; otherwise say unavailable. Essential payee/terms/expiry remain inspectable. Configure missing budget through the instruction conversation; use provider-hosted consent when necessary. **Pay** confirms a current quote-bound purchase; **Activate agreed schedule** grants only the explicitly discussed future scope. Opening links never pays. NOTIFY_ONLY cannot pay without an explicit authority change.
6. **Outcome:** show pending, action required or confirmed receipt based on evidence. Prevent duplicate payment on retries. Changes return to the instruction conversation and invalidate stale plan/quote approvals before dispatch; dispatched operations retain their historical agreement and reconciliation.

PRE_APPROVED requires no repeated per-quote confirmation within the activated scope. REVIEW_REQUIRED requires the current authoritative quote decision. PayPal remains the sole initial rail, with real execution disabled until capability gates pass. Planner is a projection, not a second source of instruction or financial authority. Private supplier history remains owner-scoped; fixtures never establish real supplier/payment capability.

## 3. Background discovery and watch status

A durable schedule/event triggers discovery, not another user prompt. `/instructions/{id}` shows last check, next check and blocked/stale source state. No match continues until stop/expiry. A material eligible offer creates a vendor-confirmed quote; duplicate observations do not repeatedly notify or purchase. Search results are candidates, not guaranteed reservations.

If source credentials expire or the agent/browser host is unavailable, show paused/action-required state with its reason. Reconnect resumes under current policy. Worker restart catches up without duplicate obligations.

## 4. Review-required offer

QUOTED → AWAITING_APPROVAL → persist inbox item → dispatch mobile alert linking to `/approvals/{id}`.

Show real vendor, item/service details, dates/quantity, final total and components, cancellation terms, quote expiry and current allocation impact. Controls: **Approve purchase** and **Reject offer**. Opening the notification/link never approves or pays. Authenticated POST decision consumes no payment itself; the worker rechecks current quote/permission/policy and dispatches through the purchase path.

Changed/expired quote → “Offer changed/expired” → obtain new quote and request fresh review when needed. No response expires the approval without spending; watch may continue within its original rules. Rejected candidate is not automatically reoffered unchanged. Notification arrival is not proof that a merchant held the offer.

## 5. Pre-approved scheduled purchase or bill

At due time, resolve the current obligation and unpaid status → authoritative quote → exact instruction/permission/budget checks → internal reservation → exclusive dispatch → RECONCILING → confirmed receipt or pending/action state.

No per-purchase review when prior authority covers every term and all caps pass. A soft threshold can still require review. A hard-cap violation shows **Blocked by spending limit**, with actions to return to the instruction conversation to discuss a limit change or cancel; no “approve exception” bypass. A provider-required interactive step is shown honestly, not substituted with fake automatic success.

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
