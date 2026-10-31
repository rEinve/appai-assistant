-- Catalogue records are system-owned. Member relationships and preferences remain private per owner.
CREATE TABLE IF NOT EXISTS supplier_catalogue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  canonical_name text NOT NULL,
  aliases text[] NOT NULL DEFAULT '{}',
  categories instruction_category[] NOT NULL DEFAULT '{}',
  service_areas text[] NOT NULL DEFAULT '{}',
  source_evidence jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(source_evidence) = 'array'),
  source_checked_at timestamptz,
  discovery_status text NOT NULL DEFAULT 'UNVERIFIED' CHECK (discovery_status IN ('UNVERIFIED', 'SUPPORTED', 'UNSUPPORTED', 'ACTION_REQUIRED')),
  payment_status text NOT NULL DEFAULT 'UNVERIFIED' CHECK (payment_status IN ('UNVERIFIED', 'SUPPORTED', 'UNSUPPORTED', 'ACTION_REQUIRED')),
  active boolean NOT NULL DEFAULT false,
  version bigint NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (length(trim(canonical_name)) BETWEEN 2 AND 160)
);

CREATE TABLE IF NOT EXISTS member_suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES users(id),
  catalogue_supplier_id uuid REFERENCES supplier_catalogue(id),
  private_name text NOT NULL,
  categories instruction_category[] NOT NULL DEFAULT '{}',
  service_areas text[] NOT NULL DEFAULT '{}',
  private_notes text,
  last_confirmed_use_at timestamptz,
  version bigint NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_id, id),
  CHECK (length(trim(private_name)) BETWEEN 2 AND 160),
  CHECK (private_notes IS NULL OR length(private_notes) <= 1000)
);

CREATE UNIQUE INDEX IF NOT EXISTS member_suppliers_catalogue_link_unique_idx
  ON member_suppliers(owner_id, catalogue_supplier_id)
  WHERE catalogue_supplier_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS budget_supplier_preferences (
  owner_id uuid NOT NULL,
  budget_id uuid NOT NULL,
  member_supplier_id uuid NOT NULL,
  preference_rank smallint NOT NULL CHECK (preference_rank BETWEEN 1 AND 100),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (budget_id, member_supplier_id),
  UNIQUE (budget_id, preference_rank),
  FOREIGN KEY (owner_id, budget_id) REFERENCES budgets(owner_id, id),
  FOREIGN KEY (owner_id, member_supplier_id) REFERENCES member_suppliers(owner_id, id)
);

CREATE INDEX IF NOT EXISTS supplier_catalogue_discovery_idx ON supplier_catalogue(active, discovery_status, payment_status);
CREATE INDEX IF NOT EXISTS member_suppliers_owner_idx ON member_suppliers(owner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS budget_supplier_preferences_owner_idx ON budget_supplier_preferences(owner_id, budget_id, preference_rank);
