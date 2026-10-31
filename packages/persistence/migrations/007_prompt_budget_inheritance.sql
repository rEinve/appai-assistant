-- Preserve the member's wording and make budget limits reusable by linked instructions.
ALTER TABLE budgets ADD COLUMN IF NOT EXISTS valid_from timestamptz;
ALTER TABLE budgets ADD COLUMN IF NOT EXISTS valid_until timestamptz;
ALTER TABLE budgets ADD COLUMN IF NOT EXISTS timezone_snapshot text;

DO $$ BEGIN
  ALTER TABLE budgets ADD CONSTRAINT budgets_validity_window_check
    CHECK (valid_until IS NULL OR valid_from IS NULL OR valid_until > valid_from);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE procurement_instructions ADD COLUMN IF NOT EXISTS prompt_text text;
UPDATE procurement_instructions
SET prompt_text = COALESCE(NULLIF(prompt_text, ''), structured_constraints->>'description', 'Saved instruction')
WHERE prompt_text IS NULL OR prompt_text = '';
ALTER TABLE procurement_instructions ALTER COLUMN prompt_text SET DEFAULT '';
ALTER TABLE procurement_instructions ALTER COLUMN prompt_text SET NOT NULL;
