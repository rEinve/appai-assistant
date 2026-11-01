-- M0 Capability Decision Record, Vendor Accounts, Funding Mandates, Connection Sessions & Provider Events (AC-02, AC-12, AC-17)

CREATE TABLE IF NOT EXISTS vendor_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES users(id),
  adapter_id uuid NOT NULL REFERENCES vendor_adapters(id),
  external_account_ref text NOT NULL,
  category_scope instruction_category[] NOT NULL DEFAULT '{}',
  credential_store_ref text,
  session_status text NOT NULL DEFAULT 'ACTIVE'
    CHECK (session_status IN ('ACTIVE', 'EXPIRED', 'REAUTH_REQUIRED', 'REVOKED')),
  session_checked_at timestamptz NOT NULL DEFAULT now(),
  reauth_reason text,
  version bigint NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_id, id),
  UNIQUE (owner_id, adapter_id, external_account_ref)
);

CREATE TABLE IF NOT EXISTS funding_mandates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES users(id),
  adapter_id uuid NOT NULL REFERENCES vendor_adapters(id),
  vendor_account_id uuid,
  provider_agreement_ref text NOT NULL,
  credential_store_ref text,
  buyer_role text NOT NULL DEFAULT 'AUTHENTICATED_MEMBER',
  caller_role text NOT NULL DEFAULT 'APPAI_SERVER_ADAPTER',
  payee_role text NOT NULL DEFAULT 'VERIFIED_MERCHANT',
  status text NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'ACTIVE', 'REAUTH_REQUIRED', 'REVOKED', 'EXPIRED')),
  allowed_payees jsonb NOT NULL DEFAULT '[]'::jsonb,
  category_constraints instruction_category[] NOT NULL DEFAULT '{}',
  currency char(3) NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  maximum_total_minor bigint CHECK (maximum_total_minor IS NULL OR maximum_total_minor > 0),
  unattended_supported boolean NOT NULL DEFAULT false,
  valid_from timestamptz,
  valid_until timestamptz,
  revoked_at timestamptz,
  version bigint NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_id, id),
  UNIQUE (owner_id, adapter_id, provider_agreement_ref),
  FOREIGN KEY (owner_id, vendor_account_id) REFERENCES vendor_accounts(owner_id, id),
  CHECK (valid_until IS NULL OR valid_from IS NULL OR valid_until > valid_from)
);

CREATE TABLE IF NOT EXISTS connection_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES users(id),
  adapter_id uuid NOT NULL REFERENCES vendor_adapters(id),
  state_digest char(64) NOT NULL UNIQUE CHECK (state_digest ~ '^[a-f0-9]{64}$'),
  protected_verifier_ref text,
  requested_scope jsonb NOT NULL DEFAULT '{}'::jsonb,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  resulting_account_id uuid,
  resulting_mandate_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_id, id),
  FOREIGN KEY (owner_id, resulting_account_id) REFERENCES vendor_accounts(owner_id, id),
  FOREIGN KEY (owner_id, resulting_mandate_id) REFERENCES funding_mandates(owner_id, id)
);

CREATE TABLE IF NOT EXISTS provider_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  adapter_id uuid NOT NULL REFERENCES vendor_adapters(id),
  environment text NOT NULL CHECK (environment IN ('FIXTURE', 'SANDBOX', 'LIVE')),
  external_event_id text NOT NULL,
  event_type text NOT NULL DEFAULT 'UNKNOWN',
  signature_verified boolean NOT NULL DEFAULT false CHECK (signature_verified = true),
  received_at timestamptz NOT NULL DEFAULT now(),
  redacted_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  processed_at timestamptz,
  UNIQUE (adapter_id, environment, external_event_id)
);

ALTER TABLE procurement_instructions
  ADD COLUMN IF NOT EXISTS vendor_account_id uuid;

ALTER TABLE procurement_instructions
  DROP CONSTRAINT IF EXISTS procurement_instructions_owner_funding_mandate_fk;
ALTER TABLE procurement_instructions
  ADD CONSTRAINT procurement_instructions_owner_funding_mandate_fk
    FOREIGN KEY (owner_id, funding_mandate_id) REFERENCES funding_mandates(owner_id, id);

ALTER TABLE procurement_instructions
  DROP CONSTRAINT IF EXISTS procurement_instructions_owner_vendor_account_fk;
ALTER TABLE procurement_instructions
  ADD CONSTRAINT procurement_instructions_owner_vendor_account_fk
    FOREIGN KEY (owner_id, vendor_account_id) REFERENCES vendor_accounts(owner_id, id);

