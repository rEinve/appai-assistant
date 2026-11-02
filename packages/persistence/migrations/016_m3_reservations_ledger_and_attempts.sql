-- M3 atomic budget enforcement and recoverable local sandbox execution.
-- This migration does not enable LIVE adapter execution.

CREATE TABLE IF NOT EXISTS budget_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES users(id),
  currency char(3) NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  per_order_hard_limit_minor bigint NOT NULL CHECK (per_order_hard_limit_minor > 0),
  daily_limit_minor bigint NOT NULL CHECK (daily_limit_minor > 0),
  unit_limit_minor bigint CHECK (unit_limit_minor IS NULL OR unit_limit_minor > 0),
  soft_review_threshold_minor bigint CHECK (soft_review_threshold_minor IS NULL OR soft_review_threshold_minor > 0),
  timezone text NOT NULL,
  version bigint NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_id, currency),
  UNIQUE (owner_id, id),
  CHECK (per_order_hard_limit_minor <= daily_limit_minor),
  CHECK (unit_limit_minor IS NULL OR unit_limit_minor <= per_order_hard_limit_minor),
  CHECK (soft_review_threshold_minor IS NULL OR soft_review_threshold_minor <= per_order_hard_limit_minor)
);

CREATE TABLE IF NOT EXISTS budget_windows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES users(id),
  policy_id uuid NOT NULL,
  local_date text NOT NULL CHECK (local_date ~ '^\d{4}-\d{2}-\d{2}$'),
  timezone_snapshot text NOT NULL,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  policy_version bigint NOT NULL CHECK (policy_version >= 1),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_id, id),
  UNIQUE (policy_id, starts_at, ends_at),
  FOREIGN KEY (owner_id, policy_id) REFERENCES budget_policies(owner_id, id),
  CHECK (ends_at > starts_at)
);

CREATE TABLE IF NOT EXISTS budget_reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES users(id),
  operation_id uuid NOT NULL,
  budget_id uuid NOT NULL,
  budget_window_id uuid,
  currency char(3) NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  amount_minor bigint NOT NULL CHECK (amount_minor > 0),
  status text NOT NULL CHECK (status IN ('ACTIVE', 'COMMITTED', 'RELEASED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  committed_at timestamptz,
  released_at timestamptz,
  investigate_after timestamptz,
  UNIQUE (operation_id),
  UNIQUE (owner_id, id),
  FOREIGN KEY (owner_id, operation_id) REFERENCES purchase_operations(owner_id, id),
  FOREIGN KEY (owner_id, budget_id) REFERENCES budgets(owner_id, id),
  FOREIGN KEY (owner_id, budget_window_id) REFERENCES budget_windows(owner_id, id),
  CHECK ((status = 'ACTIVE' AND committed_at IS NULL AND released_at IS NULL)
      OR (status = 'COMMITTED' AND committed_at IS NOT NULL AND released_at IS NULL)
      OR (status = 'RELEASED' AND released_at IS NOT NULL AND committed_at IS NULL))
);
CREATE INDEX IF NOT EXISTS budget_reservations_active_budget_idx
  ON budget_reservations(owner_id, budget_id, created_at) WHERE status = 'ACTIVE';
CREATE INDEX IF NOT EXISTS budget_reservations_active_window_idx
  ON budget_reservations(owner_id, budget_window_id, created_at) WHERE status = 'ACTIVE';

CREATE TABLE IF NOT EXISTS budget_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES users(id),
  budget_id uuid NOT NULL,
  budget_window_id uuid,
  operation_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('SPEND', 'REFUND')),
  amount_minor bigint NOT NULL CHECK (amount_minor > 0),
  currency char(3) NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  reference_spend_entry_id uuid,
  external_event_key text NOT NULL UNIQUE,
  posted_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_id, id),
  FOREIGN KEY (owner_id, budget_id) REFERENCES budgets(owner_id, id),
  FOREIGN KEY (owner_id, budget_window_id) REFERENCES budget_windows(owner_id, id),
  FOREIGN KEY (owner_id, operation_id) REFERENCES purchase_operations(owner_id, id),
  FOREIGN KEY (owner_id, reference_spend_entry_id) REFERENCES budget_entries(owner_id, id),
  CHECK ((kind = 'SPEND' AND reference_spend_entry_id IS NULL)
      OR (kind = 'REFUND' AND reference_spend_entry_id IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS budget_entries_budget_posted_idx
  ON budget_entries(owner_id, budget_id, posted_at);
CREATE INDEX IF NOT EXISTS budget_entries_window_posted_idx
  ON budget_entries(owner_id, budget_window_id, posted_at);

CREATE TABLE IF NOT EXISTS execution_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES users(id),
  operation_id uuid NOT NULL UNIQUE,
  adapter_id uuid NOT NULL REFERENCES vendor_adapters(id),
  adapter_version text NOT NULL,
  environment text NOT NULL CHECK (environment IN ('FIXTURE', 'SANDBOX')),
  stable_request_key text NOT NULL UNIQUE,
  status text NOT NULL CHECK (status IN ('PREPARED', 'SUBMITTING', 'UNKNOWN', 'CONFIRMED_SUCCESS', 'CONFIRMED_FAILURE')),
  provider_payment_ref text,
  vendor_order_ref text,
  requested_total_minor bigint NOT NULL CHECK (requested_total_minor > 0),
  currency char(3) NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  submitted_at timestamptz,
  last_checked_at timestamptz,
  safe_error text,
  version bigint NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_id, id),
  FOREIGN KEY (owner_id, operation_id) REFERENCES purchase_operations(owner_id, id)
);

