-- M5 retention, step-up authentication, and measurable job pickup timestamps.
CREATE TABLE IF NOT EXISTS data_retention_policies (
  policy_key text PRIMARY KEY,
  retention_interval interval,
  prunable boolean NOT NULL,
  protection_class text NOT NULL CHECK (protection_class IN ('OPERATIONAL','FINANCIAL_IMMUTABLE')),
  description text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((prunable AND protection_class='OPERATIONAL') OR (NOT prunable AND protection_class='FINANCIAL_IMMUTABLE'))
);

INSERT INTO data_retention_policies(policy_key,retention_interval,prunable,protection_class,description) VALUES
  ('api_idempotency', interval '30 days', true, 'OPERATIONAL', 'Expired idempotency records may be pruned unless linked to unresolved financial work.'),
  ('connection_sessions', interval '1 day', true, 'OPERATIONAL', 'Unused consent sessions are pruned one day after expiry.'),
  ('offer_observations', interval '90 days', true, 'OPERATIONAL', 'Old discovery observations are pruned after 90 days.'),
  ('notification_deliveries', interval '90 days', true, 'OPERATIONAL', 'Terminal delivery records are pruned after 90 days.'),
  ('budget_reservations', NULL, false, 'FINANCIAL_IMMUTABLE', 'Financial reservation identity and liability history are retained.'),
  ('budget_entries', NULL, false, 'FINANCIAL_IMMUTABLE', 'Spend and refund ledger entries are append-only and retained.'),
  ('execution_attempts', NULL, false, 'FINANCIAL_IMMUTABLE', 'Stable request key and attempt history are retained.'),
  ('external_orders', NULL, false, 'FINANCIAL_IMMUTABLE', 'External order and payment outcomes are retained.'),
  ('cancellations', NULL, false, 'FINANCIAL_IMMUTABLE', 'Cancellation request and outcome history are retained.'),
  ('refunds', NULL, false, 'FINANCIAL_IMMUTABLE', 'Refund records are retained.'),
  ('audit_events', NULL, false, 'FINANCIAL_IMMUTABLE', 'Audit history is append-only and retained.')
ON CONFLICT(policy_key) DO UPDATE SET retention_interval=EXCLUDED.retention_interval,prunable=EXCLUDED.prunable,
  protection_class=EXCLUDED.protection_class,description=EXCLUDED.description,updated_at=now();

CREATE TABLE IF NOT EXISTS data_retention_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id text NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  pruned_counts jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'RUNNING' CHECK (status IN ('RUNNING','COMPLETED','FAILED')),
  safe_error text
);

CREATE TABLE IF NOT EXISTS step_up_verifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES users(id),
  auth_session_token_digest char(64) NOT NULL CHECK (auth_session_token_digest ~ '^[a-f0-9]{64}$'),
  verified_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(owner_id,auth_session_token_digest),
  CHECK(expires_at > verified_at)
);
CREATE INDEX IF NOT EXISTS step_up_verifications_expiry_idx ON step_up_verifications(expires_at);

ALTER TABLE jobs ADD COLUMN IF NOT EXISTS first_started_at timestamptz;

CREATE OR REPLACE FUNCTION reject_financial_history_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME USING ERRCODE='55000';
END;
$$;
DROP TRIGGER IF EXISTS audit_events_append_only ON audit_events;
CREATE TRIGGER audit_events_append_only BEFORE UPDATE OR DELETE ON audit_events
  FOR EACH ROW EXECUTE FUNCTION reject_financial_history_mutation();
DROP TRIGGER IF EXISTS budget_entries_append_only ON budget_entries;
CREATE TRIGGER budget_entries_append_only BEFORE UPDATE OR DELETE ON budget_entries
  FOR EACH ROW EXECUTE FUNCTION reject_financial_history_mutation();

INSERT INTO schema_migrations(version) VALUES ('018_m5_retention_stepup_and_pilot_readiness') ON CONFLICT(version) DO NOTHING;
