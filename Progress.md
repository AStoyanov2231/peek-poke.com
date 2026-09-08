# Product redesign progress

Branch: `product-redesign`.
Brief: [PRODUCT-REDESIG.md](PRODUCT-REDESIG.md).
Updated: 2026-09-08.

## Current state

The web redesign and nineteen database migrations are deployed after the user's approval.
Master is `d41ea0b312de6eee8cf9d98b8242628dc7a978e6`, merged through PRs #7 and #8 with passing required CI.
Vercel deployment `dpl_AFPvN11NF3cPp5w6uLSQYDTPrViJ` serves both public domains from `dub1`, matching Supabase's Dublin region.
All 31 authorized queued events completed, and the recurring worker returned HTTP 200 after deployment.
The saved migration-specific recovery package covers all nineteen changes, original application data and Storage files, and guarded scheduler reversal; it is not a complete Auth/Vault disaster-recovery backup.
The current database baseline has 50 profiles, 11 Auth users, 96 Storage objects, and 182 migration entries.

The native development build now includes editable chat reply suggestions, Now radius and low-density actions, prioritized Inbox selection, and removal of unavailable map-coin controls.
Simulator verification reached pending age admission, date review, blocked-account recovery, and Now through Poke acceptance into chat.
Direct native privacy save/reload remains unverified because the available Simulator automation cannot activate the rendered radio controls.
Real separate-session PostgreSQL lock and bounded-retention verification passes with synthetic local data.
Production has twenty-two verified Production-only variables, with no project variables in Preview or Development.
An environment-scope operation accidentally deleted shared variable records; Production was restored, rebuilt, and passed deployed API verification as documented in [environment-isolation-recovery.md](docs/production-baseline/environment-isolation-recovery.md).
Preview and Development require isolated service configuration before use.
Operator details, provider configuration, physical-device proof, monitoring, and full recovery prerequisites remain in [PRODUCT_LAUNCH_BLOCKERS.md](PRODUCT_LAUNCH_BLOCKERS.md).
The sections below retain chronological implementation and verification evidence, including earlier counts and resolved blockers.

## Applied production migrations

Target: MyaouDB (`ttojvnwpnpuhkyjncwxn`).
The following files were applied in numeric order after explicit approval.
They add the new social data model and service-only APIs, replace legacy paid social behavior with free friendship/messaging, and repair the observed account-deletion SQL failure.
The changes also affect existing function permissions and behavior, so the database deployment must be coordinated with the matching application release.
Existing records are preserved by the migration scripts; retention deletion runs only when its dedicated worker is invoked.

- [20260908113140_free_social_graph_and_coarse_nearby.sql](supabase/migrations/20260908113140_free_social_graph_and_coarse_nearby.sql).
- [20260908113317_product_social_intent.sql](supabase/migrations/20260908113317_product_social_intent.sql).
- [20260908113327_product_plans.sql](supabase/migrations/20260908113327_product_plans.sql).
- [20260908113338_meeting_social_eligibility.sql](supabase/migrations/20260908113338_meeting_social_eligibility.sql).
- [20260908113347_mutual_meetup_acknowledgements.sql](supabase/migrations/20260908113347_mutual_meetup_acknowledgements.sql).
- [20260908113454_privacy_location_retention.sql](supabase/migrations/20260908113454_privacy_location_retention.sql).
- [20260908113507_discovery_audience_preferences.sql](supabase/migrations/20260908113507_discovery_audience_preferences.sql).
- [20260908113518_plan_nearby_discovery.sql](supabase/migrations/20260908113518_plan_nearby_discovery.sql).
- [20260908113529_private_product_funnel_metrics.sql](supabase/migrations/20260908113529_private_product_funnel_metrics.sql).
- [20260908113540_profile_social_context.sql](supabase/migrations/20260908113540_profile_social_context.sql).
- [20260908113628_private_product_activity_metrics.sql](supabase/migrations/20260908113628_private_product_activity_metrics.sql).
- [20260908113639_plan_meetup_attribution.sql](supabase/migrations/20260908113639_plan_meetup_attribution.sql).
- [20260908113651_plan_recent_member_lifecycle.sql](supabase/migrations/20260908113651_plan_recent_member_lifecycle.sql).
- [20260908113704_legacy_sql_special_forms.sql](supabase/migrations/20260908113704_legacy_sql_special_forms.sql).
- [20260908115135_product_social_runtime_grants_and_outbox_indexes.sql](supabase/migrations/20260908115135_product_social_runtime_grants_and_outbox_indexes.sql).
- [20260908121358_account_erasure_product_social_records.sql](supabase/migrations/20260908121358_account_erasure_product_social_records.sql).
- [20260908134739_account_age_admission.sql](supabase/migrations/20260908134739_account_age_admission.sql).
- [20260908135910_adult_social_runtime_corrections.sql](supabase/migrations/20260908135910_adult_social_runtime_corrections.sql).
- [20260908150805_profile_photo_moderation_buckets.sql](supabase/migrations/20260908150805_profile_photo_moderation_buckets.sql).

The initial 13 redesign migrations passed hosted read-only compatibility review and the ordered embedded PostgreSQL chain.
The fourteenth legacy SQL repair passed an execution-failure regression and permission/security-context preservation checks.
The first sixteen migrations produced 179 history entries; the three subsequent corrections and admission changes bring the current total to 182.
Their SQL bytes match the reviewed SHA-256 values; only filenames and direct references changed to retain the actual remote migration versions.
Hosted testing exposed Poke outbox uniqueness, server-role privilege, and soft-deletion cleanup defects.
The hosted regressions now pass, and later sections record admission and worker verification after the remaining migrations.

## Completed implementation

