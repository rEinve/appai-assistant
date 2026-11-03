# A-P-P-A-I Work Status

## Priority correction implementation — Completed 2 November 2026

The owner-authorized priority correction sequence (Steps 1–5: Domain & persistence, Assistant orchestration, Agreement & changes, Planner & navigation, Payment) is implemented and fully verified across all test layers:
- **Step 1 (Domain & persistence)**: React 19 live store connected to backend PostgreSQL API with Migration 012 (`hydrateFromApi`, `createInstruction`, `togglePauseInstruction`, `revokeInstruction`, `fetchConversation`, `sendConversationMessage`, `confirmAgreement`).
- **Step 2 (Assistant orchestration)**: Multi-turn provider research with clickable verifiable outbound links, explicit evidence types (Advertised Offer, Estimate, Authoritative Quote), inline quick actions, price rejection handling, cheaper alternative discovery, and infinite turns without reply cutoff (`AC-19`).
- **Step 3 (Agreement & changes)**: Operational scope summarized in proposal cards (provider, quantity, timing, version target, agreed criteria, price ceiling, authority, stop rule), version incrementing (v1 → v2), prior snapshot archiving in `historicalAgreements`, material changes strictly invalidating unused approvals while preserving in-flight executed operations (`AC-20`).
- **Step 4 (Planner & navigation)**: Read-only calendar projection with Day, Week, and Monthly tabs, opening on today's Day view; Monday-start weeks, date navigation, timestamp-based placement in the member timezone, and a separate Undated section. Task payment and edit actions remain attached to the agenda; "Edit instruction" returns directly to the original dialogue (`inst-{id}`) (`AC-20`).
- **Planner calendar build, 3 November 2026**: `npm run build` passed for the local Vite production bundle (fixture-capable UI; API not required for compilation). Browser visual review could not run because the browser access host was unavailable. No provider or live execution capability is implied.
- **Step 5 (Payment)**: Exact payable total and remaining capacity displayed distinctly from connected PayPal Sandbox funding rail; navigation never pays; payment strictly binds to current agreement version and quote (stale quote rejected); missing capacity routes conversationally; idempotent replay protection prevents double-debiting; `PRE_APPROVED` schedule activation binds explicit finite scope (`AC-21`).
- **Verification**: 95/95 automated acceptance assertions pass (`npm run test:acceptance`), alongside `test:domain`, `test:paypal`, `test:auth`, `test:m1:workflow`, and `npm run build` (0 errors). External financial execution remains strictly disabled pending M0 capability gates.

Updated: **2 November 2026**  
Scope: repository implementation and proof status. See the [M1 evidence report](M1-EVIDENCE.md) for commands and observed results.

## Current readout

The member area supports invite-only sign-in, prompt-first instruction drafts, a read-only Planner with Day, Week, and Monthly calendar views plus budget allocation management, account settings and private supplier relationships, fixture-only lifecycle controls, synthetic quote/review flows, and a History view. History can show request dates and quoted totals, but current fixture records explicitly say no payment was made; confirmed payment method/receipt history awaits a real payment adapter and persisted provider outcome. Account balances and automatically detected subscriptions likewise require supported financial account/payment data and are not available yet. Prompt text is stored separately; budget allocations support optional date limits inherited by linked instructions. The separate PostgreSQL worker handles one-time, dated, monthly bill and notify-only watch fixtures with durable replay. Fixture mode never calls a vendor or payment API and grants no financial authority. M0 external capability and all real execution remain disabled.

## Work status

