ALTER TABLE vendor_quote_lifecycle
  DROP CONSTRAINT IF EXISTS vendor_quote_lifecycle_owner_id_quote_id_fkey;
ALTER TABLE vendor_quote_lifecycle
  ADD CONSTRAINT vendor_quote_lifecycle_owner_id_quote_id_fkey
    FOREIGN KEY (owner_id, quote_id) REFERENCES vendor_quotes(owner_id, id) ON DELETE CASCADE;
