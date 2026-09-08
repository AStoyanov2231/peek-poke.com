# Production launch requirements

- [x] Save the pre-migration recovery package and verify its guarded rollback locally; [SUPABASE_ROLLBACK.md](SUPABASE_ROLLBACK.md) describes the private archive and its limits.
- [ ] Verify direct native privacy save/reload, generated-username onboarding, and the core Now, Poke, Chat, Plan, and meetup-confirmation Simulator journeys pass; XcodeBuildMCP now renders the native discovery-visibility baseline, but its radio controls expose no actionable element references for the save/reopen assertion.
- [x] Approve publication of the committed redesign source, tests, migrations, and documentation to the public GitHub repository.
- [x] Publish `product-redesign` and open draft PR #7.
- [x] Pass the initial Linux verification workflow after repairing the lockfile and browser timezone failure.
- [x] Pass all four CI jobs on the hosted-regression commit `9037c032c` and require those checks on master.
- [x] Approve and apply the 14 reviewed migrations, including the reproduced legacy account-deletion repair, to MyaouDB.
- [x] Repair hosted Poke outbox uniqueness, service-role grants, and account-erasure cleanup, including late-write rejection.
- [x] Pass the hosted product/shared-group suites and private Realtime delivery/authorization test, with exact scoped cleanup.
- [x] Seal the actual 16-migration rollback archive with all saved Storage files and verify the local rollback plus extracted file hashes.
- [x] Pass the private Storage service lifecycle and authenticated owner/outsider denial checks, with strict generated-object cleanup.
- [ ] Prove the erasure lock ordering using a deterministic two-session PostgreSQL harness; the hosted late-write rejections pass, but connector timing prevented a live wait assertion.
- [ ] Deploy the matching web/native contracts after the verified database changes.
- [ ] Separate preview/production variable scopes and validate production Redis connectivity; the credentials exist but cannot be read through the CLI.
- [x] Configure a generated production-only `CRON_SECRET` and verify its matching Supabase Vault value without exporting either secret.
- [ ] Authorize processing the 31 existing queued events, then verify and activate outbox scheduling and monitoring.
- [ ] Configure TURN and universal/app links, and verify APNs delivery on a physical device; APNs variables already exist.
- [ ] Configure a restricted server-only Google Places API key for each environment, enable Nearby Search (New), apply API and billing restrictions, and verify that venue cards remain unavailable when the key is absent or the provider fails.
- [x] Schedule the bounded stale-location cleanup directly in Supabase each minute and verify a successful scheduled run.
- [x] Schedule `purge_product_daily_activity_v1(31)` directly in Supabase daily and verify its manual execution.
- [ ] Verify the first daily-metrics scheduled run, configure retention failure alerts, and test stale-coordinate deletion under load.
- [ ] Exercise the complete journey on physical iOS and Android devices, including denied permissions, camera Scan, push delivery/navigation, media/video calls, relaunch, and sign-out/account-switch isolation.
- [ ] Enable Supabase leaked-password protection after confirming the Auth plan supports it; the live security advisor reports it disabled.
- [ ] Complete an operator-specific privacy notice, supported privacy contact, formal terms, retention policy, age policy, and moderation/support response process.
- [x] Confirm the product is restricted to adults aged 18 and over.
- [x] Implement default-deny age admission across web, native, server, database RPCs, and private Realtime; local and hosted checks pass with no birth-date storage.
- [x] Reproduce and repair hosted age-release regressions, close retired chat RPC access, and seal the eighteen-migration rollback.
- [ ] Verify the native pending, review, and blocked age-admission screens directly; the enabled XcodeBuildMCP Simulator surface renders native screens, but fixture sign-in currently has no visible transition or runtime error after its Sign In action.
- [ ] Choose and operate a support/privacy contact; the user has not selected an address.
- [ ] Rehearse backups/PITR, restore, provider outages, load limits, canary release, and rollback using the existing production-baseline checklist.
- [ ] Before enabling meetup coin rewards, integrate server-verified device attestations and prove freshness, replay rejection, blocks, exact proximity, concurrent awards, and two-device behavior.
- [ ] Before accepting new Peek+ payments, implement the advertised optional benefits and confirm storefront eligibility.

The user authorized verification against the existing MyaouDB database on 2026-09-08 instead of creating a paid branch.
The user subsequently approved production migration deployment and public publication, and all eighteen migrations, including the adult-admission changes and hosted corrections, are installed.
Hosted tests exposed the two corrective migration requirements despite the earlier local and read-only compatibility checks.
Those corrections are installed and the hosted product/shared-group suites now pass.
Local browser fixtures and embedded PostgreSQL pass the implemented behavior but cannot establish production-provider or physical-device readiness.
The saved recovery archive supports undoing the exact migration batch; it does not satisfy the separate full-backup, Auth/Vault recovery, or hosted restore requirements.
Additional existing infrastructure prerequisites remain in [manual-actions.md](docs/production-baseline/manual-actions.md).