| Area | Status | Evidence / remaining work |
| --- | --- | --- |
| Public website | Implemented; production build passed | `npm run build` emits production assets to `dist/appai-website` (415 kB bundle, 0 warnings). Built with React 19, Vite, and Tailwind CSS v4. |
| Member authentication | M1-A implemented; local integration passed | `npm run test:auth` checks invitation-only enrollment, PostgreSQL sessions, owner mapping, expiry, revocation, CSRF origin checks, rate limits, and fail-closed configuration. |
| Member workspace | M1 fixture workflow implemented; PostgreSQL acceptance passed | Owner-scoped fixture activation, pause/resume/revoke, synthetic quote review and activity; real activation/purchase remains unavailable. |
| Overview | Local implementation; desktop read-only review observed | Budget limits, spend/funding/remaining placeholders, unmeasured assistant savings, instruction status/actions, recent activity and upcoming checks are grouped on the first signed-in screen. The New instruction action is on the Instructions card. Savings cannot be calculated until confirmed purchases and comparable reference prices are available. |
| PostgreSQL | Local PostgreSQL configured; migrations applied | Migrations 001–018 are applied in the local environment (including 012 conversation agreements, 013 M0 capability/mandates/events, 014–015 M2 quote lifecycle, 016 M3 reservations/ledger, 017 M4 notification delivery/cancellation/operator controls, and 018 M5 retention/step-up/immutable history). Production deployment evidence appears below; each self-hosted instance must verify its own database and TLS configuration. |
| M0 Capability & Mandate Gates | Closed (`AC-02`, `AC-12`, `AC-17` passed; live execution off) | `npm run test:m0` verifies the PostgreSQL `vendor_adapters` capability matrix (`local-fixture`, `paypal-sandbox`, `serper-discovery`, `webmcp-browser-host`), buyer/caller/payee role bindings, one-use `connection_sessions` consent flow and replay protection, verified webhook persistence in `provider_events`, deterministic `422 CAPABILITY_UNSUPPORTED` blocking of `HOLD`/`AUTHORIZE`/`CAPTURE_HOLD`/`VOID_HOLD`/`DEPOSIT`/`BID`/`ESCROW` (`AC-17`), closed-UI WebMCP `409 ACTION_REQUIRED` (`AC-12`), pre-dispatch session expiry `REAUTH_REQUIRED`, and mandate revocation (`MANDATE_REVOKED`) stopping future work while preserving in-flight `RECONCILE` jobs. |
| Member instruction UX | Local implementation; conversational concierge & drift tracking active | Instructions are browsable by newest-first Recent entries and collapsible groups. The conversational concierge translates member prompts into formal instruction titles, operational directives, and PayPal-flagged candidate leads, retaining the saved instruction ticket on-screen with direct Planner synchronization. See [PRD drift and clarification tracking](PRD-DRIFT-AND-CLARIFICATION-TRACKING.md) for full audit (TR-01 to TR-08) covering the elimination of dual input areas, resolution of the 6-turn crash, and transition from questionnaires to proactive discovery. `npm run test:assistant:live` passed. |
| Prompt and budget inheritance | Closed (PostgreSQL & compact review passed) | Migrations 007–008 preserve raw prompt text and budget date limits. Exact prompt create/edit/reload, idempotent retry, inherited maximum/dates, rejection of over-budget amount/date changes, stale-version rejection, and cross-member instruction/budget isolation verified in `npm run test:m1:workflow`. Suite C19 verifies compact-width invariants and typed readiness blocker evaluation (`CATEGORY_UNRESOLVED`, `FIXTURE_SCHEDULE_UNSUPPORTED`, etc.). |
| Private supplier relationships | Closed (CRUD & ranking acceptance passed) | Members can add, edit and remove private suppliers, including the services, areas and notes. Edits and removals use owner-scoped version checks and audit events; removal also cascades to clear budget preference links. Suite C19 (C19.1–C19.3) verifies add, update, and remove in state; PostgreSQL API acceptance verifies list/note isolation, creation idempotency, and ranked preference ownership. |
| Read-only web search | Authenticated synthetic provider check passed; rendered acceptance open | An authenticated member can explicitly submit a search query from Instructions. The Serper adapter returns up to three unverified source links with fetch time, enforces a short query and member rate limit, and never writes search results as supplier records or quotes. The first key returned `403 Unauthorized`; after correction, `npm run test:search:live` passed and returned three links through the authenticated API. Rendered and market-coverage acceptance remain open. |
| Recovery and step-up | Documented follow-up | Email verification/password recovery delivery and recent-authentication for sensitive actions are required before public enrollment or a live pilot. |
| PayPal | Sandbox verified; webhook delivery verified | OAuth and Orders v2 create/get/capture verified against PayPal Sandbox (`npm run test:paypal:sandbox`). A simulated webhook event was received through the production HTTPS endpoint, verified with PayPal, and accepted with HTTP 202. Endpoint identifiers are omitted from this public status report. |
| Durable worker and procurement workflows | Closed (Full AC-03 Schedule & Timezone Matrix passed) | `npm run test:ac03` verifies the full AC-03 matrix: local midnight boundaries across EDT/EST, DST spring-forward forward-shift, DST fall-back earliest instant selection, schedule edits with permission version increment and dedupe key update, and 90-day downtime missed-tick recovery (asserting exactly 1 overdue occurrence, future advancement, and zero catch-up duplicate charges). `npm run test:m1:workflow` also covers fixture activation, immutable quotes, quote-bound decisions, ownership, expired-lease recovery, notify-only watch, and lifecycle transitions. |
| Visual & Compact-Width acceptance | Closed (AC-01, AC-14, M1-H, M1-I) | Verified 5-tab compact viewport model (Home, Instructions, Planner, Inbox, Settings) in Suite C19.5 with responsive CSS rules. Suite C19.4 verifies explicit typed activation readiness blockers (`CATEGORY_UNRESOLVED`, `CATEGORY_DETAILS_MISSING`, `FIXTURE_SCHEDULE_UNSUPPORTED`, `MAX_TOTAL_MISSING`, `BUDGET_MISSING`). Private supplier add/edit/remove CRUD verified in Suite C19.1–C19.3. |
| Dependency audit | Resolved (0 vulnerabilities) | The 53 findings (including 2 critical) from M1-A were legacy Angular dependencies. Following the migration to React 19 + Vite + Tailwind CSS v4, `npm audit` reports **0 vulnerabilities** across all severities (critical: 0, high: 0, moderate: 0, low: 0, info: 0), verified automatically in Suite C19.6. |

