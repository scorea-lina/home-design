# Database Migrations (Supabase)

HomeDesign uses Supabase (Postgres). QA + prod share the same DB instance.

## Rule: migrations require explicit approval

Because QA and prod share a DB, **any schema change must be pre-approved**. Prefer additive changes.

## Where migrations live

- `web/supabase/*.sql`
  - Examples: `schema_tasks.sql`, tag schemas, milestone migrations.

## Applying migrations

Common path:

1) Ensure `web/.env.local` has `SUPABASE_DB_URL`.

2) Run migration using psql:

```bash
cd web
/opt/homebrew/opt/libpq/bin/psql "$SUPABASE_DB_URL" -f supabase/<migration>.sql
```

## Safety

- Prefer `create table if not exists` and `create index if not exists`.
- Avoid destructive changes. If needed, ship a safe migration + follow-up cleanup.
