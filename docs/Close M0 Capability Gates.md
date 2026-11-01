# Close M0 Capability Gates — Implementation & Evidence Plan

Status: **Ready for Review & User Sign-Off**  
Date: **2 November 2026**  
Scope: Milestone M0 Capability Gates (`AC-02`, `AC-12`, `AC-17`, `FR-05`, `FR-12`, `FR-15`, `FR-16`, `FR-18`)  
Authority: [Implementation Plan](A-P-P-A-I-agent-product-implementation-plan.md) (Milestone M0), [Technical Requirements](A-P-P-A-I-agent-technical-requirements-document.md) (§ 1, § 2, § 3), [PRD](A-P-P-A-I-agent-product-requirements-document.md) (§ 3, § 4), [M0 Capability Decision Record](M0-CAPABILITY-DECISION-RECORD.md), [Acceptance Matrix](DEVELOPMENT-ACCEPTANCE.md) (`AC-02`, `AC-12`, `AC-17`).

---

## 1. Problem Statement & Root Cause Analysis

Milestone M1 (durable instruction and job foundation, PostgreSQL authentication, schedule and timezone matrix, private supplier CRUD, and the 101-assertion acceptance suite) is complete and hardened. However, **Milestone M0 remains tracked as `OPEN external gate · local foundation selected`** in [`docs/M0-CAPABILITY-DECISION-RECORD.md`](M0-CAPABILITY-DECISION-RECORD.md) and [`docs/README.md`](README.md).

External financial execution and unattended live purchasing remain intentionally disabled (`EXECUTION_ENABLED=false`). Per [`docs/A-P-P-A-I-agent-product-implementation-plan.md`](A-P-P-A-I-agent-product-implementation-plan.md) lines 50–65 and [`docs/DEVELOPMENT-ACCEPTANCE.md`](DEVELOPMENT-ACCEPTANCE.md) (`AC-02`, `AC-12`, `AC-17`), the project cannot transition to M2/M3 live integration until seven external capability gates are formally proven and documented:

### The 7 Open M0 Capability Gates

1. **Gate M0-1 — First Real Vendor Slice, Market, Currency & Role Taxonomy (`AC-02`, `FR-05`, `FR-12`)**:
   - *Problem*: The codebase uses synthetic fixtures (`Office Supply Co.`, `WorkForm Ergonomics`, `East Africa Cloud`, `Kilimanjaro Solar`, `Arusha Grand Hotel`). No concrete first real vendor slice, target market, operating currency, merchant-of-record, or caller/buyer/payee separation has been pinned.
   - *Requirement*: Pin the specific category, vendor, country market, and ISO currency (e.g. US / USD digital services or office consumables), and define the non-custodial boundaries between Appai (the agent/caller), the member (the buyer/payer), and the merchant (the payee).

2. **Gate M0-2 — PayPal Payment Rail, Consent, Vaulting vs Approval, & Idempotent Capture (`AC-02`, `AC-08`, `AC-21`, `FR-05`, `FR-12`)**:
   - *Problem*: `packages/adapters/paypal-sandbox/src/index.ts` implements Orders v2 (`/v2/checkout/orders` with `intent: 'CAPTURE'`, OAuth client_credentials, and webhook verification). The sandbox smoke test previously verified order creation (`45Y59709AF822120F`) and status readback. However:
     - For `REVIEW_REQUIRED`, the member can visit a PayPal `approvalUrl` interactively.
     - For unattended `PRE_APPROVED` execution without per-purchase manual checkout, standard Orders v2 returns an unapproved order requiring manual buyer action. The system requires an explicit agreement architecture: **PayPal Payment Method Tokens / Vault v3** or **Billing Agreements v1** vs one-time web checkout.
   - *Requirement*: Formally document the exact PayPal API contracts, consent lifecycle, mapping of `purchase_operations.id` to `PayPal-Request-Id`, idempotency, and reconciliation.

