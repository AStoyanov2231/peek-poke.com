# Product operations runbook

## Scope and ownership

This runbook describes the production scheduler configuration and its reversible operating checks.
Run every SQL command in the Supabase SQL Editor as the project owner and retain the result in the private release record.
Never copy a Vault value, Vercel secret, authorization header, account identifier, or request body into the release record.

The project has `pg_cron`, Vault, and `pg_net` installed.
`pg_net` 0.19.5 is used only for the outbox HTTP invocation.
Vercel Hobby permits one cron invocation per day with hour-level timing, so it cannot drive the one-minute outbox or location-retention cadence.

## Production readiness snapshot - 2026-09-08

The private pre-change snapshot is `.supabase-backups/deployment-20260908/ops-prechange-snapshot.json`.
The original snapshot remains a valid chronological record of the pre-change state: `pg_cron` 1.6.4, no `pg_net`, one active weekly soft-deleted-message cleanup job, and no Vault entries.
Master PR 7 is merged at `b8d33750364d8fa38b18e9daa74b33d1aa50331e`; Vercel deployment `dpl_87orq3DQNsTpfVMJK5827FMut7y2` is READY.
Its current Function region is `iad1`.
The single-region Hobby `dub1` configuration is a separate next change and is not part of this deployment.
Production now has a generated production-only Vercel `CRON_SECRET` and the matching Vault entry `peek_poke_outbox_cron_secret`; a SHA-256 equality check verified the match without exporting either value.
Retention job 5 purges stale locations each minute, and job 6 purges old product metrics daily at 03:17 UTC.
Both cleanup functions completed their manual preflight with no expired records present, and job 5 completed a scheduled successful run at 14:33 UTC on 2026-09-08.
Job 6 has not yet reached its first scheduled time.
The original weekly job 2 remains unchanged.
After explicit operator authorization, the 31 pre-existing events completed: seven profile-photo approvals and four quarantines were processed, and the queue now has zero pending, processing, or dead events.
Outbox cron job 7 is active each minute; its first scheduled run completed at 15:13 UTC with HTTP 200 and an empty queue response with all counters zero.
The exact created-job metadata and reversal instructions are saved privately in `.supabase-backups/deployment-20260908/ops-created-retention-jobs.json` and `OPERATIONS_ROLLBACK.md`.
The complete nineteen-migration recovery archive has SHA-256 `51c56b1e7cbbea54cd7ddccd114f5af046cd15b70395015e674925594379d1c` and verifies 153 payloads.
It preserves the nested eighteen-migration recovery archive and includes guarded photo and operations reversals.

## Required scheduler design

Use direct `pg_cron` jobs for database-only, bounded cleanup.
These jobs do not need an HTTP endpoint, Vercel deployment, `pg_net`, or a decrypted secret.

| Job name | UTC schedule | Command | Bound |
| --- | --- | --- | --- |
| `peek_poke_purge_stale_locations_v1` | `* * * * *` | `select public.purge_stale_user_locations(1000);` | Deletes at most 1,000 locations older than ten minutes. |
| `peek_poke_purge_product_activity_v1` | `17 3 * * *` | `select public.purge_product_daily_activity_v1(31);` | Retains the fixed 31-day aggregate window. |

Use `pg_net` only for `GET /api/internal/outbox`.
The route has a 60-second Node.js maximum duration, claims a bounded batch of 25 events, and authenticates only a `Bearer` token matching `CRON_SECRET`.
Store that value in Vault under a unique name such as `peek_poke_outbox_cron_secret`.
Do not place the secret in SQL text, `cron.job.command`, a migration, Vercel logs, or a shell history.

The intended outbox schedule is `* * * * *`.
The outbox RPC leases each claimed event, so overlapping invocations cannot legitimately complete the same leased event twice, but the operator must still alert on queue age and failed HTTP responses.

## Snapshot before any mutation

Capture the following metadata before enabling `pg_net`, creating a Vault entry, or scheduling a job.
Do not query `vault.decrypted_secrets` for this snapshot.

```sql
select extname, extversion
from pg_extension
where extname in ('pg_cron', 'pg_net', 'supabase_vault')
order by extname;

select jobid, jobname, schedule, command, database, username, active
from cron.job
order by jobid;

select jobid, runid, status, start_time, end_time, return_message
from cron.job_run_details
where start_time >= now() - interval '7 days'
order by start_time desc;

select id, name, description, created_at, updated_at
from vault.secrets
order by created_at;

select name, setting
from pg_settings
where name like 'pg_net%'
order by name;
```

Record the Vercel project plan, region, deployment ID, and the names plus scopes of the existing environment variables.
Confirm that production has a newly generated `CRON_SECRET` before any outbox scheduler is enabled.
Do not reuse a preview secret, a Supabase key, or a value that previously appeared outside a secret store.

## Apply in a controlled window

1. Verify the deployed application routes before changing an HTTP scheduler.
2. Verify `pg_net` 0.19.5 remains present in `pg_extension`.
3. Verify the production `CRON_SECRET` and matching Vault entry by a non-exporting equality check.
4. Verify direct database jobs 5 and 6, outbox job 7, and original weekly job 2 against their saved IDs and commands; do not duplicate them.
5. Verify an authorized manual route invocation only when its queued work is approved.
6. Keep the saved pre-change snapshot and each returned `jobid` with the release record.

