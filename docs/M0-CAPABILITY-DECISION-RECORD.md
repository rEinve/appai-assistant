# M0 Capability Decision Record

Status: **OPEN external gate · local foundation selected**  
Date: 29 October 2026  
Authority: `A-P-P-A-I-agent-product-implementation-plan.md` M0

## Owner-confirmed product directions (30 October 2026)

- PayPal is the only initial payment rail. Cash, Bitcoin, direct-card payment and other rails are not part of the first payment path; alternatives may be investigated later.
- The Appai "wallet" means non-custodial budget pockets, authorization checks, reservations and a spend ledger. Appai does not hold member funds or issue a prepaid card.
- The member flow is prompt-first. Budgets provide a hard maximum, optional validity dates and preferred suppliers; linked instructions inherit and can narrow those limits.
- Supplier discovery is category/area based and member-workspace only. Each member's purchase history remains private; no member-to-member list sharing or public supplier website is planned.

These are product decisions, not capability evidence. PayPal consent, supported vendor checkout/status operations, supplier discovery and the runtime still require M0 validation before external execution.

## Local implementation choices

| Area | Decision | Evidence/status |
| --- | --- | --- |
| Web client | Angular 18 standalone components | Build passes locally; website is fixture-only presentation |
| Runtime | Node 24.16.0 for local tooling | Observed with `node --version`; production support still to be recorded |
| API boundary | TypeScript modular API, separate from Angular UI | Authenticated, owner-scoped local member API and fixture workflow are present; production deployment and operation remain unproven |
| Member identity | Better Auth 1.7.14 email/password with PostgreSQL-backed users and sessions; invite-only enrollment | Implemented for local M1-A; acceptance evidence is in `M1-EVIDENCE.md`. Email recovery, public enrollment, and production operations remain open |
| Durable authority | PostgreSQL with SQL migrations and database constraints | Native local `appai_dev` database and migrations 001–011 are reported in [work status](WORK-STATUS.md); production database/TLS remain unproven |
| Domain tests | TypeScript compile plus Node `node:test` | Domain, auth and fixture workflow subsets passed locally; full AC-03 and M1-H journeys, financial concurrency and external recovery remain pending |
| Execution switch | `EXECUTION_ENABLED=false` by default | Required invariant; no external execution path exists |
| Local fixture | Accommodation watch, Arusha example, TZS, `REVIEW_REQUIRED` and `PRE_APPROVED` cases | Deterministic fixture only; not a real booking or vendor |
| Notification | Durable inbox first; real push transport remains open | No phone delivery is claimed |
| PayPal demo | Orders v2 create, capture, status and webhook verification | Fixture mode works locally; sandbox adapter and local contract tests are present. `npm run test:paypal:sandbox` is the next redacted Developer Dashboard smoke gate and requires sandbox credentials; it creates/status-checks a synthetic order without capture. |
| Read-only web search | Serper selected for explicit member searches | After the local key was corrected, `npm run test:search:live` passed through the authenticated API and returned three source links for a synthetic query. Market coverage, rendered acceptance and supplier verification remain open. Search snippets are not supplier/payment evidence. |

## External decisions still required

1. First real vendor and category, target market, currency, merchant-of-record and buyer/caller/payee roles.
2. Supported PayPal/vendor path with official operations for consent, quote, execute, status lookup, idempotency and cancellation/refund, including what budget limits can be enforced and reconciled.
3. Provider account and sandbox evidence, supplied through a secret manager or environment file; never commit or paste credentials.
4. WebMCP host, browser/agent versions, allowed origins/tools, background-session behavior and reauthentication flow. Backend API/MCP support must be recorded separately.
5. Discovery source, permitted origins/rates, initial notification transport, hosting target and data-retention jurisdiction.

Until those decisions have evidence, the adapter is `UNSUPPORTED` or `ACTION_REQUIRED`, sandbox/live execution stays disabled, and fixtures must be labeled in the UI.

## M0 exit evidence

Record redacted provider documentation and sandbox results for AC-02, AC-12 and AC-17. A fixture pass does not establish provider support. If external access is unavailable, keep this gate open and continue M1 domain, schema and fixture work.
