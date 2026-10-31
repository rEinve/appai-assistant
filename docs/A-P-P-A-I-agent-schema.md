# A-P-P-A-I schema and persistence specification

Version: **1.1** · 29 October 2026  
Status: Implementation contract for migrations, not an executed database.  
Authority: [technical requirements v1.1](A-P-P-A-I-agent-technical-requirements-document.md). Original v1.0 illustrative DDL is archived and must not be used as a migration.

## 1. Common conventions

PostgreSQL is the source of truth. Primary/domain foreign IDs use UUID; opaque vendor/provider IDs use text. Every user-owned aggregate carries owner_id. Use composite foreign keys or equivalent database-enforced ownership constraints so an operation cannot reference a different user's instruction, quote, approval, mandate or budget. All money is BIGINT minor units with ISO currency and configured scale, serialized as decimal strings; prohibit negative amounts except explicit signed ledger deltas. All instants are TIMESTAMPTZ; schedule timezone is IANA text. JSONB category/schedule payloads must validate against versioned domain schemas, not arbitrary model output.

Common mutable aggregates include version BIGINT ≥1, created_at and updated_at. Compare-and-swap guards updates. Application enums/text-check constraints use only the canonical values in the technical document. Use SQL NULL or omitted NOT NULL, never the old `NULLABLE` keyword. Retain external identity/history across user deactivation; no cascade deletion of unresolved financial records. Data retention/deletion is a documented policy before live pilot.

## 2. Entity contract

### users and user_settings

- users: id, identity_provider_subject UNIQUE NOT NULL, active, created_at. This historical column stores the stable Better Auth user ID for local accounts; application tables keep `users.id` as their UUID owner key. Better Auth owns credential and session tables, not this app table. Provision the mapping idempotently and never let a browser choose it.
- user_settings: owner_id PK/FK, timezone, enabled_currency, currency_scale, version, notification_preferences, timestamps.
- Sensitive contact/profile data uses field encryption where needed; encrypted lookup requirements use a keyed lookup digest rather than pretending randomized ciphertext has meaningful email uniqueness. Secret keys are outside the database.
- No default live budget, currency, merchant or purchasing authority is inserted without explicit configuration.

### Local authentication storage

- Generate Better Auth `user`, `account`, `session` and `verification` SQL from the pinned library configuration. Review names and UUID/text ID types before applying alongside the existing `users` table; avoid collision by keeping the library table name distinct or configuring names explicitly.
- Better Auth user ID maps uniquely to `users.identity_provider_subject`; no duplicate app user is created on repeated login. Keep sessions in PostgreSQL and use library revocation. Do not duplicate password hashes or session tokens in application tables.
- Invite-only enrollment creates a member through the library then the app-user mapping. A partial failure is retried idempotently; private API access fails until both records agree. Recovery and email-verification records use library expiry and one-use semantics.

### vendor_adapters and vendor_accounts

- vendor_adapters: id UUID, adapter_key/version/environment UNIQUE, capability JSONB, allowed_origins JSONB, enabled flag, execution_enabled default false, health/status timestamps.
- vendor_accounts: id, owner_id, adapter_id, external_account_ref, category scope, credential_store_ref nullable, session_status, session_checked_at, reauth_reason nullable, version. UNIQUE(owner_id, adapter_id, external_account_ref).
- References identify isolated secrets/browser profiles, never plaintext access tokens/cookies in JSON. Account ownership must be checked before any task uses it.

### supplier_catalogue and member_suppliers

- `supplier_catalogue`: system-level provider identity, names/aliases, service categories, service-area coverage, public source references, source-checked time, and separate discovery/payment capability states. Catalogue visibility is authenticated-member-only; it is not a public website. A provider claim or public listing is not verified checkout capability.
- `member_suppliers`: owner-scoped relationship to a catalogue provider or a member-entered provider; private name, categories, service areas, notes, first/last confirmed use, and relationship evidence. A verified completed real purchase may update only that member's history. Fixture operations never create a real relationship.
- `budget_supplier_preferences`: owner_id, budget_id, member_supplier_id, preference rank, created_at. Enforce owner-bound composite foreign keys. A budget can prefer suppliers only from its owner's private supplier set; selecting a preferred supplier affects search ranking, not purchase authorization.
- `supplier_catalogue`: system-owned names/aliases, supported categories and service areas, source evidence and checked time, separate discovery/payment capability states. Unverified or inactive entries must never be presented as approved purchasing paths. Catalogue entries are returned only inside the signed-in member workspace.
- Never expose a member's identity, supplier history, instructions, budgets, receipts or relationship evidence to other members. Member-to-member supplier-list sharing is out of scope.