CREATE TABLE IF NOT EXISTS external_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES users(id),
  operation_id uuid NOT NULL UNIQUE,
  adapter_id uuid NOT NULL REFERENCES vendor_adapters(id),
  environment text NOT NULL CHECK (environment IN ('FIXTURE', 'SANDBOX')),
  vendor_order_ref text NOT NULL,
  provider_payment_ref text,
  vendor_status text NOT NULL CHECK (vendor_status IN ('PENDING', 'CONFIRMED', 'FAILED', 'CANCELLED')),
  payment_status text NOT NULL CHECK (payment_status IN ('PENDING', 'CAPTURED', 'FAILED', 'REFUNDED', 'PARTIALLY_REFUNDED')),
  verified_at timestamptz NOT NULL DEFAULT now(),
  sanitized_receipt jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (adapter_id, environment, vendor_order_ref),
  UNIQUE (owner_id, id),
  FOREIGN KEY (owner_id, operation_id) REFERENCES purchase_operations(owner_id, id)
);

CREATE TABLE IF NOT EXISTS refunds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES users(id),
  operation_id uuid NOT NULL,
  external_ref text NOT NULL,
  expected_amount_minor bigint NOT NULL CHECK (expected_amount_minor > 0),
  confirmed_amount_minor bigint CHECK (confirmed_amount_minor IS NULL OR confirmed_amount_minor > 0),
  currency char(3) NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  status text NOT NULL CHECK (status IN ('PENDING', 'CONFIRMED', 'FAILED')),
  last_checked_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_id, id),
  FOREIGN KEY (owner_id, operation_id) REFERENCES purchase_operations(owner_id, id),
  CHECK ((status = 'CONFIRMED' AND confirmed_amount_minor IS NOT NULL)
      OR (status <> 'CONFIRMED' AND confirmed_amount_minor IS NULL))
);

ALTER TABLE refunds DROP CONSTRAINT IF EXISTS refunds_external_ref_key;
CREATE UNIQUE INDEX IF NOT EXISTS refunds_owner_external_ref_key ON refunds(owner_id, external_ref);

ALTER TABLE approvals
  ADD COLUMN IF NOT EXISTS policy_version bigint NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS consumed_at timestamptz;
ALTER TABLE approvals DROP CONSTRAINT IF EXISTS approvals_policy_version_check;
ALTER TABLE approvals ADD CONSTRAINT approvals_policy_version_check CHECK (policy_version >= 1);

CREATE OR REPLACE FUNCTION stamp_approval_policy_version() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.policy_version := COALESCE((
    SELECT bp.version FROM budget_policies bp
    JOIN procurement_instructions i ON i.owner_id=bp.owner_id AND i.currency=bp.currency
    JOIN purchase_operations o ON o.owner_id=i.owner_id AND o.instruction_id=i.id
    WHERE o.owner_id=NEW.owner_id AND o.id=NEW.operation_id
  ), 1);
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS approvals_stamp_policy_version ON approvals;
CREATE TRIGGER approvals_stamp_policy_version BEFORE INSERT ON approvals
  FOR EACH ROW EXECUTE FUNCTION stamp_approval_policy_version();

ALTER TABLE purchase_operations
  ADD COLUMN IF NOT EXISTS policy_version bigint NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS reservation_id uuid,
  ADD COLUMN IF NOT EXISTS dispatch_started_at timestamptz;
ALTER TABLE purchase_operations DROP CONSTRAINT IF EXISTS purchase_operations_state_check;
ALTER TABLE purchase_operations ADD CONSTRAINT purchase_operations_state_check CHECK (state IN (
  'DISCOVERING', 'QUOTED', 'AWAITING_APPROVAL', 'READY', 'RESERVED', 'SUBMITTING', 'RECONCILING',
  'SUCCEEDED', 'FAILED', 'EXPIRED', 'CANCELLED', 'CANCEL_REQUESTED', 'FIXTURE_QUOTED',
  'FIXTURE_AWAITING_REVIEW', 'FIXTURE_APPROVED', 'FIXTURE_COMPLETED', 'BLOCKED'
));
ALTER TABLE purchase_operations DROP CONSTRAINT IF EXISTS purchase_operations_reservation_fk;
ALTER TABLE purchase_operations ADD CONSTRAINT purchase_operations_reservation_fk
  FOREIGN KEY (owner_id, reservation_id) REFERENCES budget_reservations(owner_id, id);

ALTER TABLE vendor_quotes DROP CONSTRAINT IF EXISTS vendor_quotes_environment_check;
ALTER TABLE vendor_quotes ADD CONSTRAINT vendor_quotes_environment_check CHECK (environment IN ('FIXTURE', 'SANDBOX'));

ALTER TABLE procurement_obligations ADD COLUMN IF NOT EXISTS external_account_ref text;
CREATE UNIQUE INDEX IF NOT EXISTS procurement_obligations_unique_bill_invoice
  ON procurement_obligations(owner_id, external_account_ref,
    (COALESCE(external_invoice_ref, external_cycle_ref)))
  WHERE category = 'BILL' AND external_account_ref IS NOT NULL
    AND COALESCE(external_invoice_ref, external_cycle_ref) IS NOT NULL;

INSERT INTO schema_migrations(version) VALUES ('016_m3_reservations_ledger_and_attempts')
ON CONFLICT (version) DO NOTHING;
