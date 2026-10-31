# M1 Foundation Evidence

Status: **Selected M1 fixture/auth workflows and targeted prompt/budget/private supplier ownership-ranking checks are PostgreSQL acceptance-tested; rendered compact-flow review, full AC-03 coverage, M0 capability, and production gates remain open**  
Date: 30 October 2026

## M1-A member authentication

| Check | Command / method | Result |
| --- | --- | --- |
| Angular production bundle | `npm run build` | Passed. Current initial bundle 414.44 kB; the component stylesheet emits a 1.90 kB warning above its 36.86 kB warning budget but remains below the hard build limit. |
| API TypeScript build | `npm run build:api` (also run by the auth test) | Passed. |
| Reproducible local PostgreSQL config | `docker compose config --quiet` | Passed. PostgreSQL 16 container binds to loopback and persists to a named development volume. |
| PostgreSQL-backed auth acceptance | `npm run test:auth` with a private `.env`; disposable local PostgreSQL 16 cluster | Passed. The script applies all migrations, starts an isolated API process, and removes its generated members/invites afterward. |
| Invite-only enrollment | Two unique, email-bound invitations; wrong-email reuse rejected | Passed. |
| Session and ownership | Sign-in cookies; `/api/v1/me`; caller-supplied owner ID ignored; repeat mapping count remains one | Passed. Unauthenticated access returns HTTP 401. |
| Session lifecycle | Database session expiry forced idle-expired and absolute-expired; sign-out; disable member | Passed. Expired/disabled sessions were rejected and revoked. |
| Request protections | Invalid Origin rejected; repeated sign-in attempts reached HTTP 429 | Passed. |
| Fail-closed configuration | Separate API processes with auth/database config removed and with `NODE_ENV=production` plus insecure HTTP origins | Health reports auth unavailable; sign-in and profile endpoints return HTTP 503; production HTTP origins are rejected. |
| Storage boundary | Application `users` columns checked; browser source checked for Web Storage; auth/profile path checked for model forwarding | Passed. Credentials/session tokens are handled by Better Auth's auth-owned tables and HttpOnly cookies, not application tables or browser storage. |

Schema migrations are pinned to Better Auth 1.7.14 and manually reviewed against its PostgreSQL core schema; the acceptance run applied and reran them successfully. Application-owned member identity maps one-to-one to the auth user ID. The local test used fixture PayPal mode and did not call a payment provider.

## Review limitations and before-public requirements

- Browser visual acceptance could not be performed: the computer-use browser host was unavailable. Open the local Angular app and review sign-in, authenticated workspace, sign-out, and responsive widths.
- Invite-only enrollment is implemented, but email verification and password-recovery email delivery are not configured. Configure and prove those before public enrollment or a live pilot.
- Require recent authentication/step-up for sensitive changes (such as changing account security or payment authority) before a live pilot; it is not part of this M1-A slice.
- Production database/TLS and secure-cookie behavior have not been deployed or browser-proven. Production mode sets secure cookies; live deployment still needs HTTPS and operational review.
- Current Angular builds report the stylesheet warning documented in the closeout results below; the warning is below the hard build limit.
- Dependency installation reported 53 audit findings, including 2 critical; they were not triaged or auto-fixed during this checkpoint.

## Remaining M1 work

The following sections are a dated implementation history. Their earlier “not yet tested” statements describe those checkpoints and are superseded for the fixture workflow by the current closeout evidence below.

### Member instruction draft follow-up

- Added authenticated owner-scoped `GET` and `POST /api/v1/instructions` routes. Create requests validate kind, category, mode, origin, and a 3–500 character user description; owner identity comes from the server session.
- Added a member-area instruction list and draft form. Selecting a permission mode on a draft does not create authority; the UI states that drafts do not schedule or purchase.
- Added migration `005_allow_incomplete_permission_drafts.sql` so the database matches the schema contract that incomplete drafts may exist before a funding mandate is connected.
- Applied migrations 001–005 to local PostgreSQL database `appai_dev` at `127.0.0.1:5433`; API TypeScript build and Angular production build passed.
- The auth integration suite and rendered browser flow were not rerun for this slice. Do not infer database-backed create/list journey acceptance from compilation and migration evidence alone.