The operator should use `cron.schedule` with the exact job names in the table above.
The following templates contain no credential value and are recovery references only.
Do not run them against the current production configuration because jobs 5, 6, and 7 already exist.

```sql
select cron.schedule(
  'peek_poke_purge_stale_locations_v1',
  '* * * * *',
  $$select public.purge_stale_user_locations(1000);$$
);

select cron.schedule(
  'peek_poke_purge_product_activity_v1',
  '17 3 * * *',
  $$select public.purge_product_daily_activity_v1(31);$$
);

select cron.schedule(
  'peek_poke_outbox_v1',
  '* * * * *',
  $$
    select net.http_get(
      url := 'https://www.peek-poke.com/api/internal/outbox',
      headers := jsonb_build_object(
        'Authorization',
        'Bearer ' || (
          select decrypted_secret
          from vault.decrypted_secrets
          where name = 'peek_poke_outbox_cron_secret'
        )
      ),
      timeout_milliseconds := 55000
    );
  $$
);
```

For the HTTP job, the command should call `net.http_get` against the production `/api/internal/outbox` URL with a 55-second timeout and an `Authorization` header assembled from the Vault value at execution time.
The command must reference the Vault secret by name through `vault.decrypted_secrets` and must not interpolate the secret into the job definition.

Use a distinct job name such as `peek_poke_outbox_v1`.
Before scheduling, verify that no existing `cron.job` row uses any planned job name.
If the name exists, stop and reconcile the existing command instead of replacing it implicitly.

## Validation after each change

Validate direct cleanup with one manual bounded invocation before enabling its cron job.
Confirm the return is an integer between zero and 1,000 for location cleanup and that the metric purge returns successfully.
Verify that the cron execution role has `EXECUTE` for both cleanup functions before scheduling them.

Validate the outbox route with one manually authorized request after deployment.
First inspect only counts grouped by event type and status; do not include payloads or account identifiers.
An empty queue permits a route-wiring check without notification delivery.
If the queue is nonempty, processing it requires explicit operator authorization before a manual request or schedule activation.
Expect HTTP 200 and a privacy-safe JSON payload containing `claimed`, `completed`, `retried`, `dead`, `cleaned`, and `queue_age_seconds`.
Do not create a synthetic outbox event or call any broad cleanup to perform this check.

After the next scheduled run, inspect only these metadata sources:

```sql
select jobid, jobname, schedule, active
from cron.job
where jobname in (
  'peek_poke_purge_stale_locations_v1',
  'peek_poke_purge_product_activity_v1',
  'peek_poke_outbox_v1'
)
order by jobname;

select jobid, status, start_time, end_time, return_message
from cron.job_run_details
where start_time >= now() - interval '1 day'
order by start_time desc;
```

For the `pg_net` request, inspect its response metadata within its limited retention window and correlate it with the Vercel Runtime Log request ID and the `outbox_batch` log line.
Treat an HTTP 5xx response, non-zero `dead`, or increasing `queue_age_seconds` as a release alert.
`pg_net` records are not durable through an unclean shutdown and expire by default, so they are evidence for recent delivery only.

## Monitoring and rollback

Create alerts for missing expected cron runs, any `cron.job_run_details.status` other than success, Vercel 5xx responses for either internal route, `dead > 0`, and queue age increasing over consecutive outbox invocations.
The current routes are bounded and idempotent at their durable database boundary, but the scheduler must not be treated as exactly-once delivery.

To disable a job, first record its `jobid` and most recent run state, then use `cron.unschedule(jobid)` with that captured identifier.
Disable the outbox job before rolling back an application deployment.
Retain pending outbox rows and do not drop additive workflow objects while any released client or queued event can reference them.
Keep the Vault secret until the scheduled job is confirmed disabled and its final `pg_net` response window has elapsed, then rotate or delete it under the provider's secret-management procedure.

## Repository checks

Run the deterministic checks before the production window:

```sh
npx vitest run test/outbox-auth.test.ts test/privacy-cleanup-route.test.ts test/outbox-retry.test.ts test/account-deletion-outbox.test.ts
npm run test:product-db
npm run lint
npm test
npm run build
```

The production mobile build evaluates `apps/native/app.config.js` and rejects missing or mismatched production public API and Supabase origins.
Run the configured EAS production build configuration evaluation for each platform before submitting a binary.

## References

- [Supabase Cron](https://supabase.com/docs/guides/cron) documents `cron.job`, `cron.job_run_details`, and the recommended bound on concurrent jobs.
- [Supabase pg_net](https://supabase.com/docs/guides/database/extensions/pg_net) documents asynchronous HTTP behavior, response retention, and `net.http_get`.
- [Supabase Vault](https://supabase.com/docs/guides/database/vault) documents encrypted storage and warns that `vault.decrypted_secrets` exposes plaintext values.
- [Vercel Cron usage and pricing](https://vercel.com/docs/cron-jobs/usage-and-pricing) documents Hobby's daily-only schedule and imprecise timing.