- [x] Read the full brief, inspect web/native/shared architecture, and research relevant interaction, accessibility, and privacy practices.
- [x] Establish a warm cream/coral identity, new brand mark, readable hierarchy, accessible focus, reduced motion, browser zoom, and text selection.
- [x] Add a public landing page with acquisition links, product explanation, safety guidance, and useful routes before authentication.
- [x] Make Now the authenticated home and keep Map, Inbox, and Me as the primary mobile destinations.
- [x] Add activity availability with automatic expiry, immediate cancellation, duration presets, and web custom end times.
- [x] Add ranked, coarse-distance discovery by activity, friendship, shared interests, and radius.
- [x] Show current activity on Map pins and selected cards, preserve neighborhood context without automatic orbiting, and carry activity into Pokes.
- [x] Provide useful low-density and failure states with wider radius, invitation links, Plan creation, Scan, and retry.
- [x] Implement contextual Pokes with bounded notes, expiry, rate limits, block enforcement, and durable idempotency for success and terminal errors.
- [x] Accept Pokes into a free direct conversation atomically, including concurrent/retried requests.
- [x] Organize Inbox into Pokes, Plans, and Messages with shared pending-Poke badge state and local expiry handling.
- [x] Add authorized contextual chat suggestions and optional coarse venue cards that fill an editable composer or Plan prefill and never send automatically.
- [x] Surface server-authorized profile context on web and native: expiring availability, contextual Poke defaults, shared Circles, viewer-visible upcoming Plans, and clearly labeled mutual meetup acknowledgements.
- [x] Add Plans with time, place, capacity, private/friends/Circle/open visibility, source conversation, member display names, edit/cancel/leave, and share revocation.
- [x] Keep recent member Plans reachable for 48 hours, require explicit Plan-specific mutual confirmation, and block rescheduling after the start.
- [x] Report distinct-Plan meetup conversion by scheduled-start cohort, with cancelled Plans in the denominator and no inferred historical attribution.
- [x] Add anonymous Plan previews and QR links that preserve the invitation through sign-in and onboarding, with a separate explicit join action.
- [x] Preserve arbitrary QR Circle semantics while allowing recognized Plan URLs to open previews safely.
- [x] Preserve Circles as lightweight group coordination and add Circle Plan creation.
- [x] Explain location permission before requesting it and keep onboarding recoverable when location is declined.
- [x] Hide profile availability at expiry even when its background refresh fails offline.
- [x] Remove subscription/coin gates from friendship, messaging, and ordinary public profile photos while preserving private-photo boundaries.
- [x] Disable new Peek+ sales until optional paid features exist, preserving management for existing subscriptions.
- [x] Restore consented location discovery with fresh device samples, server receipt time, coarse output, and ten-minute discovery exclusion.
- [x] Add a bounded, authorized cleanup worker for stale exact coordinates; scheduler activation remains a release prerequisite.
- [x] Implement private mutual meetup acknowledgement with explicit confirmation from each participant, expiry, blocks, stable retries, and current-state refresh.
- [x] Instrument the new social lifecycle without message text, names, or precise coordinates in product events.
- [x] Add service-only daily and weekly social-activity aggregates without content, names, account IDs, or location data in their responses.
  A separate durable first-activation record now preserves the first availability or Poke action; daily discovery counts use only server-returned coarse opportunity counts.
- [x] Align native Now, Pokes, Plans, safe QR routing, permission flow, premium messaging, and mutual meetup acknowledgement with shared contracts.
- [x] Package additive migrations in dependency order under `supabase/migrations`.
- [x] Deliver Poke creation/acceptance through atomic outbox events, fresh authorization checks, generic push, typed native routes, and private realtime cache refresh.

## Verification evidence

- [x] Prepare a read-only GitHub Actions gate for locked installs, web lint/tests/build, both SQL fixtures, native checks, and nine browser fixture journeys.
- [x] Validate the CI-equivalent production build with inert environment values on Node 24.10.0; the tracked process exited 0 (`/tmp/peek-ci-build-root.log`).
- [x] Run the initial GitHub workflow on the published branch and repair the clean-install and browser-timezone failures.
- [x] Pass all four GitHub CI jobs on hosted-regression commit `9037c032c`, for both push and pull-request triggers.

- [x] Web/server: 1,314 tests pass across 147 files; three hosted-database integration suites deliberately skip without explicit target credentials.
- [x] Root lint and the production build pass in `/tmp/peek-product-final-web-lint.log` and `/tmp/peek-product-final-web-build.log`.
- [x] Nine browser journeys pass through real application rendering and sign-in against isolated loopback fixtures in `/tmp/peek-web-fixture-e2e-privacy-final.log`.
- [x] Native final gate: 486 Vitest tests across 63 files and 90 Jest tests across 30 iOS/Android suites pass, for 576 tests total.
- [x] Verify native Poke sender context, note, absolute local expiry, accepted-chat navigation, and cleared Inbox Pokes badge.
- [x] The browser checks cover first-time onboarding, activity and retry-stable Pokes, chat and mutual meetup acknowledgement, editable venue-to-Plan prefill, privacy save/retry, deletion failure recovery, public invitation return/join, activity Map and profile context, recent-Plan mutual confirmation with retry, and empty/error states.
- [x] Phone and desktop screenshots inspected, including responsive onboarding and privacy controls.
- [x] Every additive migration executes in embedded PostgreSQL against the metadata-derived legacy fixture.
- [x] SQL checks cover free social gates, idempotency, Plan membership/capacity/shares/nearby visibility, blocks and audience scopes, mutual acknowledgement, bounded coordinate cleanup, and private aggregate semantics.
- [x] Fixed and verified the native account-switch race that could let stale queued writes recreate cleared call state.
- [x] Signed iOS and Android compilation pass after the scene-configuration and SDK compatibility fixes.
- [x] Run the existing hosted QR migration boundary with real authentication and verify direct-client access denial.
- [x] Pass the complete hosted shared-group lifecycle after repairing the reproduced legacy account-deletion SQL defect.
- [x] Prepare a narrow correction for the 13 affected legacy functions, preserving signatures, security context, and grants; execute it in the ordered embedded PostgreSQL chain and in a failure-reproduction regression.
- [x] Add 10 fail-closed integration-target guard tests and prepare scoped hosted Poke, Plan concurrency, mutual confirmation, access-denial, and block coverage.
- [x] Verify native Login, Now availability, Poke Send, Inbox accept-to-chat, Plan creation/detail/Back, recent mutual confirmation, Plan again, location Not now recovery, Me, and loaded discovery controls.
- [x] Inspect the native chat empty-state screenshot; native fixture privacy PATCH/GET persistence passes independently.
- [x] Replay native onboarding from interests through optional intent/location decline and confirm completion in fixture bootstrap.
- [x] Verify native generated-username entry, chosen username persistence, and completion through interests and optional intent/location decline.
- [ ] Verify direct native UI privacy save/reload; the UI bridges omit its radio/button targets or time out.
- [ ] Verify the hosted schema, real RLS/Storage/Realtime, provider behavior, and concurrent connections using dedicated synthetic accounts in the user-approved database.
- [ ] Verify physical iOS/Android devices, real push delivery, camera, microphone/video, and production-like load/recovery.

The fixture browser tests verify application interactions and transport contracts, not hosted Supabase authentication, RLS, Storage, or provider delivery.
The embedded PostgreSQL harness executes real SQL, but its compact legacy fixture is not a replacement for the complete hosted schema.
Three database-integration suites skip without explicit approved `SUPABASE_TEST_*` configuration.
The new product suite is prepared but cannot run against MyaouDB until migration deployment is approved.

## Defects found during implementation

- Reproduced native Poke-without-note failure and corrected the shared request schema so normalized `null` notes survive client and server validation.
- Added route regressions for both omitted and explicit null notes while preserving blank-note and length validation.
- Reproduced native Now nested-Pressable accessibility blocking the Poke action and a clipped Plans Create button; fixed the targets and confirmed the ordinary Plan navigation path in Simulator.
- Added a first-message prompt and loading/retry states after inspecting an otherwise blank newly accepted native conversation.
- Fixed native Poke retries to preserve one idempotency key for an unchanged invitation, with a new key when its content changes.
- Reproduced the hosted account-deletion HTTP 500 from schema-qualified SQL special forms and prepared the 14th migration without applying it.

