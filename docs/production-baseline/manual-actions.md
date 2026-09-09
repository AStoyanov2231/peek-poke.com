# Remaining manual actions

- Rehearse a fresh project from the complete hosted baseline and migration history recorded in [SUPABASE_ROLLBACK.md](../../SUPABASE_ROLLBACK.md).
  The compact local fixture does not recreate every legacy or provider-managed object.
- Configure separate development, preview/staging, and production Supabase/Vercel/EAS variables and project references.
  Do not reuse production values in preview.
- Configure a restricted server-only `GOOGLE_PLACES_API_KEY` in each environment, enable Nearby Search (New), and verify API and billing restrictions. The venue endpoint intentionally returns no cards until this key is present.
- The production `CRON_SECRET`, matching Vault secret, `pg_net` 0.19.5, and active every-minute outbox cron job 7 are configured.
  The explicitly authorized 31-event queue completed with zero pending, processing, or dead rows.
  Verify deployed function region, worker authorization, queue age, retry/dead-letter alerts, and Vercel-to-Supabase latency after future configuration changes.
- Keep Vercel Function compute in the configured single-region Hobby `dub1` region and reverify it after deployment configuration changes.
- Enable Supabase leaked-password protection and rerun security advisors. Record the previous setting and rollback action before changing it.
- Exact-location retention is active through cron job 5 every minute, with a successful scheduled run at 14:33 UTC.
  The product-activity metrics cron job 6 is active for 03:17 UTC daily; its first scheduled run succeeded on 2026-09-09.
  Alert on missed runs and purge failures using the reversible scheduler runbook in `../product-operations.md`.
- Configure Vercel WAF/rate-limit rules for authentication-related traffic. Supabase Auth is a direct client integration and needs provider/edge coverage.
- Enable/verify Supabase backups and PITR; rehearse restore into an isolated non-production project and record RTO/RPO, gaps, and rollback steps.
- Configure an approved external monitor and notification recipient for the structured worker records and scheduler checks in [observability.md](observability.md).
  The current Hobby plan does not include Vercel Alerts.
  Query-level DB/RPC, Realtime, and cache metrics remain unavailable until those systems expose telemetry.
- Keep production secret values only in Vercel, Supabase, and EAS. Rotate any credential that may have been exposed outside those stores before production use.
- Configure and validate APNs/FCM/Expo credentials plus universal/app-link provider association. Confirm iOS and Android notification delivery and allowlisted navigation in approved internal builds.
  Follow `../app-links.md` for canonical invitation and Plan paths, certificate requirements, and OS-level device verification.
- Record the product owner's current outbound web-billing eligibility for each iOS/Android environment, region, and storefront. Keep the native link denied where the applicable store program or policy does not permit it.
- Complete the outstanding release evidence in `../../PRODUCT_LAUNCH_BLOCKERS.md`, including physical-device journeys, provider failure injection, load, canary observation, store submission, and a hosted restore rehearsal.
  Existing browser, Simulator, hosted product, and Realtime evidence is recorded in `../product-verification.md`.
- Track the upstream `brace-expansion` advisory in the ESLint/Expo development-tool chain and the Expo `uuid` advisory. `npm audit --omit=optional` currently reports no compatible non-breaking fix for those paths; they are not imported by the deployed application runtime.