### funding_mandates

- id, owner_id, adapter_id, vendor_account_id nullable, provider_agreement_ref, credential_store_ref nullable, status, allowed_payees/category constraints, currency, maximum_total_minor where supported, valid_from/until, revoked_at, version.
- status values: PENDING, ACTIVE, REAUTH_REQUIRED, REVOKED, EXPIRED. Local revocation takes effect before external revocation completes; track external revoke result separately.
- An ACTIVE application record must be backed by the selected integration's actual authorization. Neither a budget allocation nor a stored provider reference alone makes it active.

### connection_sessions and fulfillment_profiles

- connection_sessions: id, owner_id, adapter_id, state_digest UNIQUE, protected_verifier_ref nullable, requested_scope, expires_at, consumed_at nullable and resulting account/mandate refs. Bind consent to the starting user/session and allow one callback completion; no usable secrets in redirects or audit data. Integration-specific callback verification is mandatory.
- fulfillment_profiles: id, owner_id, kind ADDRESS/GUEST/SERVICE_BENEFICIARY, encrypted_details, safe_label, version, timestamps. Validate typed details before quoting; historical quote snapshots retain the version used. Keep guest/account/PII payloads outside model/logging where not necessary. Quote beneficiary/destination refs must belong to the same owner.

### budgets, budget_policies and budget_windows

- budgets: id, owner_id, name, currency, allocation_limit_minor >0, optional starts_at/ends_at with timezone_snapshot, active, version, timestamps. Multiple instructions may share one allocation; their combined liability is checked against it. Budget dates constrain linked instructions.
- budget_policies: id UUID PK, owner_id, currency, per_order_hard_limit_minor >0, daily_limit_minor >0, unit_limit_minor nullable, soft_review_threshold_minor nullable, timezone, version; UNIQUE(owner_id, currency). Optional fields are absent when not used; reject contradictory configured thresholds. No generic approval overrides a hard limit.
- budget_windows: id, owner_id, policy_id, local_date, timezone_snapshot, starts_at, ends_at, policy_version. UNIQUE(policy_id, starts_at, ends_at); CHECK ends_at > starts_at. Retain old windows when timezone changes.
- Budgets/windows act as deterministic lock targets. Derived balances are computed from reservations/entries; stored cached totals require transactional update plus reconciliation, never an independent authority.

### procurement_instructions

- id, owner_id, exact user prompt text, kind, nullable category while DRAFT, mode, state, structured_constraints JSONB, constraints_schema_version, allowed_payees JSONB, max_total_minor >0 when configured, currency, budget_id, funding_mandate_id nullable, vendor_account_id nullable.
- valid_from/until, timezone_snapshot, schedule_config JSONB nullable, watch_config JSONB nullable, next_run_at nullable, completion_limit >0 (nullable only for RECURRING_BILL with finite valid_until), fulfilled_count ≥0, permission_version ≥1, version, blocked_reason nullable, raw_prompt_ref nullable, timestamps.
- kind/mode/state values match technical requirements. Preserve the prompt on the DRAFT before category resolution. Collect missing supplier-specific fields after supplier selection rather than requiring Appai-authored category forms. A DRAFT may remain unclassified and incomplete; enforce `state = 'DRAFT' OR category IS NOT NULL`. ACTIVE purchasing instructions require a resolved category, complete constraints, explicit allocation and supported authority. Drafts and NOTIFY_ONLY can exist without mandate.
- mode values are PRE_APPROVED, REVIEW_REQUIRED and NOTIFY_ONLY; enforce this domain in the database as well as API validation. A quote below the budget cap does not change REVIEW_REQUIRED to PRE_APPROVED.
- One-time/watch default completion_limit=1. Recurring bills have a validity/end rule and one purchase per obligation. Add CHECK valid_until > valid_from and fulfilled_count ≤ completion_limit where a finite count applies.
- A linked budget supplies currency, hard maximum, optional date bounds and preferred suppliers. An instruction may narrow dates or set a lower maximum; it cannot exceed the budget. Do not create a minimum purchase amount. Preserve the prompt verbatim and keep extracted constraints/version separate so members can review or correct the interpretation.
- Index active next_run_at; owner/state; budget_id. Increment permission_version on mode, scope, payee, budget, validity or policy-impacting edits; invalidate pending older approvals.