- Replaced the interest-tag entrance overshoot with smooth exponential deceleration after the design-hook review.
- Reproduced and fixed login hydration failure caused by development CSP, then prevented unhydrated auth forms from putting credentials into URL queries.
- Preserved Plan return paths through authentication and first-time onboarding.
- Fixed disabled zoom/text selection and inaccessible map-permission dead ends.
- Fixed invalid schema-qualified SQL expressions and an invalid intermediate mutual-confirmation state by executing the migrations.
- Fixed Poke error retries that could otherwise change result after a block was removed.
- Fixed directional meetup waiting state so the second participant can actually confirm.
- Fixed opened-chat eligibility when a newly accepted conversation is absent from the paginated Inbox cache.
- Fixed stale coordinate renewal so it obtains a new device sample.
- Kept overall WebRTC deadline verification in its deterministic command-queue test, removed the flaky duplicate tied to shared React/global state, and retained hook-level failure projection coverage.
- Fixed encountered lint/build problems and normalized event-registration assertions where order has no semantics.
- Reproduced the missing native ExpoCamera module, aligned it to SDK 57, regenerated the non-clean iOS build, and verified successful compilation and bundle loading.
- Fixed native root and authenticated bootstrap routing that still selected Map instead of Now.
- Added local session recovery when a current native bootstrap resolves with a mismatched account identity.
- Reproduced the iOS blank-screen failure and traced it to a missing Debug scene manifest caused by Expo plugin ordering.
  Corrected the plugin order, regenerated both plist outputs, rebuilt successfully, and visually verified Login.
  The composition regression checks scene configuration in Debug and Release while retaining Release networking restrictions.
- Verified that the Simulator development build needs normal local signing for SecureStore access; the unsigned build produced a missing-entitlement error.
- Removed the unsupported coin claim from native location permission copy.
- Prevented speculative reward requests from coarse Map updates while retaining guarded transport and account-switch regression coverage.

## Deliberate boundaries

Meeting acknowledgement records what both participants say; it does not prove physical presence or award coins.
Reward-bearing location verification remains disabled until an attestation provider is integrated and proven on devices.
Chat suggestions are deterministic and use only authorized, bounded server facts.
Venue cards use the verified Google Places adapter only when its server-only key is configured.
New paid subscriptions remain unavailable rather than selling unimplemented benefits.
Public privacy-control guidance and community rules are implemented; operator-specific legal notices and operational policies require release review.

## References

- [Design decisions and research](docs/product-design-decisions.md)
- [Chat, Plans, and Circles](docs/product-chat.md)
- [Onboarding](docs/product-onboarding.md)
- [Social and location safety](docs/product-social-safety.md)
- [Verification and migration instructions](docs/product-verification.md)
- [Peek+ launch boundary](docs/peek-plus-launch.md)

## Continuation audit - functional completeness

- [x] Complete first-value onboarding with name, a few interests, current intent, and an explicit location choice.
- [x] Complete native Plan creation choices before publication, with conversation context, participant limits, local date/time, explicit nearby discovery, and private default.
- [x] Complete native Now with full intent windows, active Plans, Circles, and useful recovery actions.
- [x] Surface activity and expiry in web/native Map and make native Map Poke primary.
- [x] Support explicit profile connection from recognized Scan links with an allowlisted signed URL, preview, and explicit Connect action.
- [x] Add and enforce discovery audience controls across both discovery APIs and both clients.
- [x] Replace generic chat shortcuts with authorized contextual suggestions and a real venue-provider integration path.
- [x] Verify the additional local flows and record the external release requirements separately.

## Continuation fixes and evidence

- [x] Reproduce the missing first-value onboarding flow from a fresh authenticated account and complete it on a phone-sized viewport.
- [x] Prevent pre-hydration auth inputs from losing typed credentials.
- [x] Keep failed native availability saves on the intent step and prevent duplicate submission.
- [x] Keep Plan retries bound to the same body and key on both clients, including interrupted requests.
- [x] Require explicit approximate-area publication and serialize Plan creation before replay lookup.
- [x] Restrict venue lookups to active, unblocked chat members with reciprocal discovery visibility and fresh locations.
- [x] Validate public venue results and keep reply text editable before sending.
- [x] Verify privacy-save failure recovery, persisted visibility, keyboard dismissal, and Plan venue prefill in browser journeys.
- [x] Make discovery settings a focus-managed dialog and correct friends-of-friends to include direct friends.
- [x] Remove the two conflicting migration timestamps and run the complete additive SQL chain.

## Final local evidence locations

- Current web/server suite: `/tmp/peek-product-final-web-tests-rerun.log` (1,314 passing tests across 147 files, with three hosted suites skipped).
- Current root lint and production build: `/tmp/peek-product-final-web-lint.log` and `/tmp/peek-product-final-web-build.log`.
- Current browser journeys: `/tmp/peek-web-fixture-e2e-privacy-final.log` (nine passing fixture journeys).
- Current native screenshots: `test-results/native`.
- Current native suite, TypeScript, and lint: `/tmp/peek-product-native-consolidated.log`, `/tmp/peek-product-native-consolidated-types.log`, and `/tmp/peek-product-native-consolidated-lint.log`.
- Current native Poke evidence: `test-results/native/pokes-received.jpg`, `test-results/native/poke-accepted-chat.jpg`, and `test-results/native/pokes-cleared-after-accept.jpg`.
- Signed iOS and Android compilation: `/tmp/peek-security-android-build.log` and the signed iOS build evidence recorded above.
- Earlier native screenshots under `test-results/e2e` are historical evidence and may be removed by subsequent Playwright runs.
- Browser Map tests use a timestamped synthetic location adapter and a fixture basemap; they do not prove physical GPS or Mapbox provider delivery.

The user selected direct MyaouDB verification; no paid branch was created.
All 14 migrations completed their reviewed compatibility and privilege assessment.
At this earlier checkpoint, explicit production migration-deployment approval was still pending.
The later approved deployment and hosted results are recorded below.
The existing-schema integration checks use dedicated test accounts, loopback-only application traffic, and explicit production opt-in guards.
The live account-deletion failure adds `20260908113704_legacy_sql_special_forms.sql` to the reviewed deployment set.
Its local regression reproduces the invalid SQL call and verifies the correction without broad data changes.
Live verification log: `/tmp/peek-hosted-existing-db.log`.
The final native verification gate passed with 486 Vitest tests across 63 files and 90 Jest tests across 30 iOS/Android suites.
Current native screenshots are retained under `test-results/native`.
The earlier `test-results/e2e/native-*.png` screenshots are historical and may be erased by Playwright.

## Release continuation after migration approval request

At this historical checkpoint, automatic continuation did not grant production migration permission and the 14 SQL files remained unapplied.
The previous goal turn made progress through native interaction fixes, hosted failure reproduction, scoped test cleanup, and the validated SQL repair.
The next independent release work adds the CI gate documented in [product-ci.md](docs/product-ci.md).

A `serve-sim` browser mirror was attempted for the privacy controls missing from native semantic snapshots.
Its capture helper reported live frames, but browser navigation/control and direct CDP capture failed, so browser-visible native interaction was not verified.
The mirror and temporary controller sessions were stopped; native onboarding from interests onward passed separately through the native tool.
The temporary Chrome process ignored graceful termination and was force-stopped; its tracked session is terminal and local mirror/debug listeners are closed.

The earlier production dependency audit completed with 11 high advisories and no critical advisories.
The direct Sharp image-processing dependency is affected, and compatible remediation candidates are being checked before installing updates.
The audit includes Expo/Metro build-tool dependencies because they are declared under the native application's production dependencies.
Dependency remediation and the follow-up release gate are required before readiness can be claimed.

## Dependency security remediation and upgraded release checks