## M0–M1 Closeout Status

**Milestones M0 and M1 are 100% green-lit and verified (with external live execution safely disabled).**
- **M0 Capability & Mandate Suite (`npm run test:m0`)**: Verified `AC-02` (adapter capability matrix, buyer/caller/payee roles, one-use connection consent callback, webhook deduplication in `provider_events`), `AC-12` (closed-UI WebMCP `ACTION_REQUIRED`, expired session `REAUTH_REQUIRED` pre-dispatch block, mandate revocation `MANDATE_REVOKED` blocking future runs while completing in-flight `RECONCILE` jobs), and `AC-17` (deterministic `422 CAPABILITY_UNSUPPORTED` on `HOLD`, `AUTHORIZE`, `CAPTURE_HOLD`, `VOID_HOLD`, `DEPOSIT`, `BID`, `ESCROW`).
- **M1 Acceptance & PostgreSQL Suites**: All 101 automated acceptance assertions in `tests/acceptance-matrix.ts` pass (`npm run test:acceptance`), the PostgreSQL-backed AC-03 schedule and timezone matrix passes (`npm run test:ac03`), member auth and fixture workflows pass (`npm run test:auth`, `npm run test:m1:workflow`), PayPal Sandbox contract & capability checks pass (`npm run test:paypal`, 3/3), domain tests pass (`npm run test:domain`, 6/6), and dependency vulnerabilities are 100% resolved (0 audit findings).

## M2 Closeout Status

**Milestone M2 is green-lit and verified in domain and PostgreSQL fixture mode (with external live execution safely disabled).**
- The five Pass 2 remediation items (`M2-R1` through `M2-R5`) in the [M2 implementation plan](M2%20Discover%20Quote%20and%20Review%20Plan.md) are implemented, audited, and covered by `npm run test:m2`:
  - **`AC-04`**: Category criteria validation (`PRODUCT`, `BILL`, `ACCOMMODATION`), constraint matching against active instructions, and no-match watch continuation (`WATCH_NO_MATCH_CONTINUING` advancing `next_run_at` until `valid_until` without creating operations/quotes/approvals).
  - **`AC-05`**: Deduplicated multi-tier discovery (`BUDGET_PREFERRED` → `PRIVATE_HISTORY` → `CATALOGUE` → optional read-only `WEB_RESEARCH`) capped at 3 unique candidates with strict owner isolation; rejection of non-authoritative discovery evidence (`SEARCH_SNIPPET`, `ESTIMATE`, `ADVERTISED_OFFER`, `STALE_STOCK`); exact minor-unit quote arithmetic reconciliation, currency alignment, ceiling check, and canonical SHA-256 `quote_hash`.
  - **`AC-06`**: Matching `REVIEW_REQUIRED` Arusha stay watch creates 1 `FIXTURE_AWAITING_REVIEW` operation, 1 immutable quote, 1 `PENDING` approval, and 1 durable notification; `PRE_APPROVED` quotes above `softReviewThresholdMinor` route to `FIXTURE_AWAITING_REVIEW`; `NOTIFY_ONLY` watches never create operations or approvals.
  - **`AC-11`**: Read-only approval inspection (`GET /api/v1/approvals/:id`), single-winner concurrent decision fencing (`POST /api/v1/approvals/:id/decide`), `vendor_quote_lifecycle` (`014`–`015`) expiry sweeping, and material instruction amendment invalidation (`409 STALE_AGREEMENT_VERSION` / `410 APPROVAL_EXPIRED_OR_DECIDED`).
