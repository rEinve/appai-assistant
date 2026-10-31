# Persistence foundation

PostgreSQL is the authority for instructions, obligations, jobs, outbox events, idempotency records, and audit history. The first migration is [`001_m1_foundation.sql`](migrations/001_m1_foundation.sql).

The migration is intentionally limited to the M1 durable instruction/job boundary. Purchase operations, quotes, approvals, reservations, and provider events must be added in later migrations after their domain contracts are implemented. `execution_enabled` is false by default and live adapters are constrained from enabling execution in this foundation migration.

Apply the migration to an explicitly selected local database with `psql -f packages/persistence/migrations/001_m1_foundation.sql`. Record the PostgreSQL version and migration output in the M1 evidence report. Do not use the archived v1.0 DDL.
