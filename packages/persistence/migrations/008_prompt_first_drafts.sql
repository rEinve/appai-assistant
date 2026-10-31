-- Prompt-first drafts may remain unclassified until a supplier or assistant flow resolves the need.
ALTER TABLE procurement_instructions ALTER COLUMN category DROP NOT NULL;

DO $$ BEGIN
  ALTER TABLE procurement_instructions ADD CONSTRAINT procurement_instructions_category_required_after_draft
    CHECK (state = 'DRAFT' OR category IS NOT NULL);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
