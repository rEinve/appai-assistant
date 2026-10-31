-- Member-facing organization is distinct from the operational supplier category.
ALTER TABLE procurement_instructions ADD COLUMN IF NOT EXISTS member_category text NOT NULL DEFAULT 'OTHER';

DO $$ BEGIN
  ALTER TABLE procurement_instructions ADD CONSTRAINT procurement_instructions_member_category_check
    CHECK (member_category IN ('PERSONAL', 'HOUSEHOLD', 'WORK', 'TRAVEL', 'OTHER'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
