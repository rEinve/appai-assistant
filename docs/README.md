# A-P-P-A-I development documentation

Baseline: **v1.1, 31 October 2026**. The local member application and PostgreSQL fixture foundation are implemented; the fixture workflow plus targeted prompt/budget and private supplier ownership/ranking checks have database-backed acceptance. Gemini synthetic extraction and confirmed draft persistence passed. Read-only Serper web search passed an authenticated synthetic provider check. Rendered compact-flow acceptance, full AC-03 schedule coverage, verified supplier discovery, M0 capability and production operation remain open. No provider purchase or live deployment is claimed complete.

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

The PRD owns behavior, the technical document owns execution/state/API contracts, and the schema implements them. When they conflict, fix the owning specification and affected consumers together; a coding agent must not resolve a payment-authority conflict by guessing. A missing vendor capability returns unsupported/blocked rather than silently introducing browser checkout or another payment provider.

Member sign-in is a first-release requirement. M1-A implements invite-only Better Auth email/password sessions on PostgreSQL and an authenticated owner-scoped profile endpoint. The member workspace presents instructions by life area, guides new requests through a chat-style prompt and optional budget selection, and provides a day/month Planner with budget allocation management. Instructions now have an optional, explicitly invoked Gemini proposal step for editable amount/date suggestions and clarifying questions; the server key is optional, and manual setup remains available. Synthetic authenticated extraction and draft persistence passed against Gemini and local PostgreSQL; rendered and broader provider acceptance remain open. Members can explicitly request read-only web search; an authenticated synthetic Serper query returned source links, which are not verified supplier candidates or quotes. Live balances, payment-derived subscriptions and confirmed receipt history require financial integrations that are not connected. Journey acceptance, email recovery/verification, sensitive-action step-up and production operations remain open; see the [root README](../README.md), [work status](WORK-STATUS.md), and [M1 evidence](M1-EVIDENCE.md).

## Delivery scope

- First release: lasting procurement instructions, scheduled purchases/bills, offer watches, prior scoped permission or review-before-purchase, mobile notifications, supported vendor checkout and recovery.
- Later extension: pre-purchase reservations and authorization/capture separation. Preserve adapter boundaries now; do not implement this feature as an MVP prerequisite.
- PayPal is the intended payment integration. Its feasibility is an explicit owner-accepted decision gate.
- WebMCP is a vendor interaction path, with an explicitly validated agent/browser runtime. It is distinct from backend MCP and is not the scheduler.
- Budget allocation is required. Custodial wallet/escrow is not a selected MVP funding architecture.

## Working assumptions for implementation

These are reversible engineering defaults introduced in v1.1, not historical owner decisions: a modular application with API and background worker, PostgreSQL as the durable authority, TypeScript as the initial application language, responsive web UI with mobile push/PWA capability validation, and a replaceable browser-host adapter for WebMCP. Record package/runtime versions and deployment choices in M0 rather than importing the old microservice skeleton as a requirement. No Kafka/Redis cluster is needed to start.

Initial vendor, market, payment currency, search source, production notification transport and hosting are not supplied. Their concrete selection/evidence is an M0 deliverable. Local fixtures use explicit test configuration; they are not proof of support for a real vendor. Default external execution is off. The Angular member site, authenticated API, PostgreSQL migrations and durable worker run locally. Acceptance evidence covers selected fixture/auth workflows, not the newer prompt-first or supplier-preference flows; M0 capability and production operation remain open.

## Historical and later material

- [Scope clarification](PROCUREMENT-SCOPE-AND-PHASES.md): owner intent and rationale; reconciled into v1.1.
- [Pre-purchase proposal](PRE%20PURCHASE%20ENGINE.md) and [its structural review](PRE-PURCHASE-ENGINE-STRUCTURAL-REVIEW.md): later extension only.
- [Earlier broad review](A-P-P-A-I-document-review-and-remediation.md): historical analysis, not an additional release checklist.
- [Original v1.0 Markdown specifications](archive/v1.0/README.md): preserved before amendment; do not implement these in preference to v1.1.
- `A-P-P-A-I-agent-user-flow-chat.pdf` is the unchanged v1.0 flow; use the current Markdown flow above.
- MVP notes, Trends Summary and User Painpoints Summary are discovery context. They do not override the implementation contracts or establish supported integrations.

## Change summary

v1.1 separates instruction from purchase operation, adds durable scheduling/watch jobs and explicit permission modes, defines authoritative quotes and category details, adds atomic budget reservations and reconciliation, scopes WebMCP execution, permits bounded read-only search/scraping, aligns API/state/schema/UX, and defers hold/capture capabilities. The first handoff is M0/M1 in the implementation plan.
