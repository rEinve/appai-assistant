-- A-P-P-A-I M1 foundation. PostgreSQL is authoritative; execution remains disabled.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS schema_migrations (
  version text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  identity_provider_subject text NOT NULL UNIQUE,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS user_settings (
  owner_id uuid PRIMARY KEY REFERENCES users(id),
  timezone text NOT NULL,
  enabled_currency char(3) NOT NULL CHECK (enabled_currency ~ '^[A-Z]{3}$'),
  currency_scale smallint NOT NULL CHECK (currency_scale BETWEEN 0 AND 9),
  notification_preferences jsonb NOT NULL DEFAULT '{}'::jsonb,
  version bigint NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS vendor_adapters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  adapter_key text NOT NULL,
  adapter_version text NOT NULL,
  environment text NOT NULL CHECK (environment IN ('FIXTURE', 'SANDBOX', 'LIVE')),
  capability jsonb NOT NULL DEFAULT '{}'::jsonb,
  allowed_origins jsonb NOT NULL DEFAULT '[]'::jsonb,
  enabled boolean NOT NULL DEFAULT false,
  execution_enabled boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'UNVERIFIED',
  last_health_at timestamptz,
  UNIQUE (adapter_key, adapter_version, environment),
  CHECK (environment <> 'LIVE' OR execution_enabled = false)
);

CREATE TABLE IF NOT EXISTS budgets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES users(id),
  name text NOT NULL,
  currency char(3) NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  allocation_limit_minor bigint NOT NULL CHECK (allocation_limit_minor > 0),
  active boolean NOT NULL DEFAULT true,
  version bigint NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_id, id)
);

DO $$ BEGIN
  CREATE TYPE permission_mode AS ENUM ('PRE_APPROVED', 'REVIEW_REQUIRED', 'NOTIFY_ONLY');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE TYPE instruction_kind AS ENUM ('ONE_TIME', 'SCHEDULED', 'RECURRING_BILL', 'WATCH');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE TYPE instruction_category AS ENUM ('PRODUCT', 'BILL', 'ACCOMMODATION');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE TYPE instruction_state AS ENUM ('DRAFT', 'ACTIVE', 'PAUSED', 'CANCELLED', 'EXPIRED', 'COMPLETED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS procurement_instructions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES users(id),
  kind instruction_kind NOT NULL,
  category instruction_category NOT NULL,
  mode permission_mode NOT NULL,
  state instruction_state NOT NULL DEFAULT 'DRAFT',
  structured_constraints jsonb NOT NULL DEFAULT '{}'::jsonb,
  constraints_schema_version text NOT NULL DEFAULT '1.0',
  allowed_payees jsonb NOT NULL DEFAULT '[]'::jsonb,
  max_total_minor bigint CHECK (max_total_minor IS NULL OR max_total_minor > 0),
  currency char(3) CHECK (currency IS NULL OR currency ~ '^[A-Z]{3}$'),
  budget_id uuid,
  funding_mandate_id uuid,
  valid_from timestamptz,
  valid_until timestamptz,
  timezone_snapshot text,
  schedule_config jsonb,
  watch_config jsonb,
  next_run_at timestamptz,
  completion_limit integer CHECK (completion_limit IS NULL OR completion_limit > 0),
  fulfilled_count integer NOT NULL DEFAULT 0 CHECK (fulfilled_count >= 0),
  permission_version bigint NOT NULL DEFAULT 1 CHECK (permission_version >= 1),
  version bigint NOT NULL DEFAULT 1 CHECK (version >= 1),
  blocked_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_id, id),
  FOREIGN KEY (owner_id, budget_id) REFERENCES budgets(owner_id, id),
  CHECK (valid_until IS NULL OR valid_from IS NULL OR valid_until > valid_from),
  CHECK (completion_limit IS NULL OR fulfilled_count <= completion_limit),
  CHECK (state = 'DRAFT' OR (max_total_minor IS NOT NULL AND currency IS NOT NULL AND budget_id IS NOT NULL AND timezone_snapshot IS NOT NULL)),
  CHECK (mode = 'NOTIFY_ONLY' OR funding_mandate_id IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS instruction_occurrences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES users(id),
  instruction_id uuid NOT NULL,
  schedule_version bigint NOT NULL CHECK (schedule_version >= 1),
  due_at timestamptz NOT NULL,
  local_occurrence_key text NOT NULL,
  state text NOT NULL DEFAULT 'READY' CHECK (state IN ('READY', 'RUNNING', 'SUCCEEDED', 'SKIPPED', 'BLOCKED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (instruction_id, local_occurrence_key),
  UNIQUE (owner_id, id),
  FOREIGN KEY (owner_id, instruction_id) REFERENCES procurement_instructions(owner_id, id)
);

CREATE TABLE IF NOT EXISTS procurement_obligations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES users(id),
  instruction_id uuid NOT NULL,
  occurrence_id uuid,
  obligation_key text NOT NULL,
  category instruction_category NOT NULL,
  external_invoice_ref text,
  external_cycle_ref text,
  fulfillment_slot text NOT NULL,
  satisfied_at timestamptz,
  version bigint NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (instruction_id, obligation_key),
  UNIQUE (owner_id, id),
  FOREIGN KEY (owner_id, instruction_id) REFERENCES procurement_instructions(owner_id, id),
  FOREIGN KEY (owner_id, occurrence_id) REFERENCES instruction_occurrences(owner_id, id)
);

CREATE TABLE IF NOT EXISTS jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES users(id),
  instruction_id uuid,
  obligation_id uuid,
  job_type text NOT NULL CHECK (job_type IN ('OBSERVE', 'RUN_OCCURRENCE', 'RECONCILE', 'NOTIFY', 'CANCEL_RECONCILE')),
  dedupe_key text NOT NULL UNIQUE,
  payload_version text NOT NULL DEFAULT '1.0',
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  state text NOT NULL DEFAULT 'READY' CHECK (state IN ('READY', 'RUNNING', 'SUCCEEDED', 'RETRY_WAIT', 'BLOCKED', 'DEAD')),
  run_at timestamptz NOT NULL,
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  max_attempts integer NOT NULL DEFAULT 8 CHECK (max_attempts > 0),
  lease_owner text,
  lease_expires_at timestamptz,
  lease_generation bigint NOT NULL DEFAULT 0 CHECK (lease_generation >= 0),
  last_error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (owner_id, instruction_id) REFERENCES procurement_instructions(owner_id, id),
  FOREIGN KEY (owner_id, obligation_id) REFERENCES procurement_obligations(owner_id, id)
);