### Activation readiness follow-up

- Added owner-scoped `GET /api/v1/instructions/{id}/readiness`; it is read-only and does not change instruction state.
- It checks the current draft state, account settings, positive maximum, matching active budget/currency, validity window, IANA timezone, and presence of typed category constraints.
- It reports the current hard blockers from the implementation baseline: the M0 vendor capability decision is open, the durable worker is not implemented, and purchase modes have no funding-mandate schema/consent flow.
- The member UI displays these blockers per draft. It offers no activation action while those prerequisites are unresolved.
- API TypeScript build and Angular production build passed. The readiness endpoint and rendered UI were not exercised; no activation, scheduling, worker execution or payment is claimed.

### Account and allocation setup follow-up

- Added owner-scoped settings read/create/update routes with IANA timezone validation, explicit ISO currency and minor-unit scale, idempotent initial creation, version-checked updates, and currency/scale locking after allocations exist.
- Added owner-scoped budget list/create routes. Allocation amounts are parsed as decimal strings into exact integer minor units using the configured scale; floating-point arithmetic is not used. Create retries use PostgreSQL idempotency records and write audit events.
- Added Account UI for currency/timezone and internal allocations. The UI explains that allocations do not hold funds or grant provider authority.
- Account currency, timezone, and minor-unit scale use keyboard-accessible native dropdowns. Currency selection preselects its browser Intl minor-unit scale; the scale can still be adjusted explicitly.
- API TypeScript and Angular production builds passed. Settings/allocation API journeys were not exercised against the browser; no suite was run for this slice.

### Instruction allocation linking follow-up

- New drafts can optionally select an active allocation. Existing drafts can attach, change, or clear an allocation through an owner-scoped, version-checked `PATCH /api/v1/instructions/{id}` route.
- The API verifies the allocation is active and belongs to the signed-in member, copies its currency to the draft, increments the instruction version, and records an audit event. It reuses existing `budget_id` and owner-bound foreign-key constraints; no migration is needed.
- The member list shows the selected allocation and offers draft-only allocation editing. Readiness is cleared after an allocation change and remains read-only; maximum total, validity, typed category details, worker, vendor capability, and funding authority remain separate gates.
- API TypeScript and Angular production builds passed. The PostgreSQL-backed save/list/edit browser journey was not exercised; no tests were run for this slice.
- The local API reports member authentication available, fixture PayPal mode, and live execution disabled. The Angular dev server responds at `http://localhost:4200`; this HTTP check does not establish a rendered member-flow acceptance.

### Draft limits and typed request criteria follow-up

- Added owner-scoped, version-checked draft configuration for exact maximum totals, validity-window local date-times, an explicit IANA timezone, allocation, and typed category details. Changes increment instruction and permission versions and write an audit event.
- Local date-times are converted using the selected timezone; nonexistent clock times are rejected and ambiguous times resolve to the earlier instant. Dates, money precision, quantity, guest/room counts, and category enums are validated by the API.
- Draft fields cover product quantity/variant/needed-by date; bill provider label/due date and time/non-secret invoice label; and accommodation destination/dates/guest-room counts/cancellation preference. They do not collect bill account numbers or credentials.
- Readiness now distinguishes missing user criteria from provider-verified details. Vendor quote, stock, unpaid status, availability, total/terms, worker, and funding requirements remain blockers.
- API and Angular production builds passed. No tests or database-backed browser journey were run for this slice; no activation or purchase capability is claimed.

### Durable worker foundation follow-up