Updated Next.js to 16.3.4, Sharp to 0.35.4 with libvips 8.18.6, PostCSS to 8.5.28, Expo to 57.0.20, Expo Router to 57.0.19, and React Native to 0.86.3.
Aligned the SDK 57 companion modules with Expo's bundled compatibility map and refreshed compatible transitive dependency resolutions.
The final production audit passes the high-severity gate with zero high or critical advisories and 15 remaining moderate entries, primarily propagated from the decoder and UUID dependencies.
The remaining paths and reproduction evidence are documented in [product-dependencies.md](docs/product-dependencies.md).
No advisory suppression or incompatible dependency override was added.

- [x] Earlier web/server tests: 1,313 passed, with the three hosted suites skipped until their explicit integration environment was provided.
- [x] Root lint passes after excluding the generated verification directories.
- [x] Preserve the intentional full document reload after account deletion with one explained, line-scoped Next.js lint exception so authenticated memory is discarded.
- [x] Sharp EXIF-stripping tests and JPEG, PNG, WebP, and GIF codec checks pass.
- [x] Production Turbopack build passes with fixture-only configuration and permitted font downloads in a separate output directory.
- [x] Nine browser fixture journeys pass on the upgraded Next.js runtime; the image optimizer returns a valid PNG.
- [x] Complete the signed native rebuild, SDK compatibility check, and generated-username onboarding replay after the native dependency patches.
- [x] Earlier native validation passed with 478 Vitest and 82 Jest tests, native TypeScript, and native lint.
- [x] Android debug compilation passes using the existing SDK and the project's Java 21 runtime; no SDK installation, regeneration, or cache deletion was required.
- [x] Replace the remaining native Peek+ purchase/price prompts with a warm, truthful preview and preserve the active subscription management path.

The initial restricted build failed on font downloads, and its subsequent cached compiler result retained a local socket permission error.
A fresh output directory with permitted local compiler sockets completed successfully; no cache or simulator assets were deleted.
Next.js automatically added its managed version-matched documentation block to AGENTS.md.
Verification logs: /tmp/peek-security-web-tests.log, /tmp/peek-security-web-lint-final.log, /tmp/peek-security-build-final.log, /tmp/peek-web-fixture-e2e-next1634.log, and /tmp/peek-security-audit-final.json.

Android build evidence: /tmp/peek-security-android-build.log reports BUILD SUCCESSFUL in 4m 47s and the generated APK is apps/native/android/app/build/outputs/apk/debug/app-debug.apk.
The initial direct Gradle attempts lacked the launcher's SDK/JDK environment; using the existing SDK and Java 21 resolved configuration and native compiler failures.
No emulator or physical Android runtime interaction was performed in this compile check.

## Final interaction corrections

- [x] Reproduce stale web privacy selection after a server change while Settings is closed; refetch on reopen, adopt clean server updates, and preserve unsaved drafts.
- [x] Update acknowledged native privacy saves in query cache and clear the saved draft so later server changes are adopted.
- [x] Verify native privacy save, retry, close/reopen, and server-change behavior using the real QueryClient with iOS and Android component renderers.
- [x] Use checked accessibility state for native radio choices.
- [x] Confirm the privacy sheet visually; direct Simulator radio interaction remains limited by the UI bridge.
- [x] Verify the Peek+ preview and corrected native navigation selection through the actual Simulator.
- [x] Include received, unexpired Pokes in the native Inbox badge, add local expiry timers, and preserve unread/friend-request counts.
- [x] Reproduce and correct the cross-tab ownership-fence test flake by advancing monotonic and wall clocks together, preserving the production implementation.
- [x] Complete native Poke sender context, note, accurate expiry, accepted-chat navigation, and Inbox badge clearing.
- [x] Run the consolidated native suite after these final interface corrections.

Latest web evidence: 1,314 tests pass across 147 files in `/tmp/peek-product-final-web-tests-rerun.log`, with three hosted suites skipped without their approved target environment.
Root lint and the production build pass in `/tmp/peek-product-final-web-lint.log` and `/tmp/peek-product-final-web-build.log`.
All nine browser fixture journeys, including the expanded privacy regression, pass in `/tmp/peek-web-fixture-e2e-privacy-final.log`.
The high-severity production dependency gate reports zero high or critical advisories and 15 moderate advisories.
Signed iOS and Android compilation pass.
Native screenshots are retained in `test-results/native`, separately from Playwright output.
The final native gate passes 486 Vitest tests across 63 files and 90 Jest tests across 30 iOS/Android suites, for 576 tests total.
The native Poke sender, note, absolute local expiry, accepted-chat navigation, and Inbox badge behavior are visually verified in `test-results/native/pokes-received.jpg`, `test-results/native/poke-accepted-chat.jpg`, and `test-results/native/pokes-cleared-after-accept.jpg`.
The fixture intentionally omits accepted incoming Pokes and sent entries after acceptance, so these screenshots do not prove terminal-history or sent-card UI; unit presentation and state tests cover those paths.

## GitHub release verification

The preceding goal turn completed the final privacy/Poke fixes, native verification, and evidence reconciliation.
At this historical checkpoint, production migration approval was pending and the independent CI gate was prepared.
Verified that `master` is the repository default and current Vercel production branch, then corrected the workflow push trigger from `main` to `master`.
The release packaging check found intended source, tests, documentation, and migrations only; ignored credentials and generated native/build/test artifacts are excluded.
Added a Vercel deployment exclusion scoped to `product-redesign` so publishing this review branch does not deploy contracts before their database migrations.
The existing production deployment remains at `d4cc8088590a468fd634d44fe1eea1865e743cf3`.
- [x] Publish the review commit and draft pull request.
- [ ] Inspect the GitHub workflow to completion and resolve any fresh-runner failures.

The verified implementation is saved in local commit `6695ee6` across 300 intended files.
The prepublication check found no matching private environment values, private-key blocks, or GitHub token patterns in the candidate files.
Automatic approval review rejected `git push --set-upstream origin product-redesign` because publishing this new source, tests, migrations, and documentation to the public repository requires explicit disclosure authorization.
The push did not execute, so the GitHub workflow has not run and no draft pull request exists.
The prepared pull-request body is `/tmp/peek-product-redesign-pr.md`.
At this historical checkpoint, public publication and database deployment were separate pending approvals.
The production migration blocker has recurred across three consecutive goal turns, and all remaining release actions now require user approval, operator information, or physical-device access.
At that checkpoint, the goal was marked blocked rather than complete; local tests and build evidence do not establish production readiness.

## Supabase rollback package requested before deployment

