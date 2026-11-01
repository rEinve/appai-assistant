# A-P-P-A-I development documentation

**Current interaction amendment · 2 November 2026:** Instruction conversation → agreed read-only Planner projection → payment. The PRD's FR-20, [current flows](A-P-P-A-I-agent-user-flow-chat.md), implementation plan priority correction and AC-19–21 supersede earlier manual intake, editable suggestion and Planner budget-form directions. Implemented and verified via Migration 012 (`012_instruction_dialogue_and_agreements.sql`) and 101 automated acceptance assertions across Suites C01–C19.


Baseline: **v1.1, 2 November 2026**. The React 19 + Vite web application, PostgreSQL authority, and durable worker foundation are implemented and verified. Gate 1 (M1 Closeout) is complete: full AC-03 schedule matrix (local midnight across EDT/EST, DST transitions, schedule edits with permission version increment, and multi-month downtime missed-tick recovery), compact viewport navigation, private supplier CRUD, and zero npm audit vulnerabilities are verified across 101 acceptance assertions. Real provider checkout, WebMCP capability gates, and live production deployment remain disabled pending M0/M2 provider gates.

## Start here

1. [PRD](A-P-P-A-I-agent-product-requirements-document.md): product scope, permission rules and requirement IDs.
2. [Technical requirements](A-P-P-A-I-agent-technical-requirements-document.md): architecture, execution contracts and shared states.
3. [Schema specification](A-P-P-A-I-agent-schema.md): persistence, constraints and transaction boundaries; implementation agent writes executable migrations.
4. [Implementation plan](A-P-P-A-I-agent-product-implementation-plan.md): ordered work packages, entry/exit gates and first coding handoff.
5. [User flows](A-P-P-A-I-agent-user-flow-chat.md): current screen/action specification, replacing the v1.0 PDF for development.
6. [Acceptance matrix](DEVELOPMENT-ACCEPTANCE.md): requirement-linked scenarios and evidence required to finish each milestone.
7. [Design system](A-P-P-A-I-agent-design.md) and [UI generation brief](A-P-P-A-I-agent-website-meta-prompt.md): presentation guidance subordinate to the behavior contracts above.
8. [M0 capability decision record](M0-CAPABILITY-DECISION-RECORD.md): local toolchain choices and still-open provider/runtime evidence.
9. [M1 evidence report](M1-EVIDENCE.md): current local build, domain-test and migration evidence with remaining gaps.
10. [Work status log](WORK-STATUS.md): concise implementation, proof and dependency status across the product.
11. [Member prompt and supplier discovery design](MEMBER-PROMPT-AND-SUPPLIER-DISCOVERY-DESIGN.md): owner-confirmed direction for prompt-first instructions, budget inheritance, member privacy, supplier discovery, permission modes and PayPal-only initial payment.
12. [PRD drift and clarification tracking](PRD-DRIFT-AND-CLARIFICATION-TRACKING.md): active audit log tracking behavioral alignment, defect drift (dual inputs, 6-reply cutoff), additions (synthesized directives, PayPal badges), and clarifications.

The PRD owns behavior, the technical document owns execution/state/API contracts, and the schema implements them. When they conflict, fix the owning specification and affected consumers together; a coding agent must not resolve a payment-authority conflict by guessing. A missing vendor capability returns unsupported/blocked rather than silently introducing browser checkout or another payment provider.

Member sign-in is a first-release requirement. M1-A implements invite-only Better Auth email/password sessions on PostgreSQL and an authenticated owner-scoped profile endpoint. The React 19 member workspace presents instructions by life area, guides new requests through an AI concierge prompt and budget allocation linking, and provides a pure read-only timetable Planner derived dynamically from instructions and confirmed offers without plan editor or budget dialog (FR-20, AC-20). Multi-turn conversational refinement persists in PostgreSQL via Migration 012 with versioned agreements and explicit blocker evaluation. Synthetic authenticated extraction and draft persistence passed against Gemini and local PostgreSQL. Members can explicitly request read-only web search; an authenticated synthetic Serper query returned source links, which are not verified supplier candidates or quotes. Live balances, payment-derived subscriptions and confirmed receipt history require financial integrations that are not connected. Journey acceptance, email recovery/verification, sensitive-action step-up and production operations remain open; see the [root README](../README.md), [work status](WORK-STATUS.md), and [M1 evidence](M1-EVIDENCE.md).

## Delivery scope

- First release: lasting procurement instructions, scheduled purchases/bills, offer watches, prior scoped permission or review-before-purchase, mobile notifications, supported vendor checkout and recovery.
- Later extension: pre-purchase reservations and authorization/capture separation. Preserve adapter boundaries now; do not implement this feature as an MVP prerequisite.
- PayPal is the intended payment integration. Its feasibility is an explicit owner-accepted decision gate.
- WebMCP is a vendor interaction path, with an explicitly validated agent/browser runtime. It is distinct from backend MCP and is not the scheduler.
- Budget allocation is required. Custodial wallet/escrow is not a selected MVP funding architecture.

## Working assumptions for implementation

These are reversible engineering defaults introduced in v1.1, not historical owner decisions: a modular application with API and background worker, PostgreSQL as the durable authority, TypeScript as the initial application language, responsive web UI with mobile push/PWA capability validation, and a replaceable browser-host adapter for WebMCP. Record package/runtime versions and deployment choices in M0 rather than importing the old microservice skeleton as a requirement. No Kafka/Redis cluster is needed to start.

Initial vendor, market, payment currency, search source, production notification transport and hosting are not supplied. Their concrete selection/evidence is an M0 deliverable. Local fixtures use explicit test configuration; they are not proof of support for a real vendor. Default external execution is off. The React 19 member website (`dist/appai-website`), authenticated API, PostgreSQL migrations (001–012) and durable worker run locally. Acceptance evidence covers 101 assertions across Suites C01–C19 and the full AC-03 schedule matrix; M0 provider capability, real vendor checkout, and production operation remain open.

## Historical and later material

- [Scope clarification](PROCUREMENT-SCOPE-AND-PHASES.md): owner intent and rationale; reconciled into v1.1.
- [Pre-purchase proposal](PRE%20PURCHASE%20ENGINE.md) and [its structural review](PRE-PURCHASE-ENGINE-STRUCTURAL-REVIEW.md): later extension only.
- [Earlier broad review](A-P-P-A-I-document-review-and-remediation.md): historical analysis, not an additional release checklist.
- [Original v1.0 Markdown specifications](archive/v1.0/README.md): preserved before amendment; do not implement these in preference to v1.1.
- `A-P-P-A-I-agent-user-flow-chat.pdf` is the unchanged v1.0 flow; use the current Markdown flow above.
- MVP notes, Trends Summary and User Painpoints Summary are discovery context. They do not override the implementation contracts or establish supported integrations.

## Change summary

v1.1 separates instruction from purchase operation, adds durable scheduling/watch jobs and explicit permission modes, defines authoritative quotes and category details, adds atomic budget reservations and reconciliation, scopes WebMCP execution, permits bounded read-only search/scraping, aligns API/state/schema/UX, and defers hold/capture capabilities. The first handoff is M0/M1 in the implementation plan.
