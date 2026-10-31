-- Multiple member-entered suppliers have no catalogue ID and must not collide on NULL.
ALTER TABLE member_suppliers
  DROP CONSTRAINT IF EXISTS member_suppliers_owner_id_catalogue_supplier_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS member_suppliers_catalogue_link_unique_idx
  ON member_suppliers(owner_id, catalogue_supplier_id)
  WHERE catalogue_supplier_id IS NOT NULL;