3. **Gate M0-3 — WebMCP & Browser Host Runtime Architecture (`AC-12`, `FR-12`, `FR-15`, `FR-16`)**:
   - *Problem*: W3C and Google Chrome WebMCP specifications ([Chrome WebMCP](https://developer.chrome.com/docs/ai/webmcp), [WebML WebMCP Goals](https://github.com/webmachinelearning/webmcp#goals--non-goals)) clarify that WebMCP tools run in-page during attended client navigation. WebMCP does **not** provide a headless background scheduler, durable state, or persistent payment authority.
   - *Requirement*: Formally delineate **Mode A (Backend Adapter / Direct REST API)** vs **Mode B (Browser Host / WebMCP)** in `apps/browser-host`. Establish session survival, expiry, and the invariant that an expired session or missing credentials transitions the operation to `ACTION_REQUIRED` (`VENDOR_AUTH_REQUIRED`) and generates an inbox alert, never faking success or bypassing 2FA.

4. **Gate M0-4 — Discovery Provider (Serper Search) Quotas, Latency & Provenance Boundaries (`AC-05`, `AC-19`, `FR-01`, `FR-20`)**:
   - *Problem*: Serper search is wired into `apps/api/src/server.ts` (`/api/v1/discovery/search`) and tested in `scripts/test-search-live.mjs`. However, market coverage, rate quotas (queries/min), timeout handling, and provenance boundaries must be documented.
   - *Requirement*: Search results and web snippets are research provenance only; they are strictly prohibited from being treated as authoritative supplier quotes or purchasing authority (`AC-05`).

5. **Gate M0-5 — AI Assistant Provider (Gemini 3.8 Flash) Boundary, Privacy & Zero-Execution Invariant (`M1-I`, `AC-01`, `FR-02`, `FR-20`)**:
   - *Problem*: Gemini 3.8 Flash is implemented in `apps/api/src/server.ts` (`/api/v1/assistant/refine`) and tested in `scripts/test-assistant-refinement.mjs`. Data retention and privacy boundaries must be formally recorded.
   - *Requirement*: Document the strict data firewall: prompts are sent to Gemini only upon explicit member action ("Ask assistant"); secrets, passwords, cards, and session tokens are stripped/filtered; AI proposals are strictly advisory (`DRAFT`) and have zero purchasing or scheduling authority.

6. **Gate M0-6 — Mobile Push Transport Strategy (Web Push / VAPID) & Non-Blocking Decoupling (`AC-06`, `AC-13`, `FR-04`, `FR-13`)**:
   - *Problem*: The application records notifications in PostgreSQL (`notifications` table), but real mobile device delivery is currently unconfigured.
   - *Requirement*: Define the `PushTransportAdapter` interface (Web Push RFC 8291/8292 with VAPID keys) for mobile PWA notifications. Enforce the invariant that push notification delivery failure or delay never blocks, delays, or double-dispatches domain transactions (`AC-13`).

7. **Gate M0-7 — Execution Switches, Circuit Breakers & Fail-Closed Safety Bounds (`AC-02`, `AC-16`, `AC-17`)**:
   - *Problem*: Ensuring that all external execution remains impossible unless explicit capability gates, environment flags, and adapter checks pass.
   - *Requirement*: Enforce fail-closed defaults: `EXECUTION_ENABLED=false`, per-adapter capability flags (`adapter.capabilities.canExecute`), and a global circuit-breaker protocol that stops new dispatches while allowing status reconciliation of in-flight orders (`AC-16`).

---

## 2. Solution Architecture & Decision Framework

| Gate | Selected Architecture / Contract | Rationale & Invariant Preserved |
| :--- | :--- | :--- |
| **M0-1: Vendor & Role Model** | **Category**: Digital Services & Cloud Infrastructure (`BILL` & `PRODUCT`).<br>**Vendor**: Direct Cloud Provider / API Vendor.<br>**Market/Currency**: US / USD (minor unit scale 2).<br>**Role Model**: Appai = Non-custodial Caller/Agent; Member = Buyer & Payer; Vendor = Merchant-of-Record & Payee. | Prevents Appai from becoming a payment intermediary, custodian, or money transmitter. Keeps purchasing strictly bilateral between member and vendor. |
| **M0-2: PayPal Path & Consent** | **Split Execution Path**:<br>1. *Attended (`REVIEW_REQUIRED`)*: Orders v2 (`intent: 'CAPTURE'`) returns `approvalUrl`. Member signs in and authorizes the order on PayPal. Worker captures after approval webhook / polling.<br>2. *Unattended (`PRE_APPROVED`)*: PayPal Vault / Customer Payment Tokens (or Billing Agreements v1). Member establishes a one-time billing mandate scoped to Appai budget limits. Worker dispatches recurring payments using the saved vault token.<br>**Idempotency**: `PayPal-Request-Id = purchase_operations.id`. | Enables set-and-forget recurring bills without violating PayPal user agreement or requiring manual checkout for every monthly tick. Preserves strict double-charge prevention (`AC-08`). |
| **M0-3: WebMCP & Browser Host** | **Mode A (Primary)**: Direct REST/GraphQL API or Backend MCP.<br>**Mode B (Attended/Hybrid Browser Host)**: Dedicated Playwright/Chromium container running WebMCP client.<br>**Session Invariant**: If session cookies expire or MFA is triggered, worker emits `ACTION_REQUIRED` (`VENDOR_AUTH_REQUIRED`), pauses instruction, and alerts member. No credential scraping or 2FA bypass. | Conforms to official Chrome WebMCP architecture (page-tool client discovery) while maintaining backend worker autonomy. |
| **M0-4: Discovery (Serper)** | **Provider**: Serper (Google Search API).<br>**Quota**: Max 10 queries/min/member, 18s timeout, fallback to unconfigured.<br>**Provenance Rule**: Results are read-only `candidates` with URLs and snippets. Quoted prices require explicit vendor confirmation before becoming executable (`AC-05`). | Prevents hallucinations or stale web scrape snippets from triggering unintended financial debits. |
| **M0-5: AI Assistant (Gemini)** | **Provider**: Google Gemini (`gemini-3.8-flash` primary, fallback via `GOOGLE_MODELS`).<br>**Data Firewall**: Passwords, card numbers, session cookies, and bank tokens are strictly omitted from prompts.<br>**Zero Authority**: Assistant output is parsed into a `proposal` JSON schema and saved as `DRAFT`. Member must confirm before activation. | Satisfies Google Gemini API data terms and preserves member ownership over all commitments. |
| **M0-6: Mobile Push Transport** | **Protocol**: Web Push Protocol (RFC 8291 / RFC 8292) with VAPID.<br>**Persistence**: PostgreSQL `notifications` is the durable source of truth.<br>**Decoupling**: Worker enqueues outbox events; push transport runs asynchronously. Failure to deliver push never rolls back or retries an operation. | Satisfies `AC-13` (notification retry never duplicates a purchase). Works cross-platform on iOS/Android PWA without proprietary SDK lock-in. |
| **M0-7: Execution Safety** | **Tri-State Switch**:<br>1. `EXECUTION_ENABLED` (`false` by default).<br>2. `ADAPTER_MODE` (`fixture` vs `sandbox` vs `live`).<br>3. `CIRCUIT_BREAKER_ACTIVE` (`true` halts all new dispatches; status polling continues). | Guarantees fail-closed safety (`AC-02`, `AC-16`, `AC-17`). Unsupported categories return `ACTION_REQUIRED`, never simulated success. |

---

## 3. Step-by-Step Implementation & Evidence Plan

### Step 1: Update `docs/M0-CAPABILITY-DECISION-RECORD.md` with Audited Decisions
- Record the selected first vendor category (`BILL` / Digital Infrastructure), US / USD target market, and buyer/caller/payee roles.
- Record the PayPal Orders v2 + Vault v3 architecture for `REVIEW_REQUIRED` vs `PRE_APPROVED`.
- Record the WebMCP Mode A (API) vs Mode B (Playwright browser-host) boundary and session expiry contract.
- Record the Serper search and Gemini 3.8 Flash quota, firewall, and privacy specifications.
- Record the Web Push (VAPID) transport specification.

### Step 2: Implement Execution Safety & Circuit Breaker Invariants (`packages/domain` & `apps/worker`)
- In `packages/domain/src/permissions.ts`, add explicit adapter capability verification:
  - If `executionEnvironment !== 'FIXTURE'` and `process.env.EXECUTION_ENABLED !== 'true'`, evaluation returns `BLOCKED` with code `EXTERNAL_EXECUTION_DISABLED`.
  - If adapter capability `canExecute === false`, evaluation returns `BLOCKED` with code `ADAPTER_UNSUPPORTED`.
- In `apps/worker/src/worker.ts`, add a circuit-breaker guard in `processOccurrence` and `processObservation`:
  - If `CIRCUIT_BREAKER_ACTIVE === 'true'`, block dispatch with `CIRCUIT_BREAKER_HALTED` while continuing reconciliation jobs (`getStatus`).

### Step 3: Formalize PayPal Sandbox Contract & Vault Architecture (`packages/adapters/paypal-sandbox`)
- In `packages/adapters/paypal-sandbox/src/index.ts`:
  - Add typed method interfaces for `createVaultSetupToken()` and `createPaymentToken()` (PayPal Payment Method Tokens v3) alongside existing Orders v2 methods.
  - Implement explicit error mapping for `INSTRUMENT_DECLINED`, `PAYER_ACTION_REQUIRED`, `ORDER_ALREADY_CAPTURED`, and `INVALID_RESOURCE_ID`.
- In `packages/adapters/paypal-sandbox/test/paypal.test.js`:
  - Add contract tests asserting idempotency key propagation (`PayPal-Request-Id`), currency scale verification, and webhook signature verification payload structures.

### Step 4: Define Browser Host Specification & Stub Interface (`apps/browser-host`)
- Create `apps/browser-host/README.md` and TypeScript contract definitions (`packages/adapters/browser-host-contract/`):
  - Delineate the WebMCP lifecycle: session initialization, tool discovery, execution timeout (30s), session heartbeat, and graceful teardown.
  - Enforce the session-invalidation contract (`VENDOR_AUTH_REQUIRED` → `ACTION_REQUIRED`) to satisfy `AC-12`.

### Step 5: Web Push Transport Contract (`packages/adapters/notification-push`)
- Create the push transport interface contract:
  - `sendPushNotification(subscription: WebPushSubscription, payload: NotificationPayload): Promise<PushResult>`
  - Document VAPID key generation (`npx web-push generate-vapid-keys`) and environment variable configuration (`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`).
  - Verify that push failure logs a warning and marks `notifications.delivery_status = 'FAILED'` without affecting `purchase_operations`.

### Step 6: Verify and Audit Full Matrix
- Run the full acceptance and contract verification suite:
  - `npm run test:domain`
  - `npm run test:paypal`
  - `npm run test:acceptance`
  - `npm run test:ac03`
  - `npm run test:m1:workflow`
  - `npm run test:auth`
  - `npm run build`
- Ensure 0 errors and all assertions pass.

---

## 4. Verification & Exit Checklist

When this plan is approved and executed, Milestone M0 will exit cleanly with the following verifiable evidence:

| Checkpoint | Target Contract | Verification Command / Evidence |
| :--- | :--- | :--- |
| **AC-02 Evidence** | Vendor, role model, and PayPal sandbox contracts recorded with official endpoints and idempotency | `npm run test:paypal` + sandbox order readback in `scripts/test-paypal-sandbox.mjs` |
| **AC-12 Evidence** | WebMCP browser-host session expiry triggers `ACTION_REQUIRED`; phone UI closure leaves worker unharmed | Architectural specification in `apps/browser-host/` + worker background autonomy in `test:ac03` |
| **AC-17 Evidence** | Unsupported categories fail closed; unimplemented hold/deposit workflows show blocked | Domain permission decision table (`packages/domain/test/domain.test.js`) + Suite C01–C19 |
| **Circuit Breakers** | `EXECUTION_ENABLED=false` and circuit breaker halt external calls without data loss | Worker state checks and PostgreSQL audit logs |
| **Documentation Alignment** | `M0-CAPABILITY-DECISION-RECORD.md`, `README.md`, and `WORK-STATUS.md` reflect closed M0 gates | Relative links valid, status headers updated to reflect M0 decision closure |

---

## 5. Mandatory Collaboration Lifecycle Gate

Per [`AGENTS.md`](../AGENTS.md):
> **Mandatory Collaboration Lifecycle**: Always follow **Problem → Solution → Plan → Signed → Implementation**.
> Halt and wait for user sign-off ("signed" / "proceed") before applying modifications.

**Action Required**: Please review this plan. Respond with **"signed"** or **"proceed"** to authorize executing the M0 capability gate closure.