- Added a separate Node worker process, built by `npm run build:worker` and launched by `npm start`.
- It atomically claims due/reclaimable jobs with `SKIP LOCKED`, lease ownership/expiry and generation fencing. Transient errors use bounded retries; exhausted attempts become `DEAD`.
- Before claiming, the worker scans already-active one-time/dated instructions and transactionally creates a deduplicated job with audit/outbox records. It does not activate instructions or calculate recurring schedules.
- `RUN_OCCURRENCE` creates a unique occurrence/obligation pair and writes audit/outbox records transactionally, then blocks with `EXECUTION_DISABLED`. Other job types fail closed with explicit capability reasons.
- API, worker, and Angular production builds passed. `npm start` applies migrations 001–005, starts the member API and durable worker, then compiles the Angular app at `http://localhost:4200`. The worker logged its startup against the configured PostgreSQL database; no queued job or database-backed replay test was run. M1 remains open for activation/job production, recurring schedules, fixture quote processing, outbox delivery and restart acceptance.

## Tested M1 fixture subset (not full M1 closeout)

| Check | Command / method | Result |
| --- | --- | --- |
| API and worker TypeScript builds | `npm run build:api`, `npm run build:worker` | Passed as part of the final workflow command. |
| Angular production build | `npm run build` | Passed; stylesheet budget warning remains. |
| PostgreSQL fixture workflow | `npm run test:m1:workflow` | Passed for the covered scenarios: exact prompt create/edit/reload, idempotent draft retry, inherited budget maximum/dates, rejected amount/date overbounds, stale draft-version rejection, cross-member instruction/budget isolation, private supplier list/note isolation, idempotent supplier creation, ranked budget preferences and cross-owner rejection, authenticated fixture activation, synthetic immutable quote, quote-bound review, expired-lease recovery, deduplicated operation identities, a UTC monthly schedule advancement, notify-only watch observation, PRE_APPROVED fixture simulation, and pause/resume/revoke. This does not cover the full AC-03 matrix. |
| PostgreSQL auth acceptance | `npm run test:auth` | Passed. Invite-only enrollment, cookie sessions, ownership, CSRF, expiry/revocation, rate limiting, fail-closed configuration, and credential-storage boundaries. |
| Domain tests | `npm run test:domain` | Passed: 6 tests. |

The 30 October 2026 workflow rerun exercised M1-H against the configured local PostgreSQL database using two uniquely named temporary members. Exact prompt text (including leading/trailing whitespace) survived draft creation, configuration edit, and list reload; retrying the same idempotency key returned the original draft. A linked draft inherited its budget maximum and date window; above-limit amounts, outside-window dates, stale versions, another member's budget, and another member's instruction listing were rejected or hidden as expected. Each member then created private suppliers; supplier list and private-note data remained owner-scoped, supplier creation retries returned the original record, and budget preferences preserved the requested rank order. Attempts to rank another member's supplier or modify another member's budget returned authorization errors without changing saved rankings. The successful run cleaned its temporary member and supplier records. These checks do not establish rendered compact-flow acceptance or real supplier discovery.

All purchase-like outcomes in this workflow are local fixtures. `FIXTURE_COMPLETED` is a simulation result; quote and observation records are synthetic. No vendor, discovery, notification transport, or payment API was called. Outbox events are persisted transactionally, while external delivery is not implemented. M0 capability and sandbox proof remain open. The tested UTC recurrence scenario does not establish daylight-saving transitions, local midnight boundaries, schedule edits or missed-tick behavior; those AC-03 cases remain open.

### Current closeout results

The recorded workflow and auth commands passed against their configured local PostgreSQL environments. The 30 October `npm run build` passed with a 414.44 kB initial bundle; the component stylesheet emitted a 1.90 kB warning above its 36.86 kB warning budget, below the hard build limit. The browser access host was unavailable, so rendered browser acceptance is still open. Review sign-in, account setup, prompt-first instruction/budget setup, supplier preferences, fixture review and activity at desktop and compact widths. Email verification/recovery delivery, recent-authentication step-up, production database/TLS, dependency audit findings, external capability, and real provider execution remain open.

### 31 October 2026 — Gemini adapter change and synthetic provider smoke check