The user requested preservation of the database state and rollback instructions before migrations or a master release.
At backup capture, the database contained 163 baseline migrations and none of the 14 redesign migrations.
Created a private, Git-ignored directory at `.supabase-backups/20260908T103717Z-pre-product-redesign` with mode 700 and backup files restricted to mode 600.
Saved catalog metadata for 91 table definitions, 130 selected non-extension functions, 59 policies, constraints, indexes, privileges, roles without passwords, and other database metadata.
Saved 764 records across 54 application, Storage-metadata, and migration-history tables in a single SQL statement snapshot at 10:40:36 UTC.
Downloaded all 96 Storage objects, totaling 14,823,884 bytes, with no failed downloads and per-file SHA-256 hashes.
The broader credential-bearing export was rejected by automatic approval review, so Auth rows, Vault secrets, push device tokens, and managed runtime records were excluded.
This is a migration-specific recovery package, not a full Supabase disaster-recovery backup.
Prepared a guarded schema rollback for the exact full 14-migration batch, preserving original tables/data and the existing pgcrypto extension.
The guard requires the exact 163 baseline plus 14 redesign history entries and explicit confirmation, and rejects loss of rows in introduced tables by default.
Local PGlite validation applies all 14 actual migration files to the durable legacy fixture with the 15 captured original function definitions and then successfully executes the rollback.
All 15 function definitions, owners, security settings, and effective role/PUBLIC grants match their originals after rollback, with 163 baseline migration entries remaining, no introduced tables, and pgcrypto preserved.
Guard tests reject omitted confirmation, nonempty new tables without the explicit data-loss opt-in, and unrelated migration history.
This is a migration-mechanics rehearsal against a compact legacy fixture, not a full hosted restoration or unrelated-schema parity test.
No rollback has run against MyaouDB.
Prepared the ignored `.env.backup.local` file and connection-panel link for a separate standard database dump; the user has not completed browser authentication or connection setup.
No migration, public push, master merge, or application deployment occurred during backup preparation.
The entry-point instructions are `SUPABASE_ROLLBACK.md`, and the complete procedure is stored with the private package in `README.md`.
Packaged the recovery files as `.supabase-backups/MyaouDB-migration-rollback-20260908T103717Z.tar.gz` with a SHA-256 sidecar.
The archive is 14,976,798 bytes, contains 109 files, and excludes temporary synthetic validation databases and environment files.
Verified the archive checksum, extracted it into a private temporary directory, and successfully checked all 108 payload-file hashes against the included checksum manifest.
Archive SHA-256: `a479d4b68b4d74bb1553d4e89472052289f070169d1482f02d4f3cd2f4e0e627`.
The private recovery package is complete within its documented migration-specific scope; a full Auth/Vault backup remains excluded.
Browser authentication is not needed to use this saved package.

## Continuation after the rollback package

The preceding goal turn completed the private recovery archive and its extraction/integrity check, so it made concrete progress.
Read-only Supabase verification at 2026-09-08 11:10 UTC still found 163 baseline migrations and zero redesign migrations.
GitHub still reports a public repository, with remote `master` at `d4cc8088590a468fd634d44fe1eea1865e743cf3` and no `product-redesign` branch.
The independent remaining Simulator check was retried against the running native fixture.
Restored its missing loopback Auth fixture temporarily and confirmed the privacy sheet loads, but the Xcode runtime snapshot still omits all radio choices and Save.
The Device Hub computer-use connection timed out again.
A temporary `serve-sim@0.1.46` browser mirror rendered the real Simulator frame and logged the attempted taps, but neither the visibility selection nor the visible error dismiss control responded.
Direct native privacy save/reload therefore remains unverified; the existing QueryClient renderer evidence is unchanged.
Closed the browser mirror and stopped its helper and the temporary Auth fixture, preserving the existing Metro and native fixture processes.
At this historical checkpoint, production migration deployment and public publication were still pending approval.
The broader goal remains incomplete because hosted, provider, physical-device, and operational release evidence is still outstanding.

## Approved deployment and hosted verification

The user explicitly approved applying the reviewed database migrations and publishing the redesign to the public repository.
Published `product-redesign` and opened draft PR #7 at https://github.com/AStoyanov2231/peek-poke.com/pull/7.
The first clean Linux installs exposed a missing `source-map` lockfile entry; the corrected lockfile passes clean installation with CI's Node 24.20 and npm 11.19.
The subsequent browser run exposed a timezone mismatch: the UTC Node runner generated a time that was already past in the Europe/Sofia browser.
The test now calculates the future datetime inside the browser, waits for the actual successful Plan creation response, and checks that the named creation dialog closes.
All 14 Supabase migrations applied successfully, with strict one-row migration-history readback after each apply and no manual history repair.
Post-deployment counts remained 50 profiles, 11 Auth users, and 96 Storage objects.
The original recovery archive remains immutable; a separate mapped rollback package uses the actual deployed timestamps and passes the full local round trip and guard tests.
Hosted shared-group suites now pass, including the repaired legacy account-deletion path.
The new product suite reproduces Poke creation returning HTTP 503 because its outbox ON CONFLICT clause lacks a matching unique index in the full hosted baseline.
It also exposes missing service-role table grants, and catalog review confirms the worker's delivery-authorization RPC needs an explicit service-role execution grant.
The failed run cleaned its synthetic accounts and restored the same baseline counts.
The local SQL fixture's broad outbox uniqueness masked the hosted constraint mismatch; the corrective work removes that inaccurate assumption and tests the explicit grants.
The post-deployment security advisor reports browser-denied server tables, three previously reviewed authenticated chat-summary functions, and disabled leaked-password protection.
No advisor suppression was added.

## Hosted runtime corrections and provider evidence

The fifteenth migration adds the two missing Poke outbox indexes, 32 explicit service-role CRUD grants, the worker-only delivery authorization grant, and four useful foreign-key indexes on new tables.
Hosted catalog checks confirm all required grants while anonymous and authenticated browser roles retain zero direct CRUD grants on those server tables.
The local SQL fixture now reproduces the actual legacy outbox constraint shape instead of masking it with a global unique constraint.
The next hosted product run passed Poke creation, acceptance, Plan sharing, revocation, and direct-client denial before finding account erasure left product-social data behind.
The sixteenth migration serializes product-social writes with profile tombstones using sorted shared row locks, removes retained peer response snapshots, and rejects late writes after account erasure.
The preflight found zero Pokes, Plans, or affected legacy reply/outbox rows, and the actual migration added exactly one history entry without manual repair.
The shared-group test's nondeterministic UUID ordering expectation is corrected to match its ordered database query.
The private Realtime provider test passes owner delivery, outsider denial, and fresh delivery after reconnect; scoped teardown restores 50 profiles, 11 Auth users, and 96 Storage objects.

Read-only Vercel configuration checks confirm Node 24, the existing Hobby plan, correctly paired MyaouDB application credentials, and successful Auth/service-role probes.
Redis REST, Google Places, and APNs variables exist, but sensitive Redis values are withheld by the CLI and still need deployment-runtime validation.
The HTTPS apex application URL redirects to canonical www and is not a correctness blocker.
Production lacks `CRON_SECRET` and TURN settings, and Supabase has only its preexisting weekly soft-deleted-message cleanup job.
The reversible scheduler approach is documented in [product-operations.md](docs/product-operations.md), using direct database cron for retention and authenticated HTTP for the outbox.
No scheduler, secret, billing plan, or application deployment has been changed during this configuration audit.

The final hosted rerun after migration 16 passed all three product/shared-group suites in 14.40 seconds, including stale actor RPC rejection and exact cleanup to 50 profiles, 11 Auth users, and 96 Storage objects.
The final mapped rollback rehearsal restores all 15 captured functions exactly and removes the 16 account-erasure triggers and four new helpers along with the earlier redesign objects.
Sealed `.supabase-backups/MyaouDB-deployed-16-migration-rollback-20260908.tar.gz`, containing the original records and all 96 Storage object bodies.
Its 114 payload hashes pass after fresh extraction; archive SHA-256 is `cc80d92fd5e849a84541318160a8991b56b7b67953bfbbf28ff15b32690b88a2`.
The original predeployment archive remains unchanged.
Root lint passes after adding the test-owned Next output directory to the existing generated-output exclusions.

