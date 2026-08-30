# Work task 04 — Remove the highest recurring load

Implement only Delivery Plan point 4 from `ProductionArchitecturePlan.md`, after the screen-scoped query flow is in place. Use measured baselines from work task 01 for comparison.

## Implementation

1. **Remove repeated authentication work**
   - Preserve the current single trusted API authentication.
   - Replace repeated deleted/revoked-profile reads with a tested short-lived account-status or session-version mechanism that invalidates immediately on sensitive account changes.
   - Do not weaken authorization, RLS, deletion, blocking, or revocation checks.

2. **Scope location and nearby traffic**
   - Start location/nearby work only while the relevant screen is visible, the app is foregrounded, and permission is valid; cancel it on blur/background/logout.
   - Coalesce location writes by elapsed time and meaningful distance. Use an adaptive 30–60 second nearby refresh instead of a global 10-second loop.

3. **Make geo queries index-backed**
   - Add a reversible migration to store/query PostGIS `geography(Point)` with a GiST index, backfill safely, and keep compatibility during cutover.
   - Replace scan-based nearby logic with a bounded RPC and verify its query plan.
   - Add short-lived geo-cell caching without exposing precise locations or serving results across authorization boundaries.

4. **Normalize push devices and selective caching**
   - Add an indexed, unique `push_devices` table with user ownership, platform, token, timestamps, and revocation. Backfill, dual-write briefly, switch reads, then remove JSONB usage only after verification.
   - Cache only catalogs, tag resolution, price/config, signed URLs, entitlements, and short-lived summaries with explicit keys, TTLs, invalidation, and privacy boundaries.
   - Never recreate a large personalized preload in Redis.

## Verification and completion

- Test Auth/revocation behavior, lifecycle cancellation, cadence/distance coalescing, geo authorization, device uniqueness/revocation, and cache isolation.
- Compare Auth calls, nearby/location requests, database time/query plans, profile writes, and cache hit rate with the baseline.
- Run migrations in isolated staging, rehearse rollback, then run lint, type-checks, tests, build, and web/native smoke flows.

The task is complete when background screens create no nearby traffic, authentication is not duplicated, nearby queries use the GiST index, and push-token changes no longer rewrite profile rows.
