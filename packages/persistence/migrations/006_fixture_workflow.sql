-- Explicit local-only workflow identities. This migration adds no external
-- purchasing capability and seeds only a quote-only deterministic fixture.
ALTER TABLE procurement_instructions
  ADD COLUMN IF NOT EXISTS execution_environment text
    CHECK (execution_environment IS NULL OR execution_environment = 'FIXTURE');
ALTER TABLE procurement_instructions
  ADD COLUMN IF NOT EXISTS paused_next_run_at timestamptz;

ALTER TABLE procurement_instructions
  DROP CONSTRAINT IF EXISTS procurement_instructions_check_fixture_active;
ALTER TABLE procurement_instructions
  ADD CONSTRAINT procurement_instructions_check_fixture_active
    CHECK (state <> 'ACTIVE' OR execution_environment = 'FIXTURE');
ALTER TABLE procurement_instructions
  DROP CONSTRAINT IF EXISTS procurement_instructions_draft_mandate_check;
ALTER TABLE procurement_instructions
  ADD CONSTRAINT procurement_instructions_draft_mandate_check
    CHECK (state = 'DRAFT' OR mode = 'NOTIFY_ONLY' OR funding_mandate_id IS NOT NULL OR execution_environment = 'FIXTURE');

CREATE TABLE IF NOT EXISTS purchase_operations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES users(id),
  instruction_id uuid NOT NULL,
  obligation_id uuid NOT NULL,
  state text NOT NULL CHECK (state IN ('FIXTURE_QUOTED', 'FIXTURE_AWAITING_REVIEW', 'FIXTURE_APPROVED', 'FIXTURE_COMPLETED', 'BLOCKED')),
  selected_quote_id uuid,
  permission_version bigint NOT NULL CHECK (permission_version >= 1),
  execution_key text NOT NULL UNIQUE,
  outcome_reason text,
  version bigint NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_id, id),
  UNIQUE (owner_id, instruction_id, obligation_id),
  FOREIGN KEY (owner_id, instruction_id) REFERENCES procurement_instructions(owner_id, id),
  FOREIGN KEY (owner_id, obligation_id) REFERENCES procurement_obligations(owner_id, id)
);

CREATE TABLE IF NOT EXISTS vendor_quotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  operation_id uuid NOT NULL,
  adapter_id uuid NOT NULL REFERENCES vendor_adapters(id),
  adapter_version text NOT NULL,
  environment text NOT NULL CHECK (environment = 'FIXTURE'),
  merchant_ref text NOT NULL,
  external_quote_ref text NOT NULL,
  category instruction_category NOT NULL,
  schema_version text NOT NULL,
  typed_details jsonb NOT NULL,
  currency char(3) NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  subtotal_minor bigint NOT NULL CHECK (subtotal_minor >= 0),
  tax_minor bigint NOT NULL CHECK (tax_minor >= 0),
  fees_minor bigint NOT NULL CHECK (fees_minor >= 0),
  shipping_minor bigint NOT NULL CHECK (shipping_minor >= 0),
  discount_minor bigint NOT NULL CHECK (discount_minor >= 0),
  total_minor bigint NOT NULL CHECK (total_minor > 0),
  quantity integer NOT NULL CHECK (quantity > 0),
  terms_hash char(64) NOT NULL CHECK (terms_hash ~ '^[a-f0-9]{64}$'),
  content_hash char(64) NOT NULL CHECK (content_hash ~ '^[a-f0-9]{64}$'),
  verified_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_id, id),
  UNIQUE (operation_id, id),
  UNIQUE (owner_id, operation_id, id),
  UNIQUE (adapter_id, environment, external_quote_ref),
  FOREIGN KEY (owner_id, operation_id) REFERENCES purchase_operations(owner_id, id),
  CHECK (subtotal_minor + tax_minor + fees_minor + shipping_minor - discount_minor = total_minor),
  CHECK (expires_at > verified_at)
);

