# M5 Pilot Readiness and Operations Runbook

Date: 2 November 2026
Scope: M5 (`AC-01`–`AC-21`)
Current gate: Local PostgreSQL and deterministic fixture operation only. `liveExecutionEnabled` must remain `false`.

## Acceptance and capability status

| Acceptance | Local fixture / PostgreSQL status | External status and limit |
|---|---|---|
| AC-01 | FIXTURE_PASSED — member auth and owner isolation | Production email verification and recovery delivery are not configured |
| AC-02 | FIXTURE_PASSED — capability gate and operator controls | Live execution remains disabled |
| AC-03 | FIXTURE_PASSED — schedule matrix, DST and missed-tick recovery | Provider execution not established |
| AC-04 | FIXTURE_PASSED — discovery workflow | Search is read-only |
| AC-05 | FIXTURE_PASSED — quote validation | No real merchant checkout |
| AC-06 | FIXTURE_PASSED — member review and approval | Approval does not authorize an unsupported provider flow |
| AC-07 | FIXTURE_PASSED — atomic reservation | Local fixture only |
| AC-08 | FIXTURE_PASSED — stable execution identity | Live payment disabled |
| AC-09 | FIXTURE_PASSED — reconciliation behavior | No live provider reconciliation |
| AC-10 | FIXTURE_PASSED — financial conservation | Fixture evidence only |
| AC-11 | FIXTURE_PASSED — notifications and inbox | Real push transport blocked |
| AC-12 | FIXTURE_PASSED — member lifecycle and mandate records | Real payment mandate execution blocked |
| AC-13 | FIXTURE_PASSED — delivery retry and inbox persistence | Real push transport blocked |
| AC-14 | FIXTURE_PASSED — isolation, redaction and untrusted input handling | External supplier evidence is not guaranteed |
| AC-15 | FIXTURE_PASSED — cancellation and refund state handling | Vendor cancellation API blocked |
| AC-16 | FIXTURE_PASSED — operator recovery, immutable audit and backup rehearsal | Production restore rehearsal must be run in the target environment |
| AC-17 | FIXTURE_PASSED — capability and live execution gates | Unsupported capabilities remain blocked |
| AC-18 | FIXTURE_PASSED — step-up and account deactivation controls | Production identity delivery and TLS still require setup |
| AC-19 | FIXTURE_PASSED — assistant refinement boundary | Model availability depends on configured credentials |
| AC-20 | FIXTURE_PASSED — prompt-first member journey and read-only Planner | Live balances and payment-derived status unavailable |
| AC-21 | FIXTURE_PASSED — local reservation/execution safety | Live checkout is not enabled |

The live manifest at `GET /api/v1/operator/pilot-readiness` is authoritative for the current database state. It reports the `LIVE` adapter execution gate, worker/job health data, open circuit breakers, global execution control and unresolved financial liabilities.

| Adapter or workflow | Status | Scope |
|---|---|---|
| `local-fixture` | FIXTURE_PASSED | Deterministic simulated purchase; no external charge |
| `paypal-sandbox` | SANDBOX_PASSED / EXECUTION_DISABLED | Orders and webhook contract only; sandbox credentials are isolated from live credentials |
| `serper-discovery` | SANDBOX_PASSED | Read-only search; results are not verified quotes |
| `webmcp-browser-host` | BLOCKED | Requires foreground UI action; unavailable when the UI is closed |
| Holds, authorize/capture/void, deposits, bids, escrow | BLOCKED | Unsupported payment authority |
| Real bill autopay and accommodation booking | BLOCKED | No approved provider execution adapter |
| Real push delivery and vendor cancellation API | BLOCKED | Local state/retry behavior only |

## Environment and credential inventory

Set values in a protected environment file or secret manager. Never commit `.env`, passwords, tokens, or provider keys.

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection for API, worker and migrations |
| `BETTER_AUTH_SECRET` | Better Auth signing/encryption secret; use at least 32 characters and rotate through a planned session invalidation |
| `BETTER_AUTH_URL`, `WEB_APP_ORIGIN`, `TRUSTED_ORIGINS` | Auth callback base and browser origin allowlist; production values must use HTTPS |
| `APPAI_OPERATOR_EMAILS`, `APPAI_OPERATOR_MEMBER_IDS` | Explicit operator allowlist; keep membership minimal and review changes |
| `APPAI_REQUIRE_STEP_UP` | Set `true` to require recent password confirmation for sensitive budget, mandate, operator, and deactivation actions |
| `APPAI_EXECUTION_MODE` | Leave unset for normal operation; `local-sandbox` enables only the local deterministic adapter |
| `PAYPAL_DEMO_MODE` | `fixture` by default; `sandbox` only with PayPal Developer sandbox credentials |
| `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_WEBHOOK_ID` | Sandbox-only PayPal app and webhook configuration; do not reuse live credentials |
| `SEARCH_PROVIDER`, `SERPER_API_KEY` | Optional read-only Serper search configuration |
| `GEMINI_API_KEY`, `GEMINI_MODEL` | Optional assistant refinement model configuration |
| `APP_PORT`, `WORKER_ID`, `WORKER_POLL_MS`, `WORKER_BATCH_SIZE`, `WORKER_LEASE_MS`, `WORKER_NO_AUTO_RUN` | API and worker runtime settings |