CREATE INDEX IF NOT EXISTS jobs_due_idx ON jobs (run_at, id) WHERE state IN ('READY', 'RETRY_WAIT');
CREATE INDEX IF NOT EXISTS jobs_lease_idx ON jobs (lease_expires_at) WHERE state = 'RUNNING';
CREATE INDEX IF NOT EXISTS instructions_due_idx ON procurement_instructions (next_run_at, id) WHERE state = 'ACTIVE';

CREATE TABLE IF NOT EXISTS outbox_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  aggregate_type text NOT NULL,
  aggregate_id uuid NOT NULL,
  aggregate_version bigint NOT NULL CHECK (aggregate_version >= 1),
  event_type text NOT NULL,
  schema_version text NOT NULL DEFAULT '1.0',
  owner_id uuid NOT NULL REFERENCES users(id),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  published_at timestamptz,
  delivery_attempts integer NOT NULL DEFAULT 0 CHECK (delivery_attempts >= 0),
  UNIQUE (aggregate_type, aggregate_id, aggregate_version, event_type)
);

CREATE TABLE IF NOT EXISTS api_idempotency (
  actor_id uuid NOT NULL REFERENCES users(id),
  route_scope text NOT NULL,
  key text NOT NULL,
  request_hash text NOT NULL,
  result_ref text,
  response jsonb,
  state text NOT NULL CHECK (state IN ('IN_PROGRESS', 'COMPLETED', 'FAILED')),
  retention_until timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (actor_id, route_scope, key)
);

CREATE TABLE IF NOT EXISTS audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_type text NOT NULL,
  actor_id text,
  owner_id uuid REFERENCES users(id),
  instruction_id uuid,
  action text NOT NULL,
  old_state text,
  new_state text,
  safe_reason text,
  correlation_id text,
  occurred_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO schema_migrations (version) VALUES ('001_m1_foundation') ON CONFLICT (version) DO NOTHING;
