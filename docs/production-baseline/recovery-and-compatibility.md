# Recovery, ownership, and compatibility

## Secret ownership

| Secret family | Owner | Consumers | Rotation/revocation |
| --- | --- | --- | --- |
| Supabase public key/URL | Supabase project | web and native public clients | Replace project key/config, redeploy clients |
| Supabase service role | backend owner | server-only API, jobs, smoke tests | Create replacement key, update Vercel, revoke old key |
| Redis/KV | platform owner | rate limits/cache | Rotate token, update Vercel, verify fail-closed behavior |
| Stripe secret/webhook | billing owner | checkout/webhook | Roll secret/signing secret in Stripe, update Vercel, replay a test event |
| APNs/FCM/Expo credentials | mobile owner | push delivery/EAS | Revoke provider credential, update EAS/Vercel, send a synthetic notification |

Before every rotation record the previous secret's owner, consumer list,
activation time, and rollback procedure. Secret values are never recorded.

## Compatibility rules

- Add fields/endpoints first; do not change the meaning of an existing field.
- Keep a deprecation window of at least one released mobile version plus 30 days.
- Minimum supported mobile version must be written in the release record before a breaking change.
- Migrations must be expand/verify/contract, with rollback SQL recorded before deployment.
- Canary web/API changes first, then preview/internal mobile builds, then production mobile builds.
- Rollback uses the last known-good Vercel deployment, client-compatible API behavior, and the recorded reverse migration only when it is safe for existing rows.

## Durable-workflow rollout and rollback

1. Import the complete hosted schema history into an isolated non-production
   project, then apply `20260729235452_durable_workflows.sql`.
2. Verify sequence backfill, membership cursors, RLS, UUID replay, outbox
   lease ownership, retry/dead-letter transitions, and account cleanup using
   synthetic users only.
3. Promote the additive migration before the API/Cron deployment. Old clients
   remain compatible through the legacy RPC and push-token fallbacks.
4. During rollback, stop the Cron first and drain or retain pending outbox
   rows, then restore the previous Vercel deployment. Leave additive tables,
   columns, triggers, and indexes in place while any released client or queued
   event can reference them.
5. Contract/drop schema only after the mobile compatibility window and a
   recorded zero-usage/drained-queue check. Dropping populated workflow tables
   is not a safe incident rollback.

The push-session fencing migration is intentionally migration-first but not
old-API-compatible. It leaves the legacy push RPC signatures in place as
fail-closed stubs and removes execute permission from every API role, including
`service_role`. Old route instances therefore fail push registration and
revocation until the v2 route deployment completes; they cannot fall through to
an unfenced RPC. Schedule the migration and API promotion as one controlled
window, keep the public `/api/profile/push-token` contract stable for released
clients, and do not roll the API back to a v1-calling deployment afterward.

## Backup/PITR rehearsal

The repository cannot verify Supabase backup/PITR settings or restore a hosted
project through the available read-only project tools. An owner must enable and
verify PITR, restore into an isolated non-production project, run schema/RLS/
RPC smoke checks, record recovery time and data-loss point, and retain the
rollback/cleanup commands.