CREATE OR REPLACE FUNCTION reject_vendor_quote_update() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'vendor_quotes are immutable after creation' USING ERRCODE = '55000';
END;
$$;
DROP TRIGGER IF EXISTS vendor_quotes_immutable_update ON vendor_quotes;
CREATE TRIGGER vendor_quotes_immutable_update
  BEFORE UPDATE ON vendor_quotes FOR EACH ROW EXECUTE FUNCTION reject_vendor_quote_update();

ALTER TABLE purchase_operations
  DROP CONSTRAINT IF EXISTS purchase_operations_selected_quote_owner_fk;
ALTER TABLE purchase_operations
  ADD CONSTRAINT purchase_operations_selected_quote_owner_fk
    FOREIGN KEY (owner_id, id, selected_quote_id)
    REFERENCES vendor_quotes(owner_id, operation_id, id)
    DEFERRABLE INITIALLY DEFERRED;

CREATE TABLE IF NOT EXISTS approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  operation_id uuid NOT NULL,
  quote_id uuid NOT NULL,
  quote_hash char(64) NOT NULL CHECK (quote_hash ~ '^[a-f0-9]{64}$'),
  permission_version bigint NOT NULL CHECK (permission_version >= 1),
  status text NOT NULL CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'EXPIRED', 'INVALIDATED')),
  expires_at timestamptz NOT NULL,
  decided_at timestamptz,
  decision_actor_ref text,
  version bigint NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_id, id),
  FOREIGN KEY (owner_id, operation_id) REFERENCES purchase_operations(owner_id, id),
  FOREIGN KEY (owner_id, operation_id, quote_id) REFERENCES vendor_quotes(owner_id, operation_id, id),
  CHECK ((status = 'PENDING' AND decided_at IS NULL) OR (status <> 'PENDING' AND decided_at IS NOT NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS approvals_one_pending_per_operation
  ON approvals(operation_id) WHERE status = 'PENDING';

CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES users(id),
  operation_id uuid,
  instruction_id uuid,
  event_key text NOT NULL UNIQUE,
  type text NOT NULL CHECK (type IN ('FIXTURE_REVIEW_REQUESTED', 'FIXTURE_RESULT', 'INSTRUCTION_BLOCKED')),
  safe_content jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz,
  FOREIGN KEY (owner_id, operation_id) REFERENCES purchase_operations(owner_id, id),
  FOREIGN KEY (owner_id, instruction_id) REFERENCES procurement_instructions(owner_id, id)
);
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN ('FIXTURE_REVIEW_REQUESTED', 'FIXTURE_RESULT', 'FIXTURE_OBSERVATION', 'INSTRUCTION_BLOCKED'));

CREATE TABLE IF NOT EXISTS offer_observations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  instruction_id uuid NOT NULL,
  adapter_id uuid NOT NULL REFERENCES vendor_adapters(id),
  source_offer_key text NOT NULL,
  material_fingerprint char(64) NOT NULL CHECK (material_fingerprint ~ '^[a-f0-9]{64}$'),
  observed_at timestamptz NOT NULL,
  freshness_until timestamptz NOT NULL,
  normalized_details jsonb NOT NULL,
  source_url text NOT NULL CHECK (source_url LIKE 'fixture://%'),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_id, id),
  UNIQUE (instruction_id, source_offer_key, material_fingerprint),
  FOREIGN KEY (owner_id, instruction_id) REFERENCES procurement_instructions(owner_id, id),
  CHECK (freshness_until > observed_at)
);

CREATE TABLE IF NOT EXISTS worker_heartbeats (
  worker_id text PRIMARY KEY,
  started_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO vendor_adapters (adapter_key, adapter_version, environment, capability, allowed_origins, enabled, execution_enabled, status)
VALUES ('local-fixture', '1.0.0', 'FIXTURE', '{"quote":true,"categories":["PRODUCT","BILL","ACCOMMODATION"],"execution":"simulated-only"}'::jsonb, '[]'::jsonb, true, false, 'VERIFIED')
ON CONFLICT (adapter_key, adapter_version, environment) DO UPDATE
SET capability = EXCLUDED.capability, enabled = true, execution_enabled = false, status = 'VERIFIED';

INSERT INTO schema_migrations (version) VALUES ('006_fixture_workflow') ON CONFLICT (version) DO NOTHING;