### instruction_occurrences and procurement_obligations

- instruction_occurrences: id, owner_id, instruction_id, schedule_version, due_at, local_occurrence_key, state, timestamps. UNIQUE(instruction_id, local_occurrence_key); local occurrence identity is independent of retry time.
- procurement_obligations: id, owner_id, instruction_id, occurrence_id nullable, obligation_key, category, vendor_account_id nullable, external_invoice_ref nullable, external_cycle_ref nullable, fulfillment_slot, satisfied_at nullable, version.
- UNIQUE(instruction_id, obligation_key). One-time/watch fulfillment slots remain stable across candidate changes; bill obligations derive from verified vendor invoice/cycle.
- UNIQUE(vendor_account_id, external_invoice_ref) when invoice is present; equivalent vendor cycle uniqueness when supported and invoice absent. This prevents two instructions from paying the same invoice. Without reliable cross-instruction bill identity, auto-pay is unsupported.

### jobs

- id, owner_id, instruction_id nullable, operation_id nullable, job_type, dedupe_key UNIQUE, payload_version, payload references JSONB, state, run_at, attempts, max_attempts, lease_owner nullable, lease_expires_at nullable, lease_generation, last_error_code nullable, timestamps.
- Types: OBSERVE, RUN_OCCURRENCE, RECONCILE, NOTIFY, CANCEL_RECONCILE. Canonical states: READY, RUNNING, SUCCEEDED, RETRY_WAIT, BLOCKED, DEAD.
- Partial index on (run_at, id) for READY/RETRY_WAIT; index lease_expires_at for RUNNING. Claim/renew/complete with generation fencing. Immutable dedupe identity ties a job to domain work rather than a random retry ID.
- No raw credentials or arbitrary executable URLs in payloads. Pausing instruction suppresses future observe/execute jobs but not financial recovery.

### offer_observations

- id, owner_id, instruction_id, adapter_id, source_offer_key, material_fingerprint, observed_at, freshness_until, normalized_details JSONB, source_url, diagnostic_ref nullable.
- UNIQUE(instruction_id, source_offer_key, material_fingerprint) for notification deduplication; repeated observations can update last_seen separately.
- Observation is not a payable quote. Price/stock changes remain versioned evidence. Keep bounded/redacted raw source outside the execution contract and according to retention policy.

### purchase_operations and vendor_quotes

- purchase_operations: id, owner_id, instruction_id, obligation_id, state, selected_quote_id nullable, permission_version, policy_version, execution_key UNIQUE, reservation_id nullable, dispatch_started_at nullable, outcome_reason nullable, cancellation_state/details nullable, version, timestamps.
- Partial UNIQUE(obligation_id) for states DISCOVERING, QUOTED, AWAITING_APPROVAL, READY, RESERVED, SUBMITTING, RECONCILING, BLOCKED, SUCCEEDED, CANCEL_REQUESTED. Terminal failure/expiry/pre-submission cancellation may allow a replacement candidate after reconciliation; a satisfied obligation remains satisfied until an explicit user-directed replacement need exists.
- vendor_quotes: id, owner_id, operation_id, adapter_id/version, merchant/payee ref, external_quote_ref, category, schema_version, typed_details JSONB, currency, subtotal_minor, tax_minor, fees_minor, shipping_minor, discount_minor, total_minor >0, quantity >0, terms_hash, content_hash, verified_at, expires_at.
- CHECK nonnegative monetary components and subtotal + tax + fees + shipping - discount = total; CHECK expires_at > verified_at. Quotes immutable after insertion. Operation's selected quote must belong to it; enforce at DB level.
- PRODUCT details require SKU/variant/destination/delivery/stock; BILL requires account/invoice-or-cycle/due/unpaid evidence; ACCOMMODATION requires property/room/rate/dates/occupancy/guest/terms. Validate them with strict category schemas in application and migration constraints where practical.