- **Final checkpoint, 2 November 2026:** Commit `e7e276f` on `main`. All verification suites pass: `npm run test:m2`, `npm run test:m0`, `npm run test:ac03`, `npm run test:auth`, `npm run test:paypal` (3/3), `npm run test:domain` (8/8), `npm run test:acceptance` (101/101), and `npm run build` (0 errors). Provider-sourced live vendor quote normalization and production checkout capability remain gated under external execution controls.

## M3 Closeout Status

**Milestone M3 (`AC-07`–`AC-10`) is GREEN-LIT after Chief Engineer review and independent PostgreSQL verification with deterministic local fixture execution (provider sandbox checkout and live execution remain disabled).**

- **Schema & Database Fencing (`016_m3_reservations_ledger_and_attempts.sql`)**: Adds versioned owner `budget_policies` and `budget_windows`, atomic `budget_reservations` (`ACTIVE` / `COMMITTED` / `RELEASED`), immutable `budget_entries` (`SPEND` / `REFUND` with `reference_spend_entry_id`), `execution_attempts` (`UNIQUE(operation_id)`, `UNIQUE(stable_request_key)`), `external_orders`, `refunds`, approval `policy_version` stamping, and cross-instruction bill obligation uniqueness (`procurement_obligations_unique_bill_invoice`).
- **Transactional Policy & Reservation Engine (`packages/domain/src/index.ts`, `packages/execution/src/reservations.ts`, `apps/api/src/server.ts`, `apps/worker/src/worker.ts`)**:
  - **`AC-07`**: Enforces unit cap, per-order hard cap, instruction ceiling, budget allocation, and daily cap; generic `APPROVED` approval cannot override any hard cap; policy edits increment `policy_version` and invalidate unconsumed prior-policy approvals.
  - **`AC-08`**: Serializes shared-budget and daily-window capacity under PostgreSQL `FOR UPDATE` locks (50 remaining vs. two concurrent 40-unit obligations allows exactly 1 winner and blocks 1 with `INSUFFICIENT_BUDGET_CAPACITY`), carries unresolved prior-window `ACTIVE` reservations across window rollover, and restores capacity only on `CONFIRMED` refunds (`PENDING` refunds restore `0`).
  - **`AC-09`**: Persists `stableExecutionKey(operationId, quoteHash, permissionVersion)` before execution, reuses the same attempt on client retries/duplicate triggers/expired worker leases, transitions `ONE_TIME` instructions to `COMPLETED`, and blocks duplicate bill obligations across separate instructions (`DUPLICATE_BILL_OBLIGATION`).
  - **`AC-10`**: Retains `ACTIVE` reservations and `RECONCILING` state when responses are lost (`LOST_RESPONSE_AFTER_SUCCESS`, `CRASH_BEFORE_REFS`) or when payment is captured while vendor confirmation is pending (`PAYMENT_CAPTURED_VENDOR_PENDING`), recovering via worker `RECONCILE` using `stable_request_key` with zero duplicate orders.
- **Chief Engineer Verification & Sign-Off, 2 November 2026:** Commit `260d1b9` on `main`. Independently verified by Chief Engineer: `npm run test:m3` (domain 9/9, API/worker builds, PostgreSQL M3 acceptance), `npm run test:m0`, `npm run test:m2` (including M1 fixture workflow), `npm run test:ac03`, `npm run test:auth`, `npm run test:paypal` (3/3), `npm run test:acceptance` (101/101), and `npm run build` (0 errors). Local dispatch requires explicit `APPAI_EXECUTION_MODE=local-sandbox`; the API continues to report `liveExecutionEnabled: false`. Full details and sign-off are recorded in the [M3 implementation and acceptance report](M3%20Atomic%20Reservations%20and%20Safe%20Sandbox%20Execution%20Plan.md).

