-- Conversation and agreement persistence (FR-20)
CREATE TABLE IF NOT EXISTS instruction_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  instruction_id UUID NOT NULL REFERENCES procurement_instructions(id) ON DELETE CASCADE,
  sequence_number INTEGER NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('MEMBER', 'ASSISTANT', 'SYSTEM', 'TOOL')),
  content TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  client_request_key TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT instruction_messages_instruction_sequence_unique UNIQUE (instruction_id, sequence_number)
);

CREATE UNIQUE INDEX IF NOT EXISTS instruction_messages_owner_client_request_key_idx
  ON instruction_messages (owner_id, client_request_key)
  WHERE client_request_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS instruction_messages_instruction_created_idx
  ON instruction_messages (instruction_id, created_at ASC);

CREATE TABLE IF NOT EXISTS instruction_research (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  instruction_id UUID NOT NULL REFERENCES procurement_instructions(id) ON DELETE CASCADE,
  message_id UUID NULL REFERENCES instruction_messages(id) ON DELETE SET NULL,
  provider_name TEXT NOT NULL,
  provider_ref TEXT NULL,
  source_url TEXT NULL,
  evidence_type TEXT NOT NULL CHECK (evidence_type IN ('ESTIMATE', 'ADVERTISED_OFFER', 'AUTHORITATIVE_QUOTE')),
  price_raw TEXT NULL,
  price_minor BIGINT NULL,
  currency TEXT NULL,
  paypal_eligible BOOLEAN NOT NULL DEFAULT false,
  notes TEXT NULL,
  checked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NULL
);

CREATE INDEX IF NOT EXISTS instruction_research_instruction_idx
  ON instruction_research (instruction_id, checked_at DESC);

CREATE TABLE IF NOT EXISTS instruction_agreements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  instruction_id UUID NOT NULL REFERENCES procurement_instructions(id) ON DELETE CASCADE,
  agreement_version INTEGER NOT NULL DEFAULT 1,
  instruction_version INTEGER NOT NULL DEFAULT 1,
  permission_version INTEGER NOT NULL DEFAULT 1,
  policy_version INTEGER NOT NULL DEFAULT 1,
  start_sequence_number INTEGER NOT NULL DEFAULT 1,
  end_sequence_number INTEGER NOT NULL DEFAULT 1,
  plan_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  unresolved_details JSONB NOT NULL DEFAULT '[]'::jsonb,
  confirmed_by_member_at TIMESTAMPTZ NULL,
  confirmation_message_id UUID NULL REFERENCES instruction_messages(id) ON DELETE SET NULL,
  superseded_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT instruction_agreements_instruction_version_unique UNIQUE (instruction_id, agreement_version)
);

CREATE INDEX IF NOT EXISTS instruction_agreements_instruction_active_idx
  ON instruction_agreements (instruction_id, agreement_version DESC);

ALTER TABLE procurement_instructions ADD COLUMN IF NOT EXISTS current_agreement_id UUID NULL REFERENCES instruction_agreements(id) ON DELETE SET NULL;

-- Backfill existing instructions with initial message and provisional agreement if not present
DO $$
DECLARE
  rec RECORD;
  msg_id UUID;
  agr_id UUID;
BEGIN
  FOR rec IN SELECT id, owner_id, prompt_text, structured_constraints, state, created_at, budget_id, max_total_minor, currency, valid_from, valid_until, timezone_snapshot, version FROM procurement_instructions LOOP
    -- Insert initial member prompt message if none exists
    IF NOT EXISTS (SELECT 1 FROM instruction_messages WHERE instruction_id = rec.id) THEN
      INSERT INTO instruction_messages (owner_id, instruction_id, sequence_number, role, content, created_at)
      VALUES (rec.owner_id, rec.id, 1, 'MEMBER', COALESCE(NULLIF(rec.prompt_text, ''), 'Initial procurement instruction'), rec.created_at)
      RETURNING id INTO msg_id;

      -- If there is a directive or recommendations in structured_constraints, record initial assistant summary message
      IF (rec.structured_constraints->>'directive') IS NOT NULL OR (rec.structured_constraints->>'recommendations') IS NOT NULL THEN
        INSERT INTO instruction_messages (owner_id, instruction_id, sequence_number, role, content, metadata, created_at)
        VALUES (
          rec.owner_id, rec.id, 2, 'ASSISTANT',
          COALESCE(rec.structured_constraints->>'directive', 'Here are vetted options for your review.'),
          jsonb_build_object('recommendations', COALESCE(rec.structured_constraints->'recommendations', '[]'::jsonb)),
          rec.created_at + interval '1 second'
        );
      END IF;
    END IF;

    -- Insert baseline agreement if none exists
    IF NOT EXISTS (SELECT 1 FROM instruction_agreements WHERE instruction_id = rec.id) THEN
      INSERT INTO instruction_agreements (
        owner_id, instruction_id, agreement_version, instruction_version, start_sequence_number, end_sequence_number,
        plan_snapshot, confirmed_by_member_at, created_at
      )
      VALUES (
        rec.owner_id, rec.id, 1, rec.version, 1, 2,
        jsonb_build_object(
          'title', rec.structured_constraints->>'title',
          'directive', rec.structured_constraints->>'directive',
          'budgetId', rec.budget_id,
          'maxTotalMinor', rec.max_total_minor,
          'currency', rec.currency,
          'validFrom', rec.valid_from,
          'validUntil', rec.valid_until,
          'timezone', rec.timezone_snapshot,
          'selectedProvider', NULL
        ),
        CASE WHEN rec.state = 'ACTIVE' THEN rec.created_at ELSE NULL END,
        rec.created_at
      )
      RETURNING id INTO agr_id;

      UPDATE procurement_instructions SET current_agreement_id = agr_id WHERE id = rec.id AND current_agreement_id IS NULL;
    END IF;
  END LOOP;
END $$;
