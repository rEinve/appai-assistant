-- Drafts can express a proposed permission mode before a supported mandate is connected.
-- They remain inert until a future activation flow revalidates all authority.
ALTER TABLE procurement_instructions
  DROP CONSTRAINT IF EXISTS procurement_instructions_check3;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'procurement_instructions'::regclass
      AND conname = 'procurement_instructions_draft_mandate_check'
  ) THEN
    ALTER TABLE procurement_instructions
      ADD CONSTRAINT procurement_instructions_draft_mandate_check
      CHECK (state = 'DRAFT' OR mode = 'NOTIFY_ONLY' OR funding_mandate_id IS NOT NULL);
  END IF;
END $$;