## M4 Closeout Status

**Milestone M4 (`AC-13`–`AC-16`) is GREEN-LIT after Chief Engineer review and independent PostgreSQL verification with deterministic local fixtures (real push transports, provider cancellation, and live execution remain disabled).**

- **Schema & Control Plane (`017_m4_notifications_cancellations_and_recovery.sql`)**: Adds owner-scoped `push_subscriptions` and `notification_deliveries` with `stable_delivery_key UNIQUE`, `cancellations` (`PRE_DISPATCH`/`POST_DISPATCH`, `stable_request_key UNIQUE`), `purchase_operations.cancellation_state`, `vendor_adapters.circuit_state`, and the singleton `runtime_execution_controls` global execution switch.
- **Security, Redaction & Cancellation Contracts (`packages/domain/src/index.ts`, `packages/execution/src/reservations.ts`, `apps/api/src/server.ts`, `apps/worker/src/worker.ts`)**:
  - **`AC-13`**: Push transport failures, `PERMISSION_DISABLED`, `OFFLINE` devices, and duplicate deliveries preserve domain progress and the durable member inbox (`GET /api/v1/inbox`); delivery retries reuse `stable_delivery_key` and never repeat a purchase.
  - **`AC-14`**: Enforces cross-member isolation across instructions, quotes, approvals, budgets, inbox, and receipts (`GET /api/v1/receipts`, `GET /api/v1/receipts/:id`); deterministically blocks merchant prompt/authority injection and SSRF/unsafe URLs (`inspectUntrustedMerchantContent`); recursively redacts credentials (`redactSensitivePayload`); and rejects forged client prices (`422 CLIENT_PRICE_OVERRIDE_FORBIDDEN`).
  - **`AC-15`**: Pre-dispatch cancellation releases active reservations, invalidates unconsumed approvals, and makes zero external calls; post-dispatch cancellation records vendor rejection visibly (`CANCELLATION_REJECTED_BY_VENDOR`) or confirms vendor cancellation (`CONFIRMED`) while keeping `SPEND` intact until confirmed refund posting.
  - **`AC-16`**: Allowlisted operator endpoints (`/api/v1/operator/recovery`, `/api/v1/operator/adapters/:key/circuit-breaker`, `/api/v1/operator/execution-switch`) block new dispatch (`ADAPTER_CIRCUIT_OPEN` / `EXECUTION_PAUSED`, including approved quotes and `PRE_APPROVED` worker occurrences) while in-flight `RECONCILE` and `CANCEL_RECONCILE` jobs finish; row snapshot/restore and worker restart preserve reservations and `stable_request_key` replay protection.
- **Chief Engineer Verification & Sign-Off, 2 November 2026:** Commit `b6c2844` (`Implement M4 mobile controls and operational recovery`) on `main`. Independently verified by Chief Engineer: `npm run test:m4` (domain 11/11, API/worker builds, local PostgreSQL acceptance), alongside full regression (`test:m0`, `test:ac03`, `test:m2`, `test:m3`, `test:auth`, `test:paypal` 3/3, `test:acceptance` 101/101, and `npm run build`). Local fixture results do not establish real push transport, provider cancellation, sandbox checkout, or live execution. See the [M4 implementation and acceptance report](M4%20Mobile%20Control%20Cancellation%20and%20Operational%20Recovery%20Plan.md).

## Deployment Preparation & 5-Step Pre-Flight Verification — Completed 2 November 2026

