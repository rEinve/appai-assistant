# A-P-P-A-I UI implementation brief

Version: **1.1 · 29 October 2026**. Replaces the v1.0 generation prompt for development. The original illustrative HTML/React snippets are archived; they are not current application logic.

## Use with the implementation contract

Read [README](README.md), [PRD](A-P-P-A-I-agent-product-requirements-document.md), [technical requirements](A-P-P-A-I-agent-technical-requirements-document.md), [current user flows](A-P-P-A-I-agent-user-flow-chat.md) and [acceptance matrix](DEVELOPMENT-ACCEPTANCE.md) before generating application UI. Use [design tokens](A-P-P-A-I-agent-design.md) for appearance. Behavior/state/security rules take precedence over visual examples.

Build the personal procurement assistant first, not only its marketing landing page. UI consumes the authenticated API; it does not request raw payment credentials, mint tokens, approve budgets or execute vendor payments directly. A working phone interface does not replace the durable background worker.

## Required application views

| View | Required behavior |
| --- | --- |
| Onboarding/settings | Explicit currency/timezone and budget allocation; supported vendor/provider consent; notification permission and connection health |
| Instruction list/detail | ACTIVE/PAUSED/etc., authority mode, next run, last check, current operation, stop rule, pause/resume/revoke |
| Instruction conversation | Persistent dialogue with one composer, provider research and source links, price discussion, natural clarification and member-confirmed agreement; no extracted-field intake form |
| Planner | Read-only day/month agreement tasks with relevant provider, quantity, timing, cost and status; Edit instruction returns to the original conversation; no budget dialog or New instruction |
| Payment | Payable total, remaining budget capacity and Pay/Activate agreed schedule; essential terms inspectable; verified funds distinct from limits; navigation never pays |
| Offer review | Vendor-confirmed total/terms/expiry and exact need; approve/reject only for REVIEW_REQUIRED or soft threshold |
| Pre-approved operation | Progress/outcome without asking again when valid prior authority applies; actual provider-required action shown as such |
| Inbox/mobile action | Durable notification history, authenticated deep link, expired/decided/conflicting action states; opening a link never pays |
| Operation/receipt | Pending reconciliation, confirmed vendor outcome, total, cancellation/refund status and recorded budget impact |
| Unsupported/action-required | Missing vendor capability, reauthentication, stale offer, policy block, no match, expired instruction or execution paused |

Do not offer an “Approve hard cap exception” button. Limit increases happen through authenticated versioned settings and fresh policy evaluation. Do not show “Deal locked” in the first-release review state. Do not show unknown outcomes as failed purchases with an immediate buy-again button. Cancellation is pending until vendor confirmation; refund is separate.

## Interaction contract

- PRE_APPROVED, REVIEW_REQUIRED and NOTIFY_ONLY are explicit user choices; budget availability does not select a mode.
- UI should remain useful after reload/phone closure by fetching persisted instruction/operation state.
- Display human decision facts first: need, vendor, dates/quantity, payable total, cancellation terms, expiry and permission consequences. Protocol/session diagnostics are optional and sanitized.
- Distinguish fixture, provider sandbox and live operation visibly in development/test environments. Unsupported categories are unavailable for real execution.
- Buttons use API idempotency, disable while a mutation is pending and handle version conflicts. Client button locking alone is not financial deduplication.
- Dialogs/sheets need accessible names, keyboard support, focus containment/return, status announcements and non-color errors. Verify contrast and reflow rather than assuming token compliance.
- Adapt phone/tablet/desktop continuously, including 1024–1279 px. Keep approval facts/actions available with the virtual keyboard and at zoom.

## Presentation constraints

Retain existing cream canvas, ink, spacing and component tokens; no new palette is selected by this brief. Use actual configured currency formatting. Never display a usable token, secret, account credential or browser session. The existing technical monospace style can appear in optional diagnostics, not as the main purchasing explanation.

Marketing copy and competitive statistics are outside the critical application handoff. Do not invent live integrations or metrics from fixture data. After application behavior is implemented, a landing page can describe the supported scope using the same product model.

## Delivery and QA

Implement against the selected stack from M0. Validate the current flow and relevant AC IDs before claiming a working journey. A static page, fake PayPal status badge or local mocked transaction is not evidence of external integration. Return implemented behavior, test evidence and remaining capability blocks.

The pre-purchase hold/capture workflow is a later extension. Keep reusable quote, approval and receipt components; do not activate reservation/deposit/bid actions in MVP.

## Owner correction — 1 November 2026

FR-20 and AC-19–21 govern the member journey. Remove the existing saved-ticket New Instruction action, repeated prompt/metadata tiles and internal fixture-readiness checklist from the conversation. Show useful assistant replies and next actions instead. Keep technical diagnostics in a separate developer surface. Home is a concise task/status entry point; start a genuinely new conversation only from Instructions. Budget decisions are conversational, not a Planner form. Do not label a rail PayPal Verified without capability evidence. No guessed timing or model-estimated price may appear as an agreed fact.
