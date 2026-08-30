# Work task 01 — Establish a safe production baseline

Implement only Delivery Plan point 1 from `ProductionArchitecturePlan.md`. Preserve current product behavior and do not begin the shared-contract or data-flow migrations.

## Implementation

1. **Version the Supabase baseline**
   - Inventory the live schema, extensions, RPCs/functions, grants, RLS policies, triggers, cron jobs, Realtime configuration, and Storage buckets/policies without reading or committing production user data.
   - Add an ordered `supabase/` migration baseline plus configuration and a short drift workflow. Keep secrets and environment-specific IDs out of Git.
   - Prove the migrations can recreate the database in an empty local or isolated staging project, then compare it with production for unexplained drift.

2. **Add measurable request tracing**
   - Create one server request-context utility that accepts or generates a request ID, returns it in responses, and propagates it to Supabase, Redis, Stripe, Storage, and push operations where supported.
   - Add privacy-safe structured logs/traces and dashboards for p50/p95/p99 latency, request and Auth-call counts, payload size, database/RPC time, Realtime connections, cache hit rate, failures, and queue age. Never log tokens, secrets, message content, or personal profile data.
   - Capture and commit a dated baseline report from representative web/API and native flows; label unavailable metrics as unavailable rather than estimating them.

3. **Lock down regions and environments**
   - Verify Supabase is in `eu-west-1` and configure Vercel functions in the matching supported region; record measured cross-service latency.
   - Define separate development, preview/staging, and production Supabase/Vercel/EAS environment mappings. Add a build/deploy guard that fails if a preview mobile build resolves to the production Supabase project.
   - Keep public client configuration separate from server-only secrets and document required variables without recording values.

4. **Document recovery and compatibility**
   - Inventory every secret owner and consumer, document rotation/revocation steps, and keep values only in Vercel, Supabase, and EAS secret stores.
   - Verify backups/PITR and perform a restore rehearsal into an isolated non-production project; record the result, recovery gaps, and rollback steps.
   - Document additive-first API changes, deprecation windows, minimum supported mobile version, migration rollback, and web/API-first canary rules.

5. **Close the immediate safety gaps**
   - Enable and verify Supabase leaked-password protection.
   - Add explicit WAF/rate-limit coverage for authentication routes, with production-safe failure behavior.
   - Apply shared hard request-body and pagination limits to every applicable route, with deterministic `400`/`413` responses.
   - Reproduce and fix the onboarding interest-ID defect at the contract/API boundary; add regression coverage for web and Expo callers.

## Verification and completion

- Run lint, type-checks, unit/security tests, production build, and relevant live smoke tests against non-production first.
- Confirm a clean database can be recreated from committed migrations and that the drift check passes.
- Verify request IDs appear end-to-end, dashboards receive real samples, limits reject oversized inputs, preview cannot target production, and the interest regression test passes.
- For any required production setting change, record the previous value and rollback command before applying it, then verify after deployment.

The task is complete only when production is reproducible from the repository, current performance has a dated evidence-backed baseline, environment isolation and recovery are proven, immediate safety gaps are closed, and every change has a documented rollback.