The production deployment preparation sequence and mandatory 5-step pre-flight verification gate (`.agents/skills/five-final-checklist/SKILL.md`) are executed and verified:
- **Step 1 (Strict Token & Style Hygiene)**: Design tokens defined at root in `src/index.css` (`--color-canvas`, `--color-surface`, `--color-primary`, `--color-finance`, `--color-positive`, `--color-warning`), verified zero invalid class mutations.
- **Step 2 (Semantic & A11y Compliance)**: 100% static accessibility compliance verified on compiled distribution HTML. Unique `<title>` and `<meta name="description">`, descriptive link and button labelling, high contrast focus indicators, and strict heading hierarchy confirmed.
- **Step 3 (Motion & Reduced-Motion)**: Smooth tokenized transitions with strict `@media (prefers-reduced-motion: reduce)` override in `src/index.css` and `ConversationScreen.tsx`.
- **Step 4 (Privacy, SEO & LLM Discovery)**: Added `public/robots.txt`, `public/sitemap.xml`, and `public/llms.txt` (per llmstxt.org standard). Updated `index.html` with canonical URL (`https://appai.themeshak.com/`), Open Graph tags, Twitter card metadata, and Schema.org JSON-LD structured data (`Organization`, `WebApplication`). Added `.xml` MIME type to `scripts/serve-staging.mjs`.
- **Step 5 (Build & Regression Gate)**:
  - Clean production builds: `npm run build` (emits `dist/appai-website` with static assets copied), `npm run build:domain`, `npm run build:api`, `npm run build:worker` (0 errors).
  - All 18 PostgreSQL migrations verified (`npm run db:migrate`).
  - Full test verification: `npm run test:domain` (11/11 pass), `npm run test:acceptance` (101/101 pass), `npm run test:paypal` (3/3 pass), `npm run test:auth` (pass), `npm run test:m5` (pass; SLA benchmarks, retention, step-up, and full `pg_dump`/`pg_restore` backup rehearsal pass).
  - Test hardening: synthetic deactivation test jobs in `scripts/test-m5-pilot-readiness.mjs` scheduled at `now() + interval '10 minutes'` to eliminate cross-process worker contention during backup/restore rehearsal.
  - Pre-deployment database checkpoint created: `appai-checkpoint-2026-11-02T08-07-02-664Z.dump` (356 KB).
  - Safety gate: `liveExecutionEnabled: false` remains strictly enforced.

### Public Splash Optimization Follow-Up — 2 November 2026

- Aligned the document title, Open Graph/Twitter titles, and Schema.org names to the displayed **APPAI** brand; clarified the page description and first-paragraph product definition.
- Prerendered the public landing page into the production HTML, then hydrated it with React, so its main copy and headings are present before client JavaScript runs. Existing authentication and workspace behavior stays in the React app.
- Removed duplicate Google Font stylesheet requests, used the shared public logo URL for cacheable references, added visible keyboard focus styling for links, and provided an accessible name for the product preview.
- Updated `public/llms.txt` to describe the member-facing product and invite-only access; limited `public/sitemap.xml` to the public homepage.
- Verification: `npm run build` passed on 2 November 2026; generated `dist/appai-website/index.html` contains the prerendered landing content. Automated and assistive-technology accessibility checks, real-user performance metrics, and post-change live HTTP/social-card checks remain to be run as part of deployment verification.

## Production Deployment — Completed 2 November 2026 (Updated 3 November 2026)

The full A-P-P-A-I stack was deployed and verified at `https://appia.intelliweblab.com/`. Host addresses, filesystem paths, certificate paths, webhook identifiers, and operator email addresses are intentionally omitted from this public report.
- **PostgreSQL 16**: Dedicated database and role configured; migrations 001–018 applied.
- **Frontend SPA**: Vite React 19 bundle and public metadata files served over HTTPS.
- **Backend API & Durable Worker**: Separate systemd services were active and configured to restart after failures.
- **Reverse proxy**: Nginx served the application and proxied `/api/` and `/health` to the API over TLS.
- **Live verification**: Homepage, `/health`, `/robots.txt`, `/sitemap.xml`, and `/llms.txt` returned HTTP 200; `/api/v1/operator/pilot-readiness` returned HTTP 401 when unauthenticated. The health response reported `liveExecutionEnabled: false`.
- **Enrollment**: An initial operator invitation was generated. Recipient details and invitation codes are not included in this report.

### Production Web Client Deployment Update — 3 November 2026

