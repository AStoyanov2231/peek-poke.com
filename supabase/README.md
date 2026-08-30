# Supabase baseline workflow

The live project was inventoried on 2026-07-30 without selecting production
user rows. The committed migration history is not present in this checkout;
the first remaining baseline action is to run the Supabase CLI against an
isolated project and commit the schema-only pull as ordered migrations.

Use separate credentials for each environment. Never put a database password,
service-role key, access token, or project-specific `.env` file in Git.

```bash
supabase --help
supabase db --help
supabase migration --help
supabase link --project-ref "$SUPABASE_PROJECT_REF"
supabase db pull 20260730_live_baseline --yes
supabase migration list --linked
supabase db diff --linked
```

Review the generated SQL before committing it. The pull must contain schema
objects only: tables, types, indexes, functions, grants, policies, triggers,
Realtime publication membership, Storage policies, and scheduled jobs. Do not
include `auth.users`, application rows, Storage object rows, or secrets.

Drift check: run `supabase db diff --linked` from a clean checkout for each
environment, then compare the output with the expected empty diff. Apply a
migration only after recording its forward SQL, verification query, and
rollback SQL in the change record.

The additive durable messaging/workflow migration is
`supabase/migrations/20260729235452_durable_workflows.sql`. Rehearse it only
after the complete hosted baseline is present, then apply the shared-contract
cursor indexes in
`supabase/migrations/20260730120000_shared_api_contract_indexes.sql`. They are
additive and reversible with drop index concurrently if exists statements
after verifying the corresponding tables and columns in the environment
baseline.

For incident rollback, disable the outbox Cron and restore the compatible API
deployment while retaining additive schema and queued rows. Do not drop
sequence, membership, device, deletion-job, idempotency, or outbox data until
the released-client compatibility window has closed and the queue is drained.