- The authenticated instruction-refinement endpoint now uses Gemini `generateContent`, with the existing private `GOOGLE_KEY` and ordered `GOOGLE_MODELS` (`gemini-3.8-flash,gemini-3.5-flash-lite`). It also accepts `GEMINI_API_KEY`/`GEMINI_MODEL` aliases. It requests a JSON-schema proposal and retains the existing local response validation, member rate limit, timeout, and draft-only save boundary.
- The composer clears stale assistant limits when the member edits the wording of an existing draft and ignores a provider reply if the active instruction or wording changed while the request was pending.
- `npm run build:api` and `npm run build` passed locally. The Angular build still reports the existing component stylesheet warning: 40.73 kB against a 36.86 kB warning budget.
- The key and model list were checked for presence without printing their values. A direct synthetic Gemini request to `gemini-3.8-flash` returned HTTP 200, `STOP`, and a parseable JSON proposal; with an explicit decimal instruction, it returned the expected `maximumTotal: "1000"`. The first minimal synthetic prompt did not pass that exact-value check, so extraction quality remains open. This did not exercise the authenticated application endpoint, member data, fallback model, provider data handling, or rendered desktop/compact journeys. M1-I remains open; real procurement and payment execution remain disabled.

### 31 October 2026 — authenticated Gemini extraction and draft persistence

- Environment: local PostgreSQL at the configured private `DATABASE_URL`; isolated API process with invite-only Better Auth; real Gemini `gemini-3.8-flash` provider; synthetic test member and prompts only. Command: `npm run test:assistant:live`.
- Observed **PASS**: explicit USD 250 maximum and 15 November 2030 17:00 UTC deadline were returned in the proposal; after the test member explicitly saved the draft, PostgreSQL held the exact original prompt, `max_total_minor = 25000`, the expected `valid_until`, and `state = DRAFT`.
- Observed **PASS**: a prompt with no amount/deadline returned null for those fields and clarification questions; a follow-up reply specifying USD 800 and the deadline produced those proposal values.
- The test prints only result labels and cleans up its temporary member, invite, instruction, settings, and audit records. It does not send real member data or save a transcript of the assistant exchange.
- This is authenticated API/provider and database evidence, not rendered member acceptance. Manual editing, compact layout, error states, fallback model, provider account data handling, and varied extraction accuracy remain open. No activation, vendor, or payment call occurred.

### 31 October 2026 — Serper read-only search probe

- Configuration presence check found `searchProvider=serper` and a nonempty `serperApiKey` in the private root `.env`; the key value was not printed. The first value had a trailing quote. A synthetic direct `POST https://google.serper.dev/search` request using `X-API-KEY` and a laptop-retailer query returned **HTTP 403 Unauthorized** with no organic results. Retrying with the trailing quote removed in memory returned the same 403. The local key was then corrected; its value remained private.
- An authenticated `POST /api/v1/discovery/search` and an explicit Instructions search form were added. The route bounds query length, limits each member to six searches per minute, times out provider calls, and returns at most three source links plus fetch time. It does not persist queries/results or create supplier, quote, payment, or execution records. Provider rejection returns a safe unavailable state.
- `npm run build:api` and `npm run build` passed locally. The existing Angular component stylesheet warning remains. After the key correction, `npm run test:search:live` passed against local PostgreSQL, invite-only member authentication and the real Serper API. It verified unauthenticated denial, short-query rejection, and three source-linked results through the authenticated route for a synthetic query; the temporary test member was cleaned up.
- The earlier 403 is a resolved local credential failure. Rendered desktop/compact search states, market coverage and supplier verification have not passed acceptance. The browser access host was unavailable during this pass, so the new UI was not visually inspected.

### 31 October 2026 — PayPal Developer sandbox preparation

- The existing adapter supports server-side OAuth client credentials, Orders v2 create/get/capture, idempotency headers, exact minor-unit formatting, and webhook signature verification. Local contract tests pass with a fetch stub.
- Added `npm run test:paypal:sandbox`, which creates a synthetic USD 1.00 sandbox order and reads it back as `CREATED`. It intentionally does not approve or capture the order.
- `PAYPAL_CLIENT_ID` and `PAYPAL_CLIENT_SECRET` are currently empty in the private `.env`, so the Developer sandbox smoke gate has not run. Fixture mode remains the default and external execution remains disabled.
