-- M4 durable notification delivery, cancellation lifecycle and operator controls.
CREATE UNIQUE INDEX IF NOT EXISTS notifications_owner_id_id_key ON notifications(owner_id,id);

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES users(id),
  transport text NOT NULL CHECK (transport IN ('WEB_PUSH','APNS','FCM','LOCAL_STUB')),
  protected_endpoint_ref text NOT NULL,
  status text NOT NULL CHECK (status IN ('ACTIVE','PERMISSION_DISABLED','OFFLINE','REVOKED')),
  device_label text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_id,id), UNIQUE (owner_id,protected_endpoint_ref)
);

CREATE TABLE IF NOT EXISTS notification_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES users(id),
  notification_id uuid NOT NULL,
  subscription_id uuid,
  stable_delivery_key text NOT NULL UNIQUE,
  transport text NOT NULL CHECK (transport IN ('WEB_PUSH','APNS','FCM','LOCAL_STUB')),
  status text NOT NULL CHECK (status IN ('QUEUED','SENT','ACKNOWLEDGED','FAILED','SKIPPED_PERMISSION_DISABLED','DEFERRED_OFFLINE')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  next_retry_at timestamptz,
  safe_error text,
  sent_at timestamptz,
  acknowledged_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_id,id),
  FOREIGN KEY (owner_id,notification_id) REFERENCES notifications(owner_id,id),
  FOREIGN KEY (owner_id,subscription_id) REFERENCES push_subscriptions(owner_id,id)
);
CREATE INDEX IF NOT EXISTS notification_deliveries_retry_idx ON notification_deliveries(status,next_retry_at) WHERE status IN ('QUEUED','FAILED','DEFERRED_OFFLINE');

CREATE TABLE IF NOT EXISTS cancellations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES users(id),
  operation_id uuid NOT NULL UNIQUE,
  stable_request_key text NOT NULL UNIQUE,
  adapter_request_ref text,
  status text NOT NULL CHECK (status IN ('REQUESTED','PENDING','CONFIRMED','REJECTED')),
  cancellation_stage text NOT NULL CHECK (cancellation_stage IN ('PRE_DISPATCH','POST_DISPATCH')),
  terms_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  rejection_reason text,
  requested_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  version bigint NOT NULL DEFAULT 1 CHECK (version >= 1),
  UNIQUE (owner_id,id),
  FOREIGN KEY (owner_id,operation_id) REFERENCES purchase_operations(owner_id,id)
);

ALTER TABLE purchase_operations ADD COLUMN IF NOT EXISTS cancellation_state text;
ALTER TABLE purchase_operations ADD COLUMN IF NOT EXISTS cancellation_details jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE purchase_operations DROP CONSTRAINT IF EXISTS purchase_operations_cancellation_state_check;
ALTER TABLE purchase_operations ADD CONSTRAINT purchase_operations_cancellation_state_check
  CHECK (cancellation_state IS NULL OR cancellation_state IN ('REQUESTED','PENDING','CONFIRMED','REJECTED'));

ALTER TABLE vendor_adapters ADD COLUMN IF NOT EXISTS circuit_state text NOT NULL DEFAULT 'CLOSED';
ALTER TABLE vendor_adapters ADD COLUMN IF NOT EXISTS circuit_reason text;
ALTER TABLE vendor_adapters ADD COLUMN IF NOT EXISTS circuit_opened_at timestamptz;
ALTER TABLE vendor_adapters DROP CONSTRAINT IF EXISTS vendor_adapters_circuit_state_check;
ALTER TABLE vendor_adapters ADD CONSTRAINT vendor_adapters_circuit_state_check CHECK (circuit_state IN ('CLOSED','OPEN'));

CREATE TABLE IF NOT EXISTS runtime_execution_controls (
  singleton_key text PRIMARY KEY DEFAULT 'GLOBAL' CHECK (singleton_key = 'GLOBAL'),
  new_execution_enabled boolean NOT NULL DEFAULT true,
  paused_reason text,
  updated_by text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO runtime_execution_controls(singleton_key,new_execution_enabled,paused_reason,updated_by)
VALUES ('GLOBAL',true,NULL,'system') ON CONFLICT(singleton_key) DO NOTHING;

INSERT INTO schema_migrations(version) VALUES ('017_m4_notifications_cancellations_and_recovery') ON CONFLICT(version) DO NOTHING;