The separate-session lock-wait attempt could not establish deterministic overlap because tool dispatch and approval timing serialized or reordered the management query and REST request.
The final attempted late SQL write correctly failed with SQLSTATE 23514 after account erasure, complementing the passing stale-RPC regressions.
No live lock-wait proof is claimed; a direct PostgreSQL harness with a transaction barrier is still required for that evidence.
All temporary accounts from these attempts were removed by their exact saved fixture IDs, restoring 50 profiles, 11 Auth users, and 96 Storage objects.
The test-owned hosted Next server stopped gracefully; unrelated native development processes remain available.

The guarded Storage provider suite passed 1/1 in 3.32 seconds.
It proves the private `media` bucket's service-only upload/read/delete lifecycle, denies direct authenticated owner and outsider reads and signed URLs, and confirms the generated object key is absent after cleanup.
This verifies the actual server-mediated Storage architecture without assuming the owner has direct bucket access.
All five hosted suites now pass individually: shared-group lifecycle, shared-group migration boundary, product-social flow, private Realtime, and private Storage.

Final read-only verification confirms 50 profiles, 11 Auth users, 96 Storage objects, zero Pokes, zero Plans, and 179 migration entries after all hosted tests and fixture cleanup.

## Verified public release candidate

Commit `9037c032ce9e8dae40ffe91d23a29bda342a61ba` is published on `product-redesign` in draft PR #7.
Both GitHub Verify runs pass all four jobs, including clean Linux install, production dependency audit, web tests/build, SQL fixtures, native checks, and nine browser journeys.
The run URLs are https://github.com/AStoyanov2231/peek-poke.com/actions/runs/34226760374 and https://github.com/AStoyanov2231/peek-poke.com/actions/runs/34226755067.
Configured master branch protection with those four required GitHub Actions checks, strict up-to-date enforcement, administrator enforcement, and force-push/deletion prevention.
Master previously had no branch protection.
The source and test payload passed the private-value scan; no backup files or live credentials were staged or published.

## Confirmed adult-only admission

The user confirmed that Peek & Poke must be restricted to adults aged 18 and over and has not yet selected a support/privacy email.
Implementing an eligibility gate for all accounts, including existing accounts, before onboarding and social access.
The server validates a calendar birth date against the current UTC date, then persists only an adult or blocked decision, timestamp, and policy version.
Birth dates are request-local and must not appear in logs, analytics, browser storage, or the database.
The first valid decision is immutable; invalid dates can be corrected without creating a decision.
Leap-day births reach the eighteenth anniversary on March 1 in non-leap years under this product rule.
Self-declaration does not prove age or prevent someone from lying; the existing underage-report option remains available to admitted members.
No age-verification vendor, paid service, or support address has been invented or configured.
The shared contract and server route are implemented locally, while web/native routing, database enforcement, new rollback capture, and end-to-end verification are still in progress.
The sealed 16-migration recovery archive remains unchanged and migration 17 has not been applied.
Recorded the implementation contract, self-declaration limits, unresolved support/correction process, and primary design references in [age-admission.md](docs/age-admission.md).

The first browser age-gate run reproduced a missing QueryClientProvider error in the auth shell.
The page now uses request-local state, which also prevents the submitted birth date from being retained as mutation-cache variables or an unscoped account query.
The rerun passes pending-to-adult navigation and blocked-account confinement; blocked, pending, and unavailable states provide sign-out and confirmed account deletion.
The shared contract tests reject missing admission state, inconsistent timestamps, and any raw birth-date field in a response.
Account deletion now bypasses admission-storage lookup entirely, while ordinary social handlers still fail closed when the admission provider is unavailable.
Native router protection prevents social screens from mounting before admission, and account-bound checks prevent stale bootstrap results from starting Realtime, calls, or push registration for a different account.
Peer eligibility is also enforced in service-backed friend, DM, profile, invite, and call routes through bounded batch or scalar RPCs; the matching new database RPCs remain local release dependencies.
Saved exact legacy function definitions, ownership, ACLs, and public/Realtime policies privately before expanding migration 17.
Database enforcement is being assembled from reviewed legacy, product, and restrictive-policy sections, with no production DDL applied yet.

The previously reported ProfileInterests bounce easing is fixed to a smooth decelerating curve.
No ignore or suppression was added for that finding, and no part of it remains standing.

The full browser fixture suite passes 11 journeys, including actual under-18 submission, an immutable blocked result after reload, and password recovery through a real fixture PKCE exchange before admission.
Mobile visual inspection found the date fields were using an undefined CSS class and rendered only 16 pixels high.
Replaced them with the existing Input component at 48 pixels; the focused browser rerun passes and now checks a minimum 44-pixel target for each field.
All 491 native Vitest tests and 90 native platform-renderer tests pass.
Root lint and the production Next build pass; the initial broad web test run exposed two missing age-provider mocks and a native owner-ordering assertion, which are fixed and pass their focused reruns.
The full new migration now compiles and runs in embedded PostgreSQL, including post-admission availability, Poke acceptance, Plan creation/listing, blocked and pending denial, and no persisted Poke to an ineligible peer.
The separate SQL permission suite executes the actual migration sections and passes all twelve restrictive policies, own-profile bootstrap access, unchanged existing authorization limits, Realtime denial, peer filtering, and absence of a birth-date column.

Saved a complete current pre-age-migration snapshot under `.supabase-backups/deployment-20260908/age-pre-migration/`.
It contains 61 exact current function definitions with verified database MD5 values, ownership and effective ACLs, all 60 current public/Realtime policies, and all 179 migration versions.
It confirms the new age table and helper names are absent, and the database still has 50 profiles, 11 Auth users, 96 Storage objects, zero Pokes, and zero Plans.
The function snapshot SHA-256 is `ad56f261d7a978a661ffc4c7d1fb3799c4a3e06b015a2f0fa7094d8380cd9467`.
No Auth or Vault rows, secret values, or new production migrations are included in this capture.
The planned recovery path is a guarded age-layer rollback to migration 179, followed by the unchanged sealed sixteen-migration rollback to the original 163-entry baseline.
That age-layer rollback still needs generation and rehearsal before migration 17 can be applied.
The native fixture now serves the new contract and age states, but direct Simulator age-gate visual testing is unverified because the Device Hub bridge returns error `-10005`.

Assembled the final group-detail SQL reader with filtering before member counts, unread totals, previews, and cursor pagination.
All three product SQL suites pass, including a 200-member group with an ineligible message author.
The root web suite passes 1,347 tests across 153 files, with ten hosted-only tests skipped until migration 17 is installed; root lint passes.
Final outbox review found a queued meeting-award hint without an admission check.
It now rechecks pair eligibility and sends only an anonymous coin-sync hint to eligible individuals when the pair can no longer interact; all nine focused worker tests pass.
The latest local production build is blocked by Turbopack's CSS worker being denied a port bind, including an escalated attempt, before application compilation.
The earlier production build passed; the final source still requires a successful CI build.
Generated a separate guarded age-layer rollback restoring all 61 captured functions, removing eleven helpers and twelve restrictive policies, and returning exactly to the captured 179-entry history.
Its embedded PostgreSQL rehearsal is in progress and the production age migration remains unapplied.