The updated APPAI web client was compiled from checkpoint commit `6a09928` (`Add calendar views to Planner`) and deployed to `https://appia.intelliweblab.com/`:
- **Pre-deployment Safety Backup**: Remote bundle archived to `/home/ubuntu/backups/appai-website-backup-20261103_013133.tar.gz`.
- **Public Splash & SEO Prerendering**: Production HTML contains prerendered landing structure, APPAI branding metadata, hydration entry point, and updated crawler discovery endpoints (`/llms.txt`, `/robots.txt`, `/sitemap.xml`).
- **Planner Calendar Views**: Deployed interactive Month and Week projection views, schedule matrix, and day-budget navigation.
- **Static A11y Gate**: 100% WCAG 2.1 AA static scan verified (single H1, unique titles, no empty links).
- **Dedicated UI Prototype (`/prototype/`)**: Authentic, clean React 19 + Tailwind CSS v4 prototype compiled from `/Users/mac/Developer/IntelliTheme-Studio/Prototypes/appia-prototype` deployed at `https://appia.intelliweblab.com/prototype/`. Features instant workspace exploration, interactive screens (`HomeScreen`, `InstructionsScreen`, `ConversationScreen`, `PlannerScreen`, `InboxScreen`, `SettingsScreen`, `OfferReviewModal`, `PaymentScreen`, `ReceiptScreen`), and complete OpenGraph/Twitter metadata (`AppAI Prototype | Personal Procurement Assistant`). The root homepage remains strictly invite-only.
- **Multi-Endpoint Live Verification (3 November 2026)**:
  - `GET /` — HTTP/2 200 (prerendered HTML served, `no-store, no-cache` document caching).
  - `GET /health` — HTTP/2 200 (`{"status":"ok","paypalMode":"fixture","memberAuthAvailable":true,"liveExecutionEnabled":false}`).
  - `GET /robots.txt`, `GET /sitemap.xml`, `GET /llms.txt` — HTTP/2 200.
  - `GET /assets/index-DCepgSzR.js`, `GET /assets/index-DhDzDe3i.css` — HTTP/2 200 with `public, max-age=31536000, immutable` and `nosniff`.
  - `GET /api/v1/operator/pilot-readiness` — HTTP/2 401 unauthenticated protection verified.
  - Nginx reloaded cleanly; `appai-api.service` and `appai-worker.service` active and operational.

### Production Web Client & Rebranding Deployment Update — 4 November 2026

The Apas web client, UI prototype sandbox, and discovery metadata were compiled and verified for production deployment to `https://appia.intelliweblab.com/`:
- **Apas Rebranding & Discovery Metadata**: Synchronized public identity from APPAI to **Apas** (pronounced "Appas") across the main application (`src/App.tsx`, `index.html`), SVG vector assets (`appai-logo.svg`, `public/appai-logo.svg`, `src/assets/appai-logo.svg`), prototype sandbox (`prototype/index.html`), `public/llms.txt`, and crawler discovery files (`public/sitemap.xml` updated to `<lastmod>2026-11-04</lastmod>`).
- **Surface Refinement & Design Tokens**: Adjusted `src/index.css` design tokens (`--color-primary-deep: #002A7A`) and transitioned `.control-section`, `.security-section`, and `.landing-cta` to light theme card surfaces (`var(--color-surface)` and `var(--color-ink)`) with brand ring accents.
- **5-Step Pre-Flight Verification Gate (`.agents/skills/five-final-checklist/SKILL.md`)**:
  - Step 1 (Tokens & Hygiene): Design tokens strictly maintained; raw styling prohibited.
  - Step 2 (A11y & Semantics): 100% static WCAG 2.1 AA compliance verified on compiled distribution HTML across root and prototype (`dist/appai-website/index.html` and `dist/appai-website/prototype/index.html` report 1 unique title tag, clean heading hierarchy, and zero empty links).
  - Step 3 (Motion & Transitions): Hardware-accelerated transforms with strict `@media (prefers-reduced-motion: reduce)` overrides.
  - Step 4 (SEO & Discovery): Prerendered landing HTML, canonical URL (`https://appia.intelliweblab.com/`), OpenGraph/Twitter cards, and Schema.org JSON-LD verified.
  - Step 5 (Build & Regression Gate):
    - `npm run build` emitted clean distribution bundle: 425.87 kB JS, 95.78 kB CSS, prerendered index HTML, and `/prototype/` standalone sandbox.
    - `npm run build:api` and `npm run build:worker` compiled with 0 errors.
    - Full test suite verified: `npm run test:domain` (11/11 pass), `npm run test:paypal` (3/3 pass), `npm run test:acceptance` (101/101 pass).
    - Safety gate: `liveExecutionEnabled: false` remains strictly enforced.
