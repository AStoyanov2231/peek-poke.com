# Local stale-location retention load validation

This report records one opt-in local PostgreSQL validation run executed on 2026-09-08.
The command was `node test/sql/postgres-concurrency.mjs --load`.
The runner started PostgreSQL 17.11 from Homebrew in a temporary Unix-socket-only cluster and removed that cluster after completion.
The machine was a Mac16,10 with 10 logical CPUs and 16 GiB of memory.
The fixture used the current `public.purge_stale_user_locations(integer)` definition from `supabase/migrations/20260908113454_privacy_location_retention.sql`.
The fixture created `public.user_locations(user_id uuid primary key, updated_at timestamptz not null)` with its primary-key btree on `user_id`.
A 2026-09-08 read-only production `pg_indexes` query confirmed that `user_locations_pkey(user_id)` is the only live index on this table.
No synthetic `updated_at` index was added because it would not match that production index set.
The workload inserted 100,000 stale rows and 1,000 fresh rows, then called the function with batch size 1,000 until it returned zero.
Three concurrent local sessions each committed 1,000 recorded fresh-location updates while the purger ran.
Every observed purge result was between zero and 1,000 rows, and every batch retained all 1,000 fresh rows.
The run deleted exactly 100,000 stale rows, left zero stale fixture rows, retained all 1,000 fresh fixture rows, and recorded all 3,000 concurrent updates.
The run separately locked and refreshed one stale row, observed the purger skip it, committed the refresh, and confirmed that the row remained fresh after commit.
The run completed 101 purge calls in 3.604862042 seconds with a measured p50 call time of 19.752333 ms, p95 call time of 31.431959 ms, and 27,740.313 stale rows per second.
These timings are local observations only and are not a production SLO or capacity commitment.
This validation does not model hosted hardware, production cache state, autovacuum, RLS request traffic, full live API write patterns, or multi-region connection behavior.
This validation used no hosted database, credentials, user records, providers, or outgoing events.
