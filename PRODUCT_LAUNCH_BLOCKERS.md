# Production launch requirements

- [x] Save the pre-migration recovery package and verify its guarded rollback locally; [SUPABASE_ROLLBACK.md](SUPABASE_ROLLBACK.md) describes the private archive and its limits.
- [ ] Verify direct native privacy save/reload; generated-username onboarding and the core Now, Poke, Chat, Plan, and meetup-confirmation Simulator journeys pass.
- [ ] Approve publication of the committed redesign source, tests, migrations, and documentation to the public GitHub repository; automatic approval review rejected the branch push pending explicit disclosure authorization.
- [ ] Publish `product-redesign`, open the prepared draft pull request, run the verification workflow on GitHub, and configure required checks.
- [ ] Approve deployment of the 14 reviewed migrations, including the reproduced legacy account-deletion repair, to MyaouDB; automatic approval review rejected verification authorization as insufficient for schema deployment.
- [ ] Apply the ordered migrations and pass full RLS, Storage, Realtime, account-deletion, concurrent mutation, and rollback checks with dedicated synthetic accounts.
- [ ] Deploy the matching web/native contracts after the verified database changes.
- [ ] Configure preview/production variables separately, distributed rate limiting, authorized outbox processing, push credentials, universal/app links, and worker monitoring.
- [ ] Configure a restricted server-only Google Places API key for each environment, enable Nearby Search (New), apply API and billing restrictions, and verify that venue cards remain unavailable when the key is absent or the provider fails.
- [ ] Deploy and schedule `/api/internal/privacy-cleanup` with `CRON_SECRET`, monitor missed/failing runs, and verify stale exact-coordinate deletion under load.
- [ ] Schedule `purge_product_daily_activity_v1` with service-only credentials to enforce the documented 31-day daily-metrics retention, and monitor failed runs.
- [ ] Exercise the complete journey on physical iOS and Android devices, including denied permissions, camera Scan, push delivery/navigation, media/video calls, relaunch, and sign-out/account-switch isolation.
- [ ] Enable Supabase leaked-password protection after confirming the Auth plan supports it; the live security advisor reports it disabled.
- [ ] Complete an operator-specific privacy notice, supported privacy contact, formal terms, retention policy, age policy, and moderation/support response process.
- [ ] Rehearse backups/PITR, restore, provider outages, load limits, canary release, and rollback using the existing production-baseline checklist.
- [ ] Before enabling meetup coin rewards, integrate server-verified device attestations and prove freshness, replay rejection, blocks, exact proximity, concurrent awards, and two-device behavior.
- [ ] Before accepting new Peek+ payments, implement the advertised optional benefits and confirm storefront eligibility.

The user authorized verification against the existing MyaouDB database on 2026-09-08 instead of creating a paid branch.
Preflight found no compatibility blocker for the 14 reviewed migrations, but their deployment still needs explicit approval after automatic approval review rejected the first apply attempt.
No migration was applied by that attempt.
Local browser fixtures and embedded PostgreSQL pass the implemented behavior but cannot establish production-provider or physical-device readiness.
The saved recovery archive supports undoing the exact migration batch; it does not satisfy the separate full-backup, Auth/Vault recovery, or hosted restore requirements.
Additional existing infrastructure prerequisites remain in [manual-actions.md](docs/production-baseline/manual-actions.md).
