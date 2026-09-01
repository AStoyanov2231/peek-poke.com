# Remaining manual actions

- Pull the complete 134-migration schema-only baseline into an isolated project, reconcile the hosted/local migration-history name drift, apply the committed post-baseline migrations in timestamp order, and pass migration/RLS/rollback checks. The current checkout still cannot recreate the hosted schema from its partial migration history alone.
- Configure separate development, preview/staging, and production Supabase/Vercel/EAS variables and project references. Do not reuse production values in preview.
- Configure a per-environment `CRON_SECRET`, promote the migration first, then deploy the `dub1` Vercel region and outbox Cron. Verify the function region from `x-vercel-id`, worker authorization, queue age, retry/dead-letter alerts, and Vercel-to-Supabase latency.
- Enable Supabase leaked-password protection and rerun security advisors. Record the previous setting and rollback action before changing it.
- Promote the committed server-only `public.user_locations` RLS policy after isolated verification; the live advisor currently reports RLS enabled with no policy.
- Configure Vercel WAF/rate-limit rules for authentication-related traffic. Supabase Auth is a direct client integration and needs provider/edge coverage.
- Enable/verify Supabase backups and PITR; rehearse restore into an isolated non-production project and record RTO/RPO, gaps, and rollback steps.
- Create Vercel dashboard views/alerts from the structured log fields and generate real preview samples. Query-level DB/RPC, Realtime, cache, and queue metrics remain unavailable until those systems expose telemetry.
- Keep production secret values only in Vercel, Supabase, and EAS. Rotate any credential that may have been exposed outside those stores before production use.
- Configure and validate APNs/FCM/Expo credentials plus universal/app-link provider association. Confirm iOS and Android notification delivery and allowlisted navigation in approved internal builds.
- Record the product owner's current outbound web-billing eligibility for each iOS/Android environment, region, and storefront. Keep the native link denied where the applicable store program or policy does not permit it.
- Run the release evidence excluded from this goal: browser flows, TestFlight and Android internal-track device journeys, native binaries, provider failure injection, production-like load tests, canary observation, store review/submission, and rollback/PITR rehearsal.
- Track the upstream `brace-expansion` advisory in the ESLint/Expo development-tool chain and the Expo `uuid` advisory. `npm audit --omit=optional` currently reports no compatible non-breaking fix for those paths; they are not imported by the deployed application runtime.
