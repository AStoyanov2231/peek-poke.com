# Production launch requirements

- [x] Save the pre-migration recovery package and verify its guarded rollback locally; [SUPABASE_ROLLBACK.md](SUPABASE_ROLLBACK.md) describes the private archive and its limits.
- [x] Verify the native Now radius and low-density empty state, Inbox priority, editable chat suggestions and draft safety, removal of disabled Map coin controls, and the core Now-to-Poke-to-accepted-chat Simulator journey.
- [x] Verify direct native discovery-privacy selection, save, close, and reopen against a fixture account in the installed iPhone Simulator app using the [standalone XCTest runner](test/native-ui/README.md).
- [x] Verify Android emulator login, Now, incoming-Poke priority, acceptance into chat, meetup-consent cancellation, and discovery-privacy save/close/reopen using current Metro source and loopback fixtures.
- [x] Approve publication of the committed redesign source, tests, migrations, and documentation to the public GitHub repository.
- [x] Publish `product-redesign` and open draft PR #7.
- [x] Pass the initial Linux verification workflow after repairing the lockfile and browser timezone failure.
- [x] Pass all four CI jobs on the hosted-regression commit `9037c032c` and require those checks on master.
- [x] Approve and apply the 14 reviewed migrations, including the reproduced legacy account-deletion repair, to MyaouDB.
- [x] Repair hosted Poke outbox uniqueness, service-role grants, and account-erasure cleanup, including late-write rejection.
- [x] Pass the hosted product/shared-group suites and private Realtime delivery/authorization test, with exact scoped cleanup.
- [x] Seal the actual 16-migration rollback archive with all saved Storage files and verify the local rollback plus extracted file hashes.
- [x] Pass the private Storage service lifecycle and authenticated owner/outsider denial checks, with strict generated-object cleanup.
- [x] Prove erasure lock ordering and bounded stale-location cleanup with a deterministic local PostgreSQL 17 two-session harness using real lock-wait evidence and synthetic data.
- [x] Merge PR #7 into master and deploy the matching web contract after the verified database changes.
- [x] Pass the scoped deployed age-admission and social API suites, including production Redis-backed rate limiting and exact fixture cleanup.
- [ ] Release and verify the matching native binary on physical devices.
- [ ] Configure isolated Preview and Development environments before using them; Production has 22 production-only variables, while Preview and Development remain unconfigured following the shared-variable recovery described in [environment-isolation-recovery.md](docs/production-baseline/environment-isolation-recovery.md).
- [x] Configure a generated production-only `CRON_SECRET` and verify its matching Supabase Vault value without exporting either secret.
- [x] Authorize processing the 31 existing queued events and verify the authenticated Supabase-to-Vercel worker request.
- [x] Repair the reproduced legacy photo-bucket constraint failure, complete all 31 queued events, and verify the first recurring outbox request with an empty queue.
- [ ] Configure an approved external monitor and notification recipient for worker failure, queue age, dead letters, and missed scheduler runs; [observability.md](docs/production-baseline/observability.md) explains the provider limits and required delivery proof.
- [ ] Configure TURN and universal/app links, and verify APNs delivery on a physical device; APNs variables already exist.
- [ ] Verify the newly added Plan-link association with matching signed iOS/Android builds and the distributed Android signing fingerprint; [app-links.md](docs/app-links.md) records the canonical host and exact checks.
- [ ] Before enabling optional external AI suggestions, configure the explicit server-only provider settings, complete the processor/privacy review, and verify the model and fallback with compatible released clients; [chat-suggestions-provider.md](docs/chat-suggestions-provider.md) describes the disabled-by-default adapter.
- [ ] Configure a restricted server-only Google Places API key for each environment, enable Nearby Search (New), apply API and billing restrictions, and verify that venue cards remain unavailable when the key is absent or the provider fails.
- [x] Schedule the bounded stale-location cleanup directly in Supabase each minute and verify a successful scheduled run.
- [x] Schedule `purge_product_daily_activity_v1(31)` directly in Supabase daily and verify its manual execution.
- [x] Test stale-coordinate deletion under synthetic local load, including concurrent committed updates and a stale-row refresh race; [location-retention-load.md](docs/production-baseline/location-retention-load.md) records the scope and measurements.
- [ ] Verify the first daily-metrics scheduled run, configure retention failure alerts, and establish hosted load limits in an approved environment.
- [ ] Exercise the complete journey on physical iOS and Android devices, including denied permissions, camera Scan, push delivery/navigation, media/video calls, relaunch, and sign-out/account-switch isolation.
- [ ] Enable Supabase leaked-password protection after confirming the Auth plan supports it; the live security advisor reports it disabled.
- [ ] Complete an operator-specific privacy notice, supported privacy contact, formal terms, retention policy, age policy, and moderation/support response process.
- [x] Confirm the product is restricted to adults aged 18 and over.
- [x] Implement default-deny age admission across web, native, server, database RPCs, and private Realtime; local and hosted checks pass with no birth-date storage.
- [x] Reproduce and repair hosted age-release regressions, close retired chat RPC access, and seal the eighteen-migration rollback.
- [x] Verify the native pending birth-date, review-before-submit, and blocked age-admission recovery screens in the Simulator.
- [ ] Choose and operate a support/privacy contact; the user has not selected an address.
- [ ] Decide the accepted-Poke chat lifecycle from the brief's temporary-chat requirement; current chats stay open without automatic friendship, and the user has been asked about optional 24-hour closure with readable history preserved.
- [ ] Rehearse backups/PITR, restore, provider outages, load limits, canary release, and rollback using the existing production-baseline checklist.
- [ ] Before enabling meetup coin rewards, select and implement trusted-presence verification with server challenges, assertion validation, replay protection, and atomic award consumption; device/app integrity alone does not verify GPS proximity.
- [ ] Prove the selected reward mechanism on two physical devices, including freshness, replay rejection, blocks, distant participants, and concurrent awards.
- [ ] Before accepting new Peek+ payments, implement the advertised optional benefits and confirm storefront eligibility.

The user authorized verification against the existing MyaouDB database on 2026-09-08 instead of creating a paid branch.
The user subsequently approved production migration deployment and public publication, and all eighteen migrations, including the adult-admission changes and hosted corrections, are installed.
The later worker activation exposed and repaired a nineteenth constraint migration; all nineteen are installed, and the sealed recovery package now covers the additional constraint and scheduler state.
The twentieth migration adds a versioned discovery function while preserving the original contract, with exact hosted definition and grant verification and a new sealed recovery layer.
Hosted tests exposed the two corrective migration requirements despite the earlier local and read-only compatibility checks.
Those corrections are installed and the hosted product/shared-group suites now pass.
Local browser fixtures, native Simulator journeys, and the real local PostgreSQL harness pass implemented behavior but cannot establish provider, physical-device, or isolated-environment readiness.
The saved recovery archive supports undoing the exact migration batch; it does not satisfy the separate full-backup, Auth/Vault recovery, or hosted restore requirements.
Additional existing infrastructure prerequisites remain in [manual-actions.md](docs/production-baseline/manual-actions.md).