-- Seed canonical M0 adapter capability records (AC-02, AC-12, AC-17)
INSERT INTO vendor_adapters (adapter_key, adapter_version, environment, capability, allowed_origins, enabled, execution_enabled, status, last_health_at)
VALUES
  (
    'local-fixture',
    '1.0.0',
    'FIXTURE',
    '{
      "categories": ["PRODUCT", "BILL", "ACCOMMODATION"],
      "discoveryMethods": ["FIXTURE_CATALOGUE"],
      "quoteFreshnessSec": 86400,
      "paymentRail": "PAYPAL",
      "buyerRole": "AUTHENTICATED_MEMBER",
      "callerRole": "APPAI_FIXTURE_WORKER",
      "payeeRole": "FIXTURE_SIMULATION_ONLY",
      "quote": true,
      "execute": "simulated-only",
      "autoExecutionSupported": true,
      "reviewExecutionSupported": true,
      "unattendedExecutionSupported": true,
      "statusLookupSupported": true,
      "webhookVerificationSupported": true,
      "cancellationSupported": true,
      "reservationSupported": false,
      "deferredHoldCaptureSupported": false,
      "biddingSupported": false
    }'::jsonb,
    '["http://localhost:4200", "http://localhost:4201"]'::jsonb,
    true,
    false,
    'VERIFIED',
    now()
  ),
  (
    'paypal-sandbox',
    '2.0.0',
    'SANDBOX',
    '{
      "categories": ["PRODUCT", "BILL", "ACCOMMODATION"],
      "discoveryMethods": [],
      "quoteFreshnessSec": 10800,
      "paymentRail": "PAYPAL",
      "buyerRole": "AUTHENTICATED_MEMBER_PAYPAL_BUYER",
      "callerRole": "APPAI_OAUTH_CLIENT_CREDENTIALS",
      "payeeRole": "VERIFIED_SANDBOX_MERCHANT",
      "operations": ["oauth2/token", "v2/checkout/orders:create", "v2/checkout/orders:get", "v2/checkout/orders:capture", "v1/notifications/verify-webhook-signature"],
      "idempotencyMechanism": "PayPal-Request-Id",
      "quote": false,
      "execute": "sandbox-orders-v2",
      "autoExecutionSupported": false,
      "reviewExecutionSupported": true,
      "unattendedExecutionSupported": false,
      "statusLookupSupported": true,
      "webhookVerificationSupported": true,
      "cancellationSupported": false,
      "reservationSupported": false,
      "deferredHoldCaptureSupported": false,
      "biddingSupported": false
    }'::jsonb,
    '["https://api-m.sandbox.paypal.com", "https://www.sandbox.paypal.com"]'::jsonb,
    true,
    false,
    'VERIFIED',
    now()
  ),
  (
    'serper-discovery',
    '1.0.0',
    'SANDBOX',
    '{
      "categories": ["PRODUCT", "ACCOMMODATION"],
      "discoveryMethods": ["READ_ONLY_WEB_SEARCH"],
      "quoteFreshnessSec": 0,
      "paymentRail": "NONE",
      "buyerRole": "AUTHENTICATED_MEMBER",
      "callerRole": "APPAI_DISCOVERY_PROXY",
      "payeeRole": "NONE",
      "quote": false,
      "execute": false,
      "autoExecutionSupported": false,
      "reviewExecutionSupported": false,
      "unattendedExecutionSupported": false,
      "statusLookupSupported": false,
      "webhookVerificationSupported": false,
      "cancellationSupported": false,
      "reservationSupported": false,
      "deferredHoldCaptureSupported": false,
      "biddingSupported": false
    }'::jsonb,
    '["https://google.serper.dev"]'::jsonb,
    true,
    false,
    'VERIFIED',
    now()
  ),
  (
    'webmcp-browser-host',
    '1.0.0',
    'SANDBOX',
    '{
      "categories": ["PRODUCT", "ACCOMMODATION"],
      "discoveryMethods": ["FOREGROUND_PAGE_TOOLS"],
      "quoteFreshnessSec": 300,
      "paymentRail": "PAYPAL",
      "buyerRole": "AUTHENTICATED_MEMBER_BROWSER_SESSION",
      "callerRole": "ISOLATED_WEBMCP_HOST",
      "payeeRole": "ORIGIN_BOUND_MERCHANT",
      "quote": false,
      "execute": false,
      "autoExecutionSupported": false,
      "reviewExecutionSupported": false,
      "unattendedExecutionSupported": false,
      "whenUiClosed": "ACTION_REQUIRED",
      "statusLookupSupported": false,
      "webhookVerificationSupported": false,
      "cancellationSupported": false,
      "reservationSupported": false,
      "deferredHoldCaptureSupported": false,
      "biddingSupported": false
    }'::jsonb,
    '[]'::jsonb,
    false,
    false,
    'UNSUPPORTED',
    now()
  )
ON CONFLICT (adapter_key, adapter_version, environment) DO UPDATE
SET capability = EXCLUDED.capability,
    allowed_origins = EXCLUDED.allowed_origins,
    enabled = EXCLUDED.enabled,
    execution_enabled = false,
    status = EXCLUDED.status,
    last_health_at = now();

INSERT INTO schema_migrations (version) VALUES ('013_m0_capability_and_mandates') ON CONFLICT (version) DO NOTHING;
