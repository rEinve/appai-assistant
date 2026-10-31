-- Align an already-applied draft 003 migration with Better Auth's rateLimit.id key.
ALTER TABLE "rateLimit" ADD COLUMN IF NOT EXISTS id text;
UPDATE "rateLimit" SET id = key WHERE id IS NULL;
ALTER TABLE "rateLimit" ALTER COLUMN id SET NOT NULL;
ALTER TABLE "rateLimit" DROP CONSTRAINT IF EXISTS "rateLimit_pkey";
ALTER TABLE "rateLimit" DROP CONSTRAINT IF EXISTS better_auth_rate_limit_pkey;
ALTER TABLE "rateLimit" ADD CONSTRAINT better_auth_rate_limit_pkey PRIMARY KEY (id);
CREATE UNIQUE INDEX IF NOT EXISTS better_auth_rate_limit_key_idx ON "rateLimit" (key);

INSERT INTO schema_migrations (version) VALUES ('004_better_auth_rate_limit_key') ON CONFLICT (version) DO NOTHING;