## Hosted adult admission and recovery

Published adult admission as commit `aff5e1057`, and all four GitHub checks passed in run `34233685521`, including the production build and eleven browser journeys.
Applied `20260908134739_account_age_admission` after preserving and rehearsing its rollback.
The first hosted run exposed two group-reader regressions and a blocked-Plan meetup regression.
The group detail function referenced media columns absent from the actual shared-group table; its correction preserves the response fields as null values.
Restored the older one-argument group reader's forwarding to the bounded, age-filtered reader.
Plan owners can now read an empty meetup view after blocking a member, while confirmation for the blocked pair remains denied.
Reproduced authenticated access to three unused legacy chat-room RPCs and revoked that retired API access.
These changes are installed in `20260908135910_adult_social_runtime_corrections`; the applied age migration remains unchanged apart from its verified filename.

All six hosted suites pass, ten tests in 63.81 seconds, including the new admission and retired-RPC regressions.
The final database contains 181 migration entries, 72 public/Realtime policies, 50 profiles, 11 Auth users, and 96 Storage objects, with no test age decisions, Pokes, or Plans left behind.
The age table contains only `user_id`, `status`, `decided_at`, and `policy_version`.
The final local root suite passes 1,348 tests across 153 files, with ten hosted tests deliberately skipped outside the approved runner, and root lint passes.
All four product SQL scripts pass, including exact hosted group columns, large-group pagination, service-reader compatibility, blocked-Plan management, and retired-RPC permissions.

The complete rollback chain was rehearsed locally from 181 to 180 to 179 to the original 163 migration entries.
It restores six runtime-correction functions, then 61 pre-age functions, then the fifteen original redesign-affected functions with their saved permissions.
Sealed `.supabase-backups/MyaouDB-deployed-18-migration-rollback-20260908.tar.gz` without changing the previous archives.
All 130 payload hashes pass after a fresh extraction; archive SHA-256 is `b75393c4e3bd88717041bc520e463ae083093d0627d5b84b077fa653aa523bfa`.
Updated [SUPABASE_ROLLBACK.md](SUPABASE_ROLLBACK.md) with the three-step recovery procedure and its data-restore limits.
The native Device Hub retry still returns `-10005`, but XcodeBuildMCP recovered a usable iPhone 16 Simulator surface and rendered the discovery-visibility baseline at [native-privacy-visibility-settings.jpg](test-results/native/native-privacy-visibility-settings.jpg).
The prior local bootstrap failure is captured at [native-bootstrap-recovery-before-fixture-auth.jpg](test-results/native/native-bootstrap-recovery-before-fixture-auth.jpg), and the active proof setup requires only the loopback native API on port 3002, loopback Supabase fixture on port 54321, and Metro on port 8081.
Direct privacy save/reload remains open because the rendered radio controls expose no actionable XcodeBuildMCP element references.
The native pending, review, and blocked age-admission visual journey also remains open because the fixture Sign In action produced no visible transition or runtime error after three supported activation attempts.

## Production operations preparation

All four final code CI jobs pass at `51144450b041b29676b4312e424aa18c478f167a` in run `34236217360`.
Created a generated production-only Vercel `CRON_SECRET` and its matching Supabase Vault entry without putting the value in source, SQL text, or release records.
The initial dashboard entry mismatch was corrected and a SHA-256 equality check confirms the values match.
Saved pre-change extension, job, Vault metadata, and Vercel variable-scope snapshots privately before setup.
The manual bounded cleanup calls found no expired records, and Supabase retention jobs 5 and 6 now enforce the ten-minute exact-location and 31-day activity retention windows.
The first minute-level location cleanup succeeded at 14:33 UTC; the daily metric job has not yet reached its first scheduled time.
Saved exact created-job metadata and guarded reversal instructions separately from the unchanged eighteen-migration archive.
Migration history remains at 181 entries, and the original weekly cleanup job 2 remains unchanged.
No `pg_net` extension or outbox schedule has been added because the counts-only preflight found 31 pre-existing pending events requiring processing authorization.
The queued types are two direct-message changes, eighteen shared-group message changes, and eleven profile-media moderation events; no payloads or account identifiers were exported.
The separate operations rollback passed confirmation, drift, atomicity, legacy-job preservation, and repeat-run checks in embedded PostgreSQL.
Sealed its eight-file archive at `.supabase-backups/MyaouDB-operations-rollback-20260908.tar.gz`, SHA-256 `f38ac7e09875a9c36613d21a5e6d34b95db49372424bdc1db8bf5eacc387c02b`, and verified a fresh extraction.
A Vercel production environment PING attempt could not retrieve sensitive Redis values, so no Redis request was made and production runtime connectivity still requires deployed-route proof.
Added a separate exact-origin opt-in for scoped deployed API verification, retaining every existing production-project gate and rejecting mismatched origins, ports, targets, or missing authorization flags.
The age and product test helpers now refuse HTTP redirects for bearer-authenticated requests.
The focused target-guard tests and lint pass; the deployed test runner remains private and has not run before the matching application release.

## Deployed release verification

All eight checks passed for `a4d8b3559`, and PR #7 was merged into master at `b8d33750364d8fa38b18e9daa74b33d1aa50331e` on 2026-09-08 at 14:46 UTC.
Vercel production deployment `dpl_87orq3DQNsTpfVMJK5827FMut7y2` is ready and serves both public domains.
The scoped deployed age suite passed all four tests in 33.61 seconds, and the deployed social suite passed in 32.27 seconds.
They exercised the real Vercel routes, production Redis-backed rate limiting, admission, Pokes, Plans, and scoped deletion.
Cleanup restored 50 profiles, 11 Auth users, 96 Storage objects, zero age decisions, Pokes, and Plans, and the original 31-event queue.
Captured the live landing page at 1440 and 390 pixels with no horizontal overflow.
The phone capture reproduced wrapped header links caused by an inert responsive utility; the scoped mobile CSS correction is prepared with lint and design checks passing.
The deployed server functions defaulted to `iad1`; a single-region `dub1` configuration is prepared to match Supabase's `eu-west-1` location under the existing Hobby plan.