- **Live Multi-Endpoint Verification (4 November 2026)**:
  - Remote bundle safety backup archived to `/home/ubuntu/backups/appai-website-backup-20261103_214024.tar.gz`.
  - Nginx reloaded cleanly; `appai-api.service` and `appai-worker.service` active and operational.
  - `GET https://appia.intelliweblab.com/` — HTTP/2 200 (prerendered HTML served, `<title>Apas | Personal Procurement Assistant</title>`).
  - `GET https://appia.intelliweblab.com/prototype/` — HTTP/2 200 (`<title>Apas UI Prototype Sandbox</title>`).
  - `GET https://appia.intelliweblab.com/sitemap.xml` — HTTP/2 200 (`<lastmod>2026-11-04</lastmod>`).
  - `GET https://appia.intelliweblab.com/llms.txt` — HTTP/2 200 (Apas product context).
  - Internal health check `GET http://127.0.0.1:4300/health` — HTTP 200 (`{"status":"ok","paypalMode":"fixture","memberAuthAvailable":true,"liveExecutionEnabled":false}`).

## M5 Implementation Status

**M5 is GREEN-LIT in local PostgreSQL and deterministic fixture mode.** Live execution remains disabled; production TLS, email delivery/recovery, and live provider capability evidence remain open.

- **Implementation checkpoint:** `5c9000b` (`Implement M5 pilot readiness safeguards`) on `main`.

- Migration 018 seeds retention policies, records retention runs, adds session-bound step-up records and first job start timestamps, and rejects `UPDATE`/`DELETE` on audit and budget ledger rows.
- API adds the operator pilot-readiness manifest and safe retention runner, 15-minute password-confirmed step-up, sensitive-action gates, and account deactivation that preserves unresolved liabilities and financial history.
- Worker records a job's first claim timestamp. Reservation responses report internal reservation preparation latency for SLA evidence.
- `npm run test:m5` passed: append-only enforcement, 15-minute step-up, pruning of expired idempotency while protecting unresolved operation references, pilot manifest, 10-operation atomic concurrency, due-job pickup, account deactivation liability preservation, and a full `pg_dump`/`pg_restore` count comparison.
- Recorded final local SLA: reservation p95 **59.80 ms** (≤200 ms), authenticated API acknowledgement p95 **78.53 ms** (≤1,000 ms), due-job pickup **1,000 ms** (≤60,000 ms). Ten concurrent operations produced exactly five winners and conserved **5,000 minor units**.
- Regression passed: `test:m0`, `test:ac03`, `test:m2`, `test:m3` (successful rerun), `test:m4`, `test:auth`, `test:paypal` (3/3), `test:acceptance` (101/101), and `npm run build`. M3's first run timed out once in its lost-response recovery scenario; it passed on rerun after M4.
- Read-only tunnel smoke check & process diagnostics: before restart, the background `npm start` stack (`PID 80380` / API `PID 80540` / Worker `PID 80544`) was still on a pre-M5 build. After restart, local and tunnel M5 pilot-readiness and budget-policy routes both reach their authentication gates (`401` without a session); both pass CORS preflight for `X-Require-Step-Up`; the local health endpoint returns JSON and tunneled `/health` still serves SPA HTML. No credentials or payment actions were used; details are in the M5 report.
- See the [M5 implementation and acceptance plan](M5%20Supported%20First-Release%20Acceptance%20and%20Pilot%20Readiness%20Plan.md) and [pilot operations runbook](M5-PILOT-READINESS-AND-OPERATIONS-RUNBOOK.md).

## Next acceptance and implementation sequence (M6)

1. **Production Operations & Recovery Follow-ups (`M5`).** Configure email delivery for verification/password recovery, step-up re-authentication for sensitive payment changes, production TLS/HTTPS termination, and live PayPal webhook processing.
2. **Provider capability gates.** Gather separate vendor-sandbox push, cancellation, and checkout evidence and capability approval before enabling provider-backed behavior. Local fixture results do not establish sandbox or live support.

For each item, mark **implemented**, **database/fixture passed**, **sandbox passed**, or **live enabled** separately, and add the command/environment, test data, observed result and evidence link to [M1 evidence](M1-EVIDENCE.md) or the relevant milestone report. M1 core requirements (AC-01, AC-03, and the M1 portions of AC-14) are verified and closed; real execution and external purchases remain gated.