### approvals

- id, owner_id, operation_id, quote_id, quote_hash, permission_version, policy_version, status, expires_at, decided_at nullable, consumed_at nullable, decision_actor_ref nullable, version.
- Status PENDING, APPROVED, REJECTED, EXPIRED, INVALIDATED. At most one PENDING approval per operation; no second consumption. APPROVED records consumed_at atomically at dispatch.
- Cross-object owner/operation checks and quote binding enforced. Reject expired, stale-version, wrong-user and replayed decisions even if a push link is still available. A separate API idempotency record permits exact same decision retry to return the first result.

### budget_reservations and budget_entries

- budget_reservations: id, owner_id, operation_id UNIQUE, budget_id, budget_window_id, currency, amount_minor >0, status ACTIVE/COMMITTED/RELEASED, created_at, committed_at nullable, released_at nullable, investigate_after nullable.
- budget_entries: id, owner_id, budget_id, budget_window_id, operation_id, kind SPEND/REFUND, amount_minor >0, currency, external_event_key UNIQUE, posted_at. Refunds must reference original spend and cannot cumulatively exceed confirmed eligible spend.
- Every reservation/spend/refund must match budget/operation ownership and currency. Committing a reservation inserts SPEND once. Releasing a reservation without external proof is prohibited for uncertain submissions.
- Budget availability = allocation limit - (SPEND - confirmed REFUND) - ACTIVE reservations. Daily checks include window spend and active reservations, including unresolved earlier-window liability as described in the technical requirements. No double-count of COMMITTED reservations and their SPEND entries.

### execution_attempts, external_orders and provider_events

- execution_attempts: id, owner_id, operation_id, adapter_id/version/environment, stable_request_key UNIQUE, status PREPARED/SUBMITTING/UNKNOWN/CONFIRMED_SUCCESS/CONFIRMED_FAILURE, provider_payment_ref nullable, credential_handoff_ref nullable, requested_total_minor/currency, submitted_at nullable, last_checked_at nullable, safe_error nullable, version.
- MVP: UNIQUE(operation_id) for a financially mutating attempt. Transport retries reuse that attempt/key. A new attempt after definitive failure requires a documented supported recovery rule, not an automatic new key.
- external_orders: id, owner_id, operation_id, adapter_id/environment, vendor_order_ref, vendor_status, payment_status, verified_at, sanitized_receipt JSONB. UNIQUE(adapter_id, environment, vendor_order_ref).
- provider_events: id, adapter_id/environment, external_event_id, signature_verified, received_at, redacted_payload, processed_at nullable. UNIQUE(adapter_id, environment, external_event_id). Store verified events before acknowledgement; reconcile out-of-order events against current authoritative status rather than regressing success.
- Preserve nullable external refs to represent a crash before response. A recovered worker queries status via stable identity. If impossible, remain UNKNOWN with operational action.

### cancellations and refunds

- cancellations: id, owner_id, operation_id, stable_request_key UNIQUE, adapter_request_ref nullable, status REQUESTED/PENDING/CONFIRMED/REJECTED, requested_at, resolved_at nullable, terms_snapshot_ref.
- refunds: id, owner_id, operation_id, external_ref UNIQUE, expected_amount_minor, confirmed_amount_minor, currency, status PENDING/CONFIRMED/FAILED, last_checked_at. UNIQUE ledger key per confirmed refund event/amount posting; partial refunds use distinct external events.
- Confirmed cancellation is not automatically confirmed refund. Only confirmed financial recovery updates budget entries.

### notifications, outbox_events and api_idempotency

