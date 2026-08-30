# Supabase live inventory — 2026-07-30

Project: `MyaouDB` (`ttojvnwpnpuhkyjncwxn`), status `ACTIVE_HEALTHY`.

This inventory uses catalog metadata and project APIs only. No application
rows, authentication users, message contents, profile values, or Storage
objects were read.

## Confirmed

- Region: `eu-west-1`.
- PostgreSQL: 17.6.1.063 / engine 17.
- 23 public tables, 4 public enum types, 77 public indexes, 29 public RLS policies, and 6 public triggers.
- 134 migrations exist in the hosted migration history, but their SQL is not present in this checkout.
- Installed extensions include `pg_cron` 1.6.4, `pg_stat_statements` 1.11, `pg_trgm` 1.6, `pgcrypto` 1.3, `plpgsql` 1.0, `supabase_vault` 0.3.1, and `uuid-ossp` 1.1.
- Application tables include profiles, friendships, DM threads/messages, profile photos/interests, roles/permissions, subscriptions, blocks, coins, locations, reports, and billing entitlement state.
- Application RPCs include profile/friend/thread/message/search/nearby/coin/account-erasure/push-token operations plus triggers.
- `public.dm_messages` is the only public table in `supabase_realtime`.
- One active `pg_cron` job deletes soft-deleted DM messages older than 30 days weekly.
- Storage buckets: `covers` and `profile-photos` are public; `media`, `private-migration-backups`, and `private-profile-photos` are private. All have a 2 MiB file-size limit and image MIME allowlists.
- Security advisor findings: leaked-password protection is disabled; `public.user_locations` has RLS enabled without a policy.

## Not yet reproducible from Git

The current checkout has no ordered schema SQL. A schema-only `supabase db
pull` into an isolated project is still required before calling production
recreation or drift comparison proven. This is intentionally not fabricated
from application types: those cannot reproduce functions, grants, policies,
triggers, cron, Realtime, or Storage configuration.