## Migration and database backup/restore

Apply additive migrations with `npm run db:migrate` after verifying the target `DATABASE_URL`. Migration 018 installs append-only triggers on `audit_events` and `budget_entries`; operator and application code must not edit or delete those histories.

Create a compressed full-database checkpoint from a host with PostgreSQL client tools:

```sh
pg_dump --no-owner --no-acl --format=custom --file=appai-checkpoint-$(date -u +%Y%m%dT%H%M%SZ).dump "$DATABASE_URL"
```

Restore into a newly created, isolated database first. Do not restore over the active database as a rollback shortcut:

```sh
createdb --maintenance-db "$DATABASE_URL" appai_restore_check
pg_restore --no-owner --no-acl --dbname "$APP_AI_RESTORE_DATABASE_URL" appai-checkpoint.dump
```

Set `APP_AI_RESTORE_DATABASE_URL` to the restore database connection. After restore, verify schema migration 018, the global execution switch, all `LIVE` adapters disabled, active reservation and unresolved-operation counts, stable request keys, outbox dedupe identities, and `api_idempotency` references. Restart the worker only after those checks. Resume unresolved operations through `/api/v1/operator/recovery`; never repair balances by direct ledger edits. Keep the checkpoint until the restored system is reconciled.

The automated `npm run test:m5` rehearsal uses `pg_dump`/`pg_restore` into a temporary database, compares operation, active reservation, attempt, outbox and idempotency counts, then drops the temporary database and dump.

## Operator endpoints and incident response

- `GET /api/v1/operator/pilot-readiness`: release capability and liability manifest.
- `GET /api/v1/operator/recovery`: unresolved operations, active reservations, open breakers, global execution control and blocked/retrying jobs.
- `POST /api/v1/operator/execution-switch`: pause new local dispatch when investigating. Requires a reason and step-up when configured or requested.
- `POST /api/v1/operator/adapters/:key/circuit-breaker`: open an adapter breaker with a reason; investigate and verify before closing it.
- `POST /api/v1/operator/retention/run`: run safe operational-artifact pruning. Requires operator access and fresh password confirmation when step-up is enabled/requested. The run records counts in `data_retention_runs` and an audit event.
- `POST /api/v1/auth/step-up`: confirm the current member password; the verification expires after 15 minutes and is bound to a digest of the current auth session.
- `POST /api/v1/me/deactivate-account`: stop future instructions and queued observe/run jobs, revoke mandates and vendor accounts, revoke auth sessions, and retain in-flight reconciliation and financial history.

For a suspected duplicate dispatch, unknown charge, or stuck reconciliation:

1. Pause new execution and open the relevant adapter circuit breaker.
2. Capture the readiness and recovery responses and preserve database logs.
3. Identify operation, reservation, attempt, order and stable request key through the owner-scoped records.
4. Allow `RECONCILE` or `CANCEL_RECONCILE` to finish, or follow the provider's verified recovery process. Do not delete or alter financial rows.
5. Reopen execution only after the liability is resolved and the operator has recorded the reason.

## Pilot enablement gate

- [ ] Run migrations and `npm run test:m5` against an isolated local PostgreSQL database.
- [ ] Run the documented regression commands and record environment, fixture/sandbox mode, output and commit evidence.
- [ ] Configure production TLS, trusted origins, email verification/recovery and secret storage before inviting pilot members.
- [ ] Confirm operator allowlist owners and step-up requirement.
- [ ] Verify `/api/v1/operator/pilot-readiness` reports `liveExecutionEnabled: false` and every `LIVE` adapter has `execution_enabled: false`.
- [ ] Confirm pilot scope uses only explicitly supported capabilities and communicates blocked workflows.
- [ ] Obtain separate owner authorization and capability evidence before any live payment activation. This runbook does not enable live execution.