The user authorized processing the 31 queued events and activating the worker.
Saved a fresh operations snapshot and reversal notes before installing `pg_net` 0.19.5 through the Supabase Extensions dashboard.
The manual Vault-authenticated HTTP request returned 200, completed fourteen events, and retried eleven moderation events, with six group-message events still unclaimed.
The recurring outbox job remains absent while that failure is repaired.
A rolled-back finalizer call reproduced SQLSTATE 23514: `profile_photos_storage_bucket_check` only admits legacy and private buckets, rejecting the existing approved and quarantine workflows.
Saved its exact prior definition, 181 migration versions, eleven affected photo rows, and five affected profiles privately before preparing a corrective migration.
Snapshot SHA-256 is `3665b613432f6d2fa8cc466020074a82f0c967418bc33cc28fce113599592242`.
The correction only expands the bucket allowlist to the four existing workflow buckets; its SQL regression and guarded rollback are in progress before application.
The fifth embedded SQL script passes legacy rejection, the exact four-bucket correction, preservation of existing rows and unrelated constraints, and refusal of an unexpected baseline.
The rollback now locks the photo table before checking drift, verifies the validated constraint and exact history, and refuses rows still using the newer buckets.
All 22 original source/thumbnail objects referenced by the eleven affected photos were verified present in the unchanged sealed Storage archive.
Applied the correction as `20260908150805_profile_photo_moderation_buckets`, bringing history to 182 entries, and verified the exact validated four-bucket constraint.
The local source filename and its regression test match that actual hosted timestamp, and the rollback rehearsal passes with the actual version.
Improved private outbox retry diagnostics to retain only validated provider error codes and HTTP status, excluding arbitrary provider messages and details.
Rollback-contained live finalization now passes for both approval and quarantine after migration 19.
The next authorized worker request returned 200 and completed all seventeen remaining events with zero retries or dead letters.
All 31 original queued events are completed, including seven photo approvals and four quarantines, with profile/Auth/Storage counts still 50/11/96.
Activated outbox cron job 7 every minute, using the matched Vault secret at execution time.
The first scheduled run succeeded at 15:13 UTC and its HTTP response was 200 with an empty queue, zero queue age, zero retries, and zero dead letters.
The guarded outbox-job reversal passed confirmation, drift, unrelated-job preservation, and repeat-run checks.
Sealed the complete nineteen-migration recovery package with the unchanged nested eighteen-migration package, all original Storage files, photo snapshots, and operations reversal records.
All 153 payload hashes passed a fresh extraction of `.supabase-backups/MyaouDB-deployed-19-migration-rollback-20260908.tar.gz`, SHA-256 `551c56b1e7cbbea54cd7ddccd114f5af046cd15b70395015e674925594379d1c`.
The final local root run passes 1,350 tests across 153 files, with ten hosted tests deliberately skipped outside their explicit runner, and root lint is clean.
The final Supabase security review reports only the thirteen intentional service-owned RLS tables without client policies and the existing disabled leaked-password protection setting.

## Worker and deployment follow-up

[PR #8](https://github.com/AStoyanov2231/peek-poke.com/pull/8) contains the completed worker correction, nineteen-migration recovery references, mobile landing-header fix, and Dublin server-region configuration.
The release review reproduced a Supabase `PostgrestError` subclass bypassing provider-message redaction and added coverage through the installed SDK error type, including malformed diagnostic fields.
Recognized provider failures now retain only validated codes and status values, while ordinary application errors keep their bounded diagnostics.
Corrected two public checksum transcription errors and verified that all four recovery references match the sealed archive's sidecar.
PR #8 is the current source for the final CI, merge, and deployed visual evidence.
The remaining operator, provider, physical-device, and full recovery prerequisites remain open in [PRODUCT_LAUNCH_BLOCKERS.md](PRODUCT_LAUNCH_BLOCKERS.md).

## Native flow completion and runtime recovery

PR #8 passed all eight push and pull-request checks and merged at 15:34 UTC as `d41ea0b312de6eee8cf9d98b8242628dc7a978e6`.
The production release serves both public domains from Dublin.
An attempted Preview scope cleanup incorrectly deleted fourteen shared Vercel variable records, including their Production targets and nine Development targets.
The existing deployment remained available, and further deployment was held while Production configuration was recovered.
Nine values were restored from the unchanged ignored local environment file, and the existing Upstash resource connection recreated the other five.
All five Redis variables retained sensitive protection after a verified type-only update.
Production has twenty-two Production-only variables; Preview and Development have none and require isolated setup.
The reviewed master source was rebuilt as `dpl_AFPvN11NF3cPp5w6uLSQYDTPrViJ` using the recovered configuration.
The deployed age suite passed four tests in 7.35 seconds, and the social flow passed in 14.53 seconds, exercising live Redis-backed rate limiting.
The final 16:06 UTC counts remained 50 profiles, 11 Auth users, 96 Storage objects, 182 migrations, and all 31 original events completed; the three latest scheduled worker responses were HTTP 200.
The incident, recovery, remaining Development gap, and prevention rule are recorded in [environment-isolation-recovery.md](docs/production-baseline/environment-isolation-recovery.md).
Private metadata evidence is saved separately from the unchanged sealed Supabase recovery archive.

The final brief review found and closed native gaps in chat suggestions, Now radius and empty-state actions, Inbox default selection, and disabled coin promotion on Map.
Native Now requests the selected 2, 10, or 25 km radius from the server, isolates cache entries by radius, and provides expansion, invitation, and Plan actions.
Inbox chooses pending Pokes, then active Plans, then Chats once both account-scoped data sources succeed, while preserving explicit navigation and user choices.
A lifecycle regression reproduced a background refresh failure hiding an already-loaded Inbox; the fixed initial-loading and error states now apply only before automatic selection finishes.
An initial account lookup failure now exposes retry instead of an indefinite spinner, and retry resolves identity before refreshing account-scoped priorities.
Native chat now offers typed, editable suggestions and a separate Plan action; shared web/native insertion preserves existing unsent drafts and never sends automatically.
The native venue suggestion action follows the same draft-preserving policy.
Native Map no longer requests or advertises disabled coin collection, while user markers, accessible actions, and contextual scanning remain available.

Recovered the local native runtime by replacing a broken Metro bundle process and clearing a stuck Simulator deep-link sheet with a non-erasing restart.
Direct Simulator proof reached pending date entry, date review without submission, blocked-account recovery, and Now through an incoming Poke and acceptance into chat.
Replaced the nonexistent Expo Router `(auth)` screen registration with the actual login and welcome routes, preserving admission guards and eliminating the observed route warning on fresh launch.
Native privacy controls were rendered and their focused persistence tests pass, but direct radio selection and save/reopen remain unverified with the available automation surface.
Screenshots are retained locally under `test-results/native/`.
The deterministic native fixture now serves the chat-suggestions contract, and Simulator interaction confirmed that `I can do 6` becomes `I can do 6 Would 20 minutes work?` without activating Send.
That interaction reproduced an unhandled typing-status request failure from a missing fixture endpoint.
The fixture now serves the typed POST response, and production typing signals consume best-effort request failures without interrupting the draft.
The fresh Simulator capture and Metro window are free of the reproduced uncaught error after the fix.

Added `npm run test:postgres-concurrency`, using a temporary PostgreSQL 17 cluster and synthetic rows with the current migration function bodies.
Actual lock-wait barriers prove that a writer committed before account erasure is purged and that a writer released after erasure cannot resurrect availability.
Concurrent stale-location cleanup skips a locked 250-row batch, deletes at most 1,000 rows per call, eventually removes all 2,000 stale rows, and retains a fresh row.
The server, sessions, and temporary files were cleaned up after the successful run.
This is real local PostgreSQL evidence, not a hosted restore or full production load test.

The consolidated local checks pass: 1,353 web tests, 505 native Vitest tests, 94 iOS/Android renderer tests, root/native lint, and native typecheck.
Ten hosted-only web tests remain deliberately skipped outside the separately authorized runner.
The final source still requires its new pull-request CI and merge before these native changes are considered released.