- notifications: id, owner_id, operation_id nullable, instruction_id nullable, event_key UNIQUE, type, safe_content JSONB, action_ref nullable, created_at, read_at nullable. Durable inbox exists before push delivery.
- push_subscriptions: id, owner_id, transport, protected_endpoint_ref, status, timestamps; revoke when device unsubscribes. Transport-specific credentials kept protected.
- notification_deliveries: id, notification_id, device_subscription_id, stable_delivery_key UNIQUE, status QUEUED/SENT/ACKNOWLEDGED/FAILED, attempts, next_retry_at, safe_error nullable, timestamps. SENT is not proof of human viewing.
- outbox_events: id UUID, aggregate_type/id, aggregate_version, event_type, schema_version, owner_id, occurred_at, payload references JSONB, published_at nullable, delivery_attempts. UNIQUE(aggregate_type, aggregate_id, aggregate_version, event_type).
- api_idempotency: actor_id, route_scope, key, request_hash, result_ref/sanitized response, state and retention_until. UNIQUE(actor_id, route_scope, key); reject same key with different request. Retention must cover the operation's retry/recovery window; never prune financially unresolved identities.

### audit_events

- id UUID, actor_type/id, owner_id, instruction_id/operation_id nullable, action, old/new version/state, safe reason, correlation_id, occurred_at. No usable tokens/raw payment payloads.
- Application role is append-only; access and retention are explicit. Do not call ordinary tables cryptographically immutable or partitioned unless those mechanisms are implemented and verified.

## 3. Required transactional boundaries

1. Activate/change/revoke instruction: update version and authority, invalidate stale approvals, fence future jobs, append audit and outbox atomically. Already dispatched operations retain recovery jobs.
2. Create occurrence/obligation: unique domain keys, operation creation and job enqueue in one transaction. Conflicting bill identity across instructions blocks duplicate work.
3. Approve/reject: lock current approval/operation, validate owner/hash/expiry/versions, compare-and-swap decision, enqueue next job and outbox together. Approval does not capture payment.
4. Reserve: lock obligation, budget and policy/window in consistent order; recompute exact spend plus liability; create reservation and READY → RESERVED together. Concurrent aggregate limits cannot be checked outside this transaction.
5. Dispatch: short lock of instruction/operation, recheck current authority, consume approval and persist SUBMITTING/execution identity before external I/O. Lease expiry does not grant another dispatch.
6. Apply result: deduplicate external evidence, persist order/payment outcome, commit/release/retain reservation, update obligation/instruction completion and emit receipt/outbox together.
7. Refund/cancel: preserve separate vendor and payment states; post confirmed refund at most once; never erase original spend history.

## 4. Migration and verification requirements

Implementation agent generates actual migrations and schema validation from these contracts. Validate from empty database, upgrade from the implementation's prior schema and restore from backup. There is no existing v1.0 database assumed to migrate. Test owner isolation, invalid money/date/category values, uniqueness races, rollback of failed transactions and forward-compatible deployment. Do not rely solely on ORM validation for financial uniqueness or ownership.

DB fixtures use valid UUIDs, explicit test currency and non-secret external references. Simulate midnight, timezone edits, concurrent reservations, lost responses and duplicate callbacks. Full acceptance mapping is in [DEVELOPMENT-ACCEPTANCE.md](DEVELOPMENT-ACCEPTANCE.md).

## 5. Event envelope

Each outbox event carries event_id UUID, event_type, schema_version, occurred_at, owner_id, aggregate_id/version, correlation_id and minimal reference payload. Initial types: instruction.activated/changed/revoked, observation.matched, approval.requested/decided, budget.reserved, execution.submitted, operation.pending/succeeded/failed, cancellation.updated, refund.confirmed and notification.requested. At-least-once delivery is assumed; consumers deduplicate event_id and enforce allowed state transitions. No Kafka-specific topic contract is required.

## 6. Deferred pre-purchase model

No executable merchant holds, bid records or token-minting tables are required for MVP. Later add merchant_reservations and payment_authorizations with independent IDs/expiry and a hold-liability ledger. Existing opaque adapter refs and separate order/payment states provide the boundary; a payment authorization must not masquerade as a vendor reservation.
