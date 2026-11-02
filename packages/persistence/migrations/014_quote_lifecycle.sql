-- Keep quote evidence immutable while tracking expiry and invalidation separately.
CREATE TABLE IF NOT EXISTS vendor_quote_lifecycle (
  owner_id uuid NOT NULL,
  quote_id uuid NOT NULL,
  state text NOT NULL DEFAULT 'ACTIVE' CHECK (state IN ('ACTIVE', 'EXPIRED', 'INVALIDATED')),
  changed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (owner_id, quote_id),
  FOREIGN KEY (owner_id, quote_id) REFERENCES vendor_quotes(owner_id, id)
);

INSERT INTO vendor_quote_lifecycle (owner_id, quote_id, state, changed_at)
SELECT owner_id, id, CASE WHEN expires_at <= now() THEN 'EXPIRED' ELSE 'ACTIVE' END, now()
FROM vendor_quotes ON CONFLICT (owner_id, quote_id) DO NOTHING;

CREATE OR REPLACE FUNCTION register_vendor_quote_lifecycle() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO vendor_quote_lifecycle (owner_id, quote_id, state) VALUES (NEW.owner_id, NEW.id, 'ACTIVE')
  ON CONFLICT (owner_id, quote_id) DO NOTHING;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS vendor_quotes_lifecycle_insert ON vendor_quotes;
CREATE TRIGGER vendor_quotes_lifecycle_insert AFTER INSERT ON vendor_quotes
  FOR EACH ROW EXECUTE FUNCTION register_vendor_quote_lifecycle();

CREATE INDEX IF NOT EXISTS vendor_quote_lifecycle_expiry_idx
  ON vendor_quote_lifecycle(state, changed_at);
