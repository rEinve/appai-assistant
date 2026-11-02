# M0 Capability Decision Record

Status: **CLOSED (Sandbox & Capability Gates Verified; Live Execution Off)**  
Date: 2 November 2026  
Authority: `A-P-P-A-I-agent-product-implementation-plan.md` M0 (`AC-02`, `AC-12`, `AC-17`)

## Owner-confirmed product directions (30 October 2026)

- PayPal is the only initial payment rail. Cash, Bitcoin, direct-card payment and other rails are not part of the first payment path; alternatives may be investigated later.
- The Appai "wallet" means non-custodial budget pockets, authorization checks, reservations and a spend ledger. Appai does not hold member funds or issue a prepaid card.
- The member flow is prompt-first. Budgets provide a hard maximum, optional validity dates and preferred suppliers; linked instructions inherit and can narrow those limits.
- Supplier discovery is category/area based and member-workspace only. Each member's purchase history remains private; no member-to-member list sharing or public supplier website is planned.

## Verified M0 capability & role matrix (`AC-02`, `AC-12`, `AC-17`)

Migration `013_m0_capability_and_mandates.sql` persists the canonical M0 adapter capabilities (`vendor_adapters`), owner-bound provider accounts (`vendor_accounts`), funding mandates (`funding_mandates`), one-use OAuth/consent sessions (`connection_sessions`), and verified webhook events (`provider_events`).

| Adapter / Area | Environment | Buyer / Caller / Payee Roles | Capabilities & Boundaries | Verification Evidence |
| --- | --- | --- | --- | --- |
| `local-fixture` | `FIXTURE` | Buyer: `AUTHENTICATED_MEMBER_FIXTURE_BUYER`<br>Caller: `APPAI_FIXTURE_ADAPTER`<br>Payee: `FIXTURE_MERCHANT` | Synthetic quote/review/observation only (`execution_enabled = false`, `reservationSupported = false`). Labeled in UI as local fixture only. | `npm run test:m0`, `npm run test:m1:workflow` |
| `paypal-sandbox` | `SANDBOX` | Buyer: `AUTHENTICATED_MEMBER_PAYPAL_BUYER`<br>Caller: `APPAI_OAUTH_CLIENT_CREDENTIALS`<br>Payee: `VERIFIED_SANDBOX_MERCHANT` | Orders v2 create, get, capture (`INTENT=CAPTURE`), webhook signature verification (`provider_events`). `unattendedExecutionSupported = false`, `reservationSupported = false`, `execution_enabled = false`. | `npm run test:paypal` (3/3 pass), `npm run test:m0`, `npm run test:paypal:sandbox` (`45Y59709AF822120F`), webhook `3FF5509794937781L` |
| `serper-discovery` | `SANDBOX` | Buyer: `AUTHENTICATED_MEMBER`<br>Caller: `APPAI_SERVER_ADAPTER`<br>Payee: `NONE_READ_ONLY_DISCOVERY` | Read-only organic discovery (`maxResults = 3`, rate-limited). Never creates quotes, supplier records, or payment operations (`execution_enabled = false`). | `npm run test:m0`, `npm run test:search:live` |
| `webmcp-browser-host` | `SANDBOX` | Buyer: `AUTHENTICATED_MEMBER_BROWSER_SESSION`<br>Caller: `WEBMCP_FOREGROUND_HOST`<br>Payee: `MERCHANT_CHECKOUT_ORIGIN` | Foreground browser-assisted host only (`requiresOpenUi = true`, `unattendedExecutionSupported = false`). Closed-phone or unattended requests deterministically return `409 ACTION_REQUIRED` (`WEBMCP_REQUIRES_FOREGROUND_SESSION`). | `npm run test:m0` (`AC-12`) |

## M0 acceptance gate verification (`npm run test:m0`)

1. **`AC-02` (Real Vendor & Payment Capability Gate)**:
   - `GET /api/v1/capabilities` exposes the PostgreSQL `vendor_adapters` capability matrix, `PAYPAL_M0_CAPABILITY` buyer/caller/payee roles, `liveExecutionEnabled: false`, and explicit pre-purchase reservation boundaries.
   - `POST /api/v1/connections/:adapterKey/begin` and `POST /api/v1/connections/:adapterKey/callback` implement one-use state-token consent sessions (`connection_sessions.state_digest` + `consumed_at`), replay rejection (`409 CONNECTION_SESSION_ALREADY_CONSUMED`), and owner-scoped `vendor_accounts` + `funding_mandates` creation with explicit `buyer_role`, `caller_role`, and `payee_role`.
   - `POST /api/demo/paypal/webhooks` verifies webhook signatures and idempotently records verified events in `provider_events` (`ON CONFLICT (adapter_id, environment, external_event_id) DO NOTHING`).
2. **`AC-12` (Closed Phone, Session Expiry & Mandate Revocation)**:
   - **Closed-UI WebMCP**: `POST /api/v1/capabilities/check` with `adapterKey: 'webmcp-browser-host'` and `uiClosed: true` (or `unattended: true`) returns `409 { code: 'ACTION_REQUIRED', reason: 'WEBMCP_REQUIRES_FOREGROUND_SESSION' }`.
   - **Pre-dispatch session expiry**: `POST /api/v1/connections/:id/expire-session` marks `vendor_accounts.session_status = 'EXPIRED'`, blocks queued `READY`/`RETRY_WAIT` `RUN_OCCURRENCE` and `OBSERVE` jobs with `last_error_code = 'REAUTH_REQUIRED'`, and worker-side `processOccurrence`/`processObservation` independently enforce `REAUTH_REQUIRED` before any quote or operation is created.
   - **Mandate revocation before & after dispatch**: `POST /api/v1/connections/:id/revoke` marks `funding_mandates.status = 'REVOKED'`, blocks future `RUN_OCCURRENCE` and `OBSERVE` jobs with `MANDATE_REVOKED`, while preserving in-flight `RECONCILE` and `CANCEL_RECONCILE` jobs so reconciliation completes cleanly (`SUCCEEDED`).
3. **`AC-17` (Pre-Purchase Reservation Boundary)**:
   - `assertPayPalOperationSupported` and `POST /api/v1/capabilities/check` deterministically reject `HOLD`, `AUTHORIZE`, `CAPTURE_HOLD`, `VOID_HOLD`, `DEPOSIT`, `BID`, and `ESCROW` with `422 { code: 'CAPABILITY_UNSUPPORTED' }`, and reject unknown or disabled adapters/categories with `422 CAPABILITY_UNSUPPORTED`.

## Live execution boundary

- All adapters keep `execution_enabled = false` and `liveExecutionEnabled = false` throughout M0, M1, and M2.
- Enabling external sandbox/live execution remains gated on Milestone M2 (`AC-04`, `AC-05`, `AC-06`, `AC-11`), Milestone M3 (`AC-07`, `AC-08`, `AC-09`, `AC-10`), and Milestone M4 (`AC-13`–`AC-16`, `AC-18`).
