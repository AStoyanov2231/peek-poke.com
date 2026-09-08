# Product redesign progress

Branch: `product-redesign`.
Brief: [PRODUCT-REDESIG.md](PRODUCT-REDESIG.md).
Updated: 2026-09-08.

## Current state

The local redesign now implements Now > Poke > Chat > Plan > Meet across web, native, shared contracts, and additive database migrations.
The completion audit closed missing onboarding, privacy, Scan, venue, native Plan, and persistence behavior.
The current continuation adds profile context, activity map pins, explicit Plan meetup confirmation, and durable activation/discovery metrics.
The consolidated web, database, build, and native test results below include the latest additions.
The updated signed iOS development binary builds with Expo 57.0.20 and React Native 0.86.3 on the existing iPhone 16 Simulator.
The unlocked Mac enabled real Simulator verification of Login, Now availability, Poke sending and acceptance, Chat, Plans, location-decline recovery, Me, and the loaded discovery-settings sheet.
Native onboarding replay now starts with a generated username, saves the chosen username, selects three interests, declines optional intent/location, and returns to Now with completion persisted.
Direct native privacy save/reload remains unverified because the settings controls are omitted from the Simulator bridge targets and the Device Hub connection times out.
Production promotion is not complete.
Supabase is authenticated and the ChatApp organization containing MyaouDB is verified.
The user authorized verification directly against MyaouDB instead of creating a paid branch.
Read-only preflight found 50 profiles, 11 auth accounts, and no compatibility blocker for the 13 ordered redesign migrations.
Automatic approval review rejected the first migration because verification authorization does not include production schema deployment; no migration was applied.
The reviewed production migration deployment needs explicit user approval.
The outstanding release requirements are tracked in [PRODUCT_LAUNCH_BLOCKERS.md](PRODUCT_LAUNCH_BLOCKERS.md).
No production schema, deployment, provider configuration, or billing settings have been changed.
The existing-schema integration checks created and removed dedicated synthetic records; post-run counts returned to 50 profiles and 11 auth accounts.

## Pending production migration deployment

Target: MyaouDB (`ttojvnwpnpuhkyjncwxn`).
Deploy the following files in numeric order after explicit approval.
They add the new social data model and service-only APIs, replace legacy paid social behavior with free friendship/messaging, and repair the observed account-deletion SQL failure.
The changes also affect existing function permissions and behavior, so the database deployment must be coordinated with the matching application release.
Existing records are preserved by the migration scripts; retention deletion runs only when its dedicated worker is invoked.

- [20260908010000_free_social_graph_and_coarse_nearby.sql](supabase/migrations/20260908010000_free_social_graph_and_coarse_nearby.sql).
- [20260908020000_product_social_intent.sql](supabase/migrations/20260908020000_product_social_intent.sql).
- [20260908030000_product_plans.sql](supabase/migrations/20260908030000_product_plans.sql).
- [20260908040000_meeting_social_eligibility.sql](supabase/migrations/20260908040000_meeting_social_eligibility.sql).
- [20260908050000_mutual_meetup_acknowledgements.sql](supabase/migrations/20260908050000_mutual_meetup_acknowledgements.sql).
- [20260908060000_privacy_location_retention.sql](supabase/migrations/20260908060000_privacy_location_retention.sql).
- [20260908070000_discovery_audience_preferences.sql](supabase/migrations/20260908070000_discovery_audience_preferences.sql).
- [20260908080000_plan_nearby_discovery.sql](supabase/migrations/20260908080000_plan_nearby_discovery.sql).
- [20260908090000_private_product_funnel_metrics.sql](supabase/migrations/20260908090000_private_product_funnel_metrics.sql).
- [20260908100000_profile_social_context.sql](supabase/migrations/20260908100000_profile_social_context.sql).
- [20260908110000_private_product_activity_metrics.sql](supabase/migrations/20260908110000_private_product_activity_metrics.sql).
- [20260908120000_plan_meetup_attribution.sql](supabase/migrations/20260908120000_plan_meetup_attribution.sql).
- [20260908130000_plan_recent_member_lifecycle.sql](supabase/migrations/20260908130000_plan_recent_member_lifecycle.sql).
- [20260908140000_legacy_sql_special_forms.sql](supabase/migrations/20260908140000_legacy_sql_special_forms.sql).

The initial 13 redesign migrations passed hosted read-only compatibility review and the ordered embedded PostgreSQL chain.
The fourteenth legacy SQL repair passed an execution-failure regression and permission/security-context preservation checks.
All 14 files remain unapplied until explicit deployment approval is granted.
Hosted product concurrency and RLS verification follows deployment using dedicated synthetic accounts.

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
- [ ] Run the workflow on GitHub after the branch is published to verify the fresh Linux runner.

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
- [ ] Complete the hosted shared-group lifecycle: creation, concurrent scans, membership denial, messaging, and idempotency pass, but account deletion reproduces HTTP 500 from invalid legacy SQL special-form qualification.
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
Automatic approval review requires explicit production migration-deployment approval before the new hosted product tests can run.
The existing-schema integration checks use dedicated test accounts, loopback-only application traffic, and explicit production opt-in guards.
The live account-deletion failure adds `20260908140000_legacy_sql_special_forms.sql` to the reviewed deployment set.
Its local regression reproduces the invalid SQL call and verifies the correction without broad data changes.
Live verification log: `/tmp/peek-hosted-existing-db.log`.
The final native verification gate passed with 486 Vitest tests across 63 files and 90 Jest tests across 30 iOS/Android suites.
Current native screenshots are retained under `test-results/native`.
The earlier `test-results/e2e/native-*.png` screenshots are historical and may be erased by Playwright.

## Release continuation after migration approval request

The automatic continuation did not grant production migration permission, so the 14 SQL files remain unapplied.
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
Production migration approval remains pending, but publishing the review branch and running its independent GitHub checks can proceed.
Verified that `master` is the repository default and current Vercel production branch, then corrected the workflow push trigger from `main` to `master`.
The release packaging check found intended source, tests, documentation, and migrations only; ignored credentials and generated native/build/test artifacts are excluded.
Added a Vercel deployment exclusion scoped to `product-redesign` so publishing this review branch does not deploy contracts before their database migrations.
The existing production deployment remains at `d4cc8088590a468fd634d44fe1eea1865e743cf3`.
- [ ] Publish the review commit and draft pull request.
- [ ] Inspect the GitHub workflow to completion and resolve any fresh-runner failures.

The verified implementation is saved in local commit `6695ee6` across 300 intended files.
The prepublication check found no matching private environment values, private-key blocks, or GitHub token patterns in the candidate files.
Automatic approval review rejected `git push --set-upstream origin product-redesign` because publishing this new source, tests, migrations, and documentation to the public repository requires explicit disclosure authorization.
The push did not execute, so the GitHub workflow has not run and no draft pull request exists.
The prepared pull-request body is `/tmp/peek-product-redesign-pr.md`.
Public branch publication and the production database migration deployment are separate pending approvals.
The production migration blocker has recurred across three consecutive goal turns, and all remaining release actions now require user approval, operator information, or physical-device access.
At that checkpoint, the goal was marked blocked rather than complete; local tests and build evidence do not establish production readiness.

## Supabase rollback package requested before deployment

The user requested preservation of the database state and rollback instructions before migrations or a master release.
The current database still contains 163 baseline migrations and none of the 14 redesign migrations.
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
Production migration deployment and publication of the prepared branch remain pending explicit approval after the earlier automatic approval review rejections.
The broader goal remains incomplete because hosted, provider, physical-device, and operational release evidence is still outstanding.
