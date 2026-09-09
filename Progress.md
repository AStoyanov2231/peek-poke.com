# Product redesign progress

Branch: `product-redesign`.
Brief: [PRODUCT-REDESIG.md](PRODUCT-REDESIG.md).
Updated: 2026-09-09.

## Current continuation

The goal remains active and incomplete.
The temporary-conversation migration is now deployed as `20260909002222`, with 184 migration entries.
All eight CI checks passed on `41a2a5fe5` before activation.
The exact original functions, grants, and 183-entry history matched the saved preflight immediately before deployment.
Live verification found the existing `poke_status` enum rendered the new index differently from the minimal text fixture.
The fixture now uses the exact hosted enum, and a separate deployed rollback package matches all six functions, grants, two triggers, and index and passes 25 reversal assertions.
The original candidate and twenty-migration archives remain unchanged; [SUPABASE_ROLLBACK.md](SUPABASE_ROLLBACK.md) now identifies the correct deployed package and reversal order.
Security advisors remain at the pre-existing thirteen service-table information notices and one leaked-password-protection warning, with no new notice.
Both hosted product journeys now pass in 36.8 seconds after correcting the test request contract and repairing a real history-query defect.
The deployed message table has `reply_to_id`, not a `reply_to` column; its self-relationship is also absent from the PostgREST cache.
History now loads reply previews in one bounded lookup restricted to the same thread, hides deleted preview content, and retains the existing DTO.
The hosted regression verifies an actual reply preview alongside expiry, replay, call cancellation, renewal, owner-only Plans, friendship, and block precedence.
Seventy-one focused mapping/message tests and scoped lint pass; the exact enum fixture passes 49 SQL assertions and four real PostgreSQL concurrency cases.
Hosted cleanup returns to 50 profiles, 11 Auth users, 96 Storage objects, no accepted Pokes, and no queued events.
The isolated hosted server stopped after its runner completed.
The source and documentation follow-up still needs its matching CI run and web release.
The web release remains on master `d3e452101178c9a36d51e78c30a4414d05573ae5`; PR #17 is still a draft and not merged.

## Earlier continuation checkpoints

The goal remains active and incomplete.
The release-hardening source checkpoint is `6420debfc` on `product-redesign`, published in [PR #17](https://github.com/AStoyanov2231/peek-poke.com/pull/17).
A read-only Expo follow-up found no project or account environment variables in production, preview, or development, and no cloud builds.
Actual Expo config evaluation reproduced development builds accepting production services; the guard now rejects production API or Supabase origins for both development and preview while allowing isolated services.
The complete native logic suite passes 535 tests, including ten release-environment tests; native typecheck and root lint also pass.
The PostgreSQL concurrency harness now uses a short cross-platform `/tmp` socket path, and both real concurrency suites pass after that change.
The existing SQL CI gate now installs PostgreSQL 17 and runs those suites; the corresponding hosted CI gate now passes.
The workflow YAML parses successfully, and [product operations](docs/product-operations.md) records the verified EAS configuration gaps and required next release evidence.
The publication gate was resolved by recovering the earlier explicit user approval for this branch and verifying the configured repository is public.
Automatic review accepted that evidence, the branch was pushed, and draft PR #17 was created.
Web, native, and browser CI passed; the initial SQL job failed because the runner lacked the PostgreSQL APT repository.
The workflow now installs the official signing key and explicitly configures the PostgreSQL repository before installing version 17.
All eight CI checks passed on `8c1203735`, including the actual PostgreSQL 17 concurrency suites on Linux.
The next browser flow reproduced an already-open Plan composer unmounting and losing its draft when the conversation expired.
Web and native now keep that independent composer mounted, with account/thread keys resetting its data on identity changes.
The new browser regression passes in 6.4 seconds.
Screenshot inspection exposed that the initial iOS draft-retention test did not prove cancellation: its Cancel tap left the modal open behind the keyboard.
The native composer now avoids the keyboard on iOS and dismisses it on scroll.
Android retains its native modal resizing; adding a second height adjustment reproduced clipped actions and was removed.
The strengthened iOS XCUITest verifies exact title retention, scrolls to the actions, and asserts the modal disappears after Cancel; it passes in 30.3 seconds.
Fresh screenshots under `test-results/native/plan-keyboard-ios/` show the retained title, accessible actions, and closed modal.
The corrected Android bundle separately retains `Picnic` through expiry and closes after Cancel, with history visible and send/call controls absent.
Android verification covered the emulator hardware/floating input method, not physical-device docked keyboards.
Native typecheck and native lint pass.
Creating a Plan does not enroll or message the conversation peer; the hosted journey now verifies owner-only membership after expiry.
All eight CI checks passed on `3347a5315`.
On `6420debfc`, both web, native, and browser jobs passed; both SQL jobs reproduced a second UTC-midnight fixture issue.
A prior one-hour-old Plan entered yesterday's cohort, invalidating an absolute expected count.
The SQL fixture now asserts the new Plan adds exactly one scheduled and mutually confirmed outcome, even with two confirmed participant pairs.
The failure reproduced locally before this correction, and the complete product SQL suite passes afterward.
The matching CI rerun remains required before migration activation.
React Doctor reports 91/100 with six warnings and no errors: four existing component-complexity warnings including the newly scanned Plan form, related-state guidance, and a small environment-validation array-chain warning.
No detector suppression was added.
The hosted product suite now includes a dedicated temporary-conversation journey with synthetic accounts, actual accepted renewal, message replay/denial, call replay/cancellation/delayed-delivery denial, readable history, friendship, and block precedence.
Its call, message, outbox, and user cleanup is explicitly scoped; this new hosted journey is not yet executed, and remains skipped without authorized integration configuration.
The pre-deployment baseline had 183 migrations, 50 profiles, 11 Auth users, and 96 Storage objects.
A fresh read exactly matches all saved original function definitions, owners, ACLs, migration history, and absent new objects; the candidate SQL hash still matches the sealed rollback package.
The final native fixture receipt records zero message sends.
Synthetic API, auth, Metro, test apps, and the task-started Android emulator were stopped; the pre-existing iOS Simulator remains available.
The Android keyboard setting was restored to its original value.
Expo login is verified as `andy2231`, and EAS created and linked `@andy2231/peek-poke`, project ID `e0631d17-11c0-47e9-a4fe-d577f0e6e06e`.
Project creation did not start a build or submission; release signing, distribution, and physical-device verification remain open.
Temporary Poke conversations are in local implementation using a working default of 24 hours after the latest acceptance, with readable history preserved.
The duration is an implementation assumption, not a user-confirmed policy.
The new shared access contract, service-owned facts endpoint, database message/call guards, delayed-call delivery check, and API expiry responses are implemented locally.
Web and native now hide new interaction controls when access is loading, unavailable, or expired, while retaining readable history, drafts, and deletion controls.
The expired state offers the existing Poke composer; sending alone does not reopen the conversation.
The browser regression first reproduced the missing expiry UI, then passed history retention, hidden composer/call controls, opening the new Poke dialog, timer expiry, access-service failure, draft recovery after renewal, and zero message sends.
That journey exposed the global disabled focus-refresh default; this permission query now explicitly refreshes on web focus, while native refreshes on screen focus and foreground activation.
Desktop/mobile visual inspection corrected missing size classes on the new Poke action, and the final screenshots are retained under `test-results/e2e/expired-chat-*.png`.
The SQL harness now passes 49 assertions using the exact deployed message-send, edit, call-start, and call-transition RPC bodies.
Four PostgreSQL 17 concurrency cases observe real lock waits and verify expiry after waiting, same-key deduplication, renewed acceptance, and friendship removal without extra messages or outbox events.
The real call-start RPC reproduced SQLSTATE 42P10 against the existing partial outbox index; the candidate migration adds the missing conflict predicate.
The exact old call-start and delivery functions, owners, grants, absent-object inventory, and 183-entry history were captured before any production change.
A separate private rollback package passes 25 assertions, and all eleven archived payloads verify against their hashes.
The original twenty-migration archive remains unchanged; [SUPABASE_ROLLBACK.md](SUPABASE_ROLLBACK.md) points to both packages and their reversal order.
The full product-database suite initially reproduced a timezone-sensitive test failure after Sofia midnight while UTC was still on the previous day.
The fixture now explicitly uses UTC for its UTC cohort assertions, and the complete product-database suite passes.
The focused API/contract suite passes 106 tests, and the native hook passes six iOS/Android tests covering expiry, refreshed renewal, access failure, and account-switch isolation.
The complete local suites pass 1,387 web tests, 531 native logic tests, 126 platform renderer tests, and fifteen browser journeys; ten hosted-only tests remain intentionally skipped outside their explicit runner.
Accepted-Poke and friendship realtime recovery now invalidate account-scoped conversation access on both clients, keeping the database response authoritative rather than trusting event payloads.
The focused realtime transport rerun passes four tests.
A fresh hosted read confirms authenticated users have only SELECT on messages, no direct call/Poke table writes, and no client write-column grants.
The pre-deployment database had no accepted Pokes and 183 migrations; the deployment update above supersedes this earlier checkpoint.
React Doctor reports 92/100 with four chat-component complexity/state warnings and no errors; the scoped design detector reports no findings, and no new suppression was added.
The installed iOS development app passes an XCUITest journey for retained history, missing message/call actions, new Poke opening/cancellation, timer expiry while typing, access failure, and restored draft after renewal.
Android development-app inspection independently confirms the expired state, new Poke dialog/cancellation, unavailable access, and restored `Android draft` with call/send controls after retry.
Screenshots were visually inspected and retained under `test-results/native/temporary-chat-android-*.png`; the iOS result bundle is recorded in the local native receipt.
The shared synthetic fixture still reports zero message sends after both journeys.
Android's production-release guard caught missing Google/Firebase provider configuration, so runtime checks used a development build without weakening release checks.
Signed native distribution, physical-device acceptance, hosted verification, source CI, and production activation remain open.
The new candidate migration has not changed the production database.
Root lint, the complete product-database suite, both PostgreSQL concurrency suites, and diff whitespace checks pass for this follow-up.

The next packaged Android check reproduced profile invitation links losing their token on cold launch while the same warm link reached Connect.
The invitation entry route now survives session hydration, while a screen-level boundary withholds all preview reads and Connect until an adult account is resolved.
Signed-out warm invitations explicitly retain their token through sign-in routing.
Visual inspection also found native asking users to review an invitation without displaying the inviter, despite an existing authenticated preview endpoint already serving web.
Native now uses that endpoint with a strict profile contract, token/profile identity matching, account-scoped cache keys, explicit loading/retry, and the inviter's name and avatar before Connect.
The copy explains that acceptance puts each person in the other's Friends list, matching the existing invitation RPC.
Late acceptance responses cannot navigate after the invitation screen loses its account/admission lifetime.
The completed APK passes signed-in cold launch, signed-out cold and warm links followed by sign-in, preview-service failure and explicit retry, and blocked admission.
Every checked flow leaves the independent fixture acceptance counter at zero, with Metro stopped throughout.
Inspected screenshots are saved locally as `test-results/native/android-invitation-preview.png` and `test-results/native/android-invitation-preview-recovery.png`.
The final local checks pass 531 native logic tests, 120 platform renderer tests, native typecheck, and lint.
React Doctor reports 91/100 with no errors and the two previously recorded root-navigator structure warnings; no suppression was added.
The preview uses the existing deployed endpoint and requires no database migration or provider configuration change.
[PR #16](https://github.com/AStoyanov2231/peek-poke.com/pull/16) passed all eight required checks, including thirteen browser journeys, and merged into master as `d3e452101178c9a36d51e78c30a4414d05573ae5`.
The matching production deployment is Ready in Dublin and serves both canonical domains.
Both homepages, Terms, Privacy, and the iOS association endpoint returned HTTP 200; the initial deployment-scoped error/fatal query returned no entries.
The local fixture services and emulator were stopped, and their temporary port forwards and UI dump were removed.
The sealed twenty-migration rollback archive retains its recorded SHA-256.
The native changes still require a signed binary release, and the full goal remains open against the recorded feature and launch requirements.
The navigation behavior matches [Expo's documented protected-route redirection](https://docs.expo.dev/router/advanced/authentication/); the fix preserves invitation intent without exposing adult-only actions during hydration.

The Android packaged-build review found an obsolete generated manifest with invitation links but no Plan links, despite both being present in app.json.
Expo prebuild regenerated the ignored Android project with both link families.
A command-level reproduction showed that the existing local release preflight accepted the obsolete manifest and proceeded to the build/install steps.
The release preflight now parses Android XML with Expo's own manifest utilities and compares the generated public-link records with app.json.
It also rejects missing auto-verification, broad extra link scope, development-client schemes, enabled backups, and missing blocked-permission removals.
Seven command-level tests pass using isolated temporary Android directories and stubbed build/install executables, so those tests never build or install an app.
A separate real arm64 release-mode APK built successfully with embedded JavaScript and synthetic loopback service configuration.
This local artifact uses development signing and is not a store-distribution candidate.
The packaged app reproduced a cold Plan link falling through to Now while the same warm link showed its preview.
The root navigator had initially excluded the public preview during session hydration, and bootstrap could replace it with the authenticated home route.
Public previews now remain registered during hydration, and only a complete valid public Plan path is exempt from bootstrap redirection.
Private Plan details and chat remain protected, and joining retains authentication and adult-admission checks.
The rebuilt APK passes signed-in and signed-out cold launches with Metro stopped.
An explicit anonymous Join opens sign-in, and successful fixture sign-in returns to the same preview.
The independent fixture counter remains at zero join requests throughout these checks.
Inspected captures are saved locally as `test-results/native/android-packaged-plan-cold-signed-in.png` and `test-results/native/android-packaged-plan-cold-signed-out.png`.
The emulator launch explicitly targets the package and does not prove OS website association or distribution signing.
Native verification passes 529 logic tests, 108 platform renderer tests, typecheck, and lint.
React Doctor reports 91/100 with no errors and two existing root-navigator structure warnings; no suppression was added.
The earlier profile-interest bounce finding is fixed with smooth exponential easing, with no ignore added.
No production database or provider configuration changed in this batch.
[PR #15](https://github.com/AStoyanov2231/peek-poke.com/pull/15) passed all eight required checks, including thirteen browser journeys, and merged into master as `33333333ee683d9dbe3630f80294378443a92b86`.
The matching production deployment is Ready in Dublin and serves both canonical domains.
Both homepages, Terms, Privacy, and the iOS association endpoint returned HTTP 200, and the initial deployment-scoped error/fatal query returned no entries.
This web deployment does not distribute the updated native binary.
The test emulator and synthetic API/Auth processes were stopped, and only the test port forwards and UI dump were removed.
The sealed twenty-migration rollback archive still matches its recorded SHA-256.
The full goal remains open against the feature coverage and launch requirements recorded below.

The next recovery review reproduced chat meetup status failing to load while the UI still offered an acknowledgement with no retry.
The actual browser regression failed before the fix, then passed through load failure, explicit retry, peer acknowledgement, separate consent, and mutual confirmation.
Web and native chat now show loading and recoverable failure states instead of treating unavailable status as an empty acknowledgement.
Confirmation queries and native retry attempts include the account identity, and keyed conversation sessions prevent state carrying across account or peer changes.
A native renderer reproduction also proved that a completed request could repopulate the query cache after the conversation unmounted.
Lifetime guards now reject those delayed writes and old native-alert callbacks, and a synchronous pending guard prevents duplicate consent submissions.
The focused native suite passes fourteen iOS/Android cases, including unmount, account-switch, retry, and duplicate-consent checks.
The complete local gates pass 1,371 web tests with ten intentional skips, 521 native logic tests, 108 platform renderer tests, root/native lint, and native typecheck.
The inspected phone screenshot is saved locally as `test-results/e2e/chat-meetup-recovery-mobile.png`.
React Doctor reports 90/100 for changed files with no errors.
The preexisting complexity/state warnings were confirmed against committed component snapshots; its additional loading-reset warning is a false positive for an account-lifetime guard inside the existing finally block.
No diagnostic suppression was added.
All thirteen browser journeys passed in 50.7 seconds.
[PR #14](https://github.com/AStoyanov2231/peek-poke.com/pull/14) passed all eight required checks and merged into master as `a5a1ce724f928cb1637cd97d4b848b9ca6b96ad9`.
The matching production deployment is Ready in Dublin on both canonical domains.
Homepage, Terms, Privacy, and the iOS association endpoint returned HTTP 200; the initial deployment-scoped error/fatal log query returned no entries.
No database or provider settings changed.

The existing `PeekPoke_API_36` Android emulator was booted without wiping its data or saving a new boot snapshot.
The existing local debug APK was installed with data preservation, and the current native source was loaded through Metro with loopback fixture API/Auth configuration and no external provider credentials.
Actual Android interaction verified login into Now, pending-Poke priority, Poke acceptance into chat, and cancellation of the explicit meetup-consent dialog.
Android discovery visibility changed from Everyone to Friends, saved, closed, and reopened with Friends still checked.
An independent fixture GET returned `audience: friends`.
The inspected captures are `test-results/native/android-accepted-chat.png` and `test-results/native/android-discovery-visibility-reopen.png`.
This is direct Android runtime evidence for those flows, not a signed release, app-link, push, camera, call, or physical-device verification.

The current follow-up batch connects the previously unused approximate-area hint to authorized nearby results in web and native direct chats.
It requires a fresh acknowledged device location and a recent successful nearby response, keeps explicit meetup acknowledgement independent, and preserves dismissal across refreshes.
The actual browser journey exposed same-account auth hydration clearing a valid location acknowledgement during navigation; the correction preserves that account's existing lease while retaining account-change and sign-out invalidation.
The focused browser journey now passes in 8.6 seconds, including independent acknowledgement, no reward or meetup POST, Plan-composer opening without submission, dismissal, and mobile overflow checks.
Desktop and mobile screenshots were inspected directly and show readable, untruncated hint text with separate actions.
Actual Simulator work also reproduced React Native's missing AbortSignal.throwIfAborted method during location refresh, prompting a portable cancellation check with regression coverage.
The Simulator subsequently reproduced a location-sync effect restarting on every new coordinate object and cancelling its own acknowledgement request.
The callback now reads current retained coordinates only when handling failure, keeping the active sync stable.
Direct iPhone 16 Simulator interaction confirmed the approximate-area hint, Plan-form opening and cancellation, and dismissal with the separate We met action preserved.
The inspected capture is saved locally as `test-results/native/chat-approximate-area.jpg`.
Native provider failures now show a short recovery message instead of the reproduced Expo Swift stack.
Temporary diagnostic logging was removed, the app-specific Simulator location permission was restored to its original denied state, and the synthetic coordinate was cleared.
The local gates pass 1,371 web tests with ten intentional skips, 521 native logic tests, 100 platform renderer tests, root/native lint, and native typecheck.
All twelve local browser journeys pass in 52.6 seconds.
[PR #13](https://github.com/AStoyanov2231/peek-poke.com/pull/13) passed all eight required checks and merged into master as `8f7c47ad0d702893b8e571f270bd8838aae0c4c9`.
The matching production deployment reached Ready in Dublin and serves both canonical domains.
Read-only post-release checks returned HTTP 200 for both homepages, Terms, Privacy, and the iOS association endpoint.
The deployment-scoped error/fatal log query returned no entries in the initial observation window; this does not establish ongoing alert coverage.
No new database migration or provider configuration change was made in this batch.
The twenty-migration rollback archive still matches SHA-256 `4cff473598c05a098e74f466516de81288d1a8c83e14de97bc6b68ccb3af77ab`.
Full native binary distribution, physical-device acceptance, support/privacy operations, external monitoring, and the remaining brief items are still open.
The long multi-navigation privacy renderer test has a ten-second timeout; its assertions are unchanged.
Browser fixtures now support a separate loopback Auth port so those checks can run alongside the native fixture without interrupting it.

The direct native discovery-privacy check now passes in the installed iPhone 16 Simulator app.
A standalone XCUITest runner selected a different audience, saved, closed Settings, reopened Discovery visibility, and confirmed the selection persisted.
Review corrected a checked-state assertion that could also match unchecked, and the repeatable test then passed in 21.9 seconds with Friends selected.
An independent read-only fixture GET confirmed the saved audience was friends.
The runner found React Native radio controls through XCTest's Other elements without changing application code or generated iOS files.
The manual user check is no longer required; physical-device verification remains open.
The repeatable runner is documented in [test/native-ui](test/native-ui/README.md), with the inspected screenshot saved in `test-results/native/discovery-visibility-reopen.jpg`.

The opt-in PostgreSQL 17 load harness passed with 100,000 stale rows, 1,000 fresh rows, 3,000 individually committed concurrent updates, and 101 bounded purge calls.
It also proved that a locked stale location refreshed by another transaction survives cleanup after commit.
The local p95 call time was 31.43 ms; this is a local observation, not a hosted capacity guarantee.
The workload, measured limits, and production index comparison are recorded in [location-retention-load.md](docs/production-baseline/location-retention-load.md).

The section-by-section brief assessment is recorded in [product-brief-coverage.md](docs/product-brief-coverage.md).
Meeting rewards still need an actual trusted-presence design and implementation, not just credentials.
Apple App Attest and Google Play Integrity can protect request integrity but do not establish the truth of GPS coordinates.
The current explicit mutual meetup acknowledgement remains the implemented recognition flow, and it does not issue location rewards.

The discovery and signed-invitation batch merged through [PR #12](https://github.com/AStoyanov2231/peek-poke.com/pull/12) as `b2668558a134deeac13582e7f2a10b847852da1a` after all eight checks passed on the final source.
The production deployment is Ready in Dublin and serves the canonical domains.
The scoped deployed social API suite passed in 19.05 seconds, including v1 shape compatibility, v2 context, authenticated direct-RPC denial, prior accepted-Poke context, stale-location and block exclusion, transactional Plan/Poke behavior, and synthetic cleanup.
Public homepage, terms, privacy, and iOS association checks returned 200.
Final CI passes 1,368 web tests with ten intentional integration skips, 516 native Vitest tests, 98 platform renderer tests, SQL fixtures, the production build, and all eleven browser journeys.
Desktop and mobile screenshots were inspected directly after correcting the capture target for the app's nested scroll container.
Visual review removed contradictory "new face" copy for a previous connection and verified context wrapping and Poke-action spacing.
The fixture regression was an invalid non-bucketed distance, reproduced in CI and repaired at the shared-contract boundary without weakening privacy validation.
The verified screenshots are saved locally in `test-results/release-pr12/`; private deployment and database receipts remain outside Git.
Full launch readiness still requires the external items in [PRODUCT_LAUNCH_BLOCKERS.md](PRODUCT_LAUNCH_BLOCKERS.md).
The brief's temporary-chat wording remains a pending product choice: current accepted-Poke chats stay open without creating a friendship automatically, and the user has been asked whether to keep that behavior or close them after 24 hours while preserving readable history.

The Settings policy-navigation correction merged through [PR #11](https://github.com/AStoyanov2231/peek-poke.com/pull/11) as `072fc488cc62a6274089e4722abbc076f708887f` with all eight required checks passing and a Ready production deployment.
The final brief review then identified missing mutual-connection and prior-interaction discovery ranking, plus a native signed-invite token lost during authentication redirects.
Web and native Now now opt into a versioned discovery response, preserve server ranking, and display at most two compact context labels.
The database function ranks eligible adults using intent, friendship, mutually acknowledged meetups, accepted Pokes, visible mutual friends, interests, a fifteen-minute recency bucket, coarse distance, and a stable tie-breaker.
It excludes blocked, hidden, deleted, non-admitted, or stale-location candidates before limiting results and does not expose intermediary identities, graph counts, or new history timestamps.
The original RPC and default API response retain their previous contracts.
Native login, age admission, and onboarding now preserve actual signed invitation tokens through to explicit Connect.

The twentieth additive migration was applied after saving the absent-function state, exact legacy definition and grants, full migration history, and a rehearsed guarded rollback.
Its hosted definition and ACL match the rehearsal, the original function is unchanged, and a read-only hosted invocation succeeds.
The sealed twenty-migration recovery archive and fresh-extraction checksum verification are documented in [SUPABASE_ROLLBACK.md](SUPABASE_ROLLBACK.md).
No production rollback was executed.
Local web lint and 1,368 tests pass with ten explicitly configured integration skips; native lint, typecheck, 516 Vitest tests, and 98 platform renderer tests pass.
The actual SQL harness passes ranking-before-limit, privacy, service grants, legacy-definition preservation, null-bound rejection, and coarse-distance tie-break regressions.
The local production build remains blocked by the previously observed Turbopack CSS-worker port-binding restriction, including an escalated attempt.
The strengthened Now browser journey and scoped hosted v2 API assertions are prepared for CI and post-release validation in [PR #12](https://github.com/AStoyanov2231/peek-poke.com/pull/12).
The source, required CI, merge, visual review, and deployed API verification are complete as recorded above.

The Plan-link, native Plan recovery, and optional suggestion-provider batch merged through [PR #10](https://github.com/AStoyanov2231/peek-poke.com/pull/10) as `3f4be1b074dee0894433e8b5fd18cc6957abdb88`.
All eight checks passed, the deployment reached Ready, the public iOS association served both invitation and Plan paths, and the scoped deployed social API suite passed.
That brief-fidelity review found that the suggestions interface had no configurable AI implementation and the native Plan feed lacked complete refresh and recovery states.
An optional external provider now uses explicit server-only configuration, minimized structured input, strict output validation, a four-second timeout, and a bounded response reader, retaining deterministic replies by default.
No live model call or provider-environment change has been made.
The Plan API already applies coarse nearby visibility rules; native Now now refreshes it after location updates and presents loading, retryable failure, and empty states while retaining authorized member Plans.

The public iOS association response and native Android manifest both omitted `/plan/` links.
The omission was reproduced against the public endpoint and in two failing configuration tests before adding Plan-preview coverage.
The focused tests now pass and preserve the narrow invitation/Plan route scope.
The Android association endpoint remains unavailable until the actual distributed signing fingerprint is configured, and OS-level link verification still requires signed devices.
Device inventory found a paired physical iPhone, but no matching local provisioning profile.
A separate unsigned iPhoneOS Debug build succeeded with a development bundle identifier, without installing over the existing app or changing signing-portal configuration.
The Android SDK is installed, but no Android device or emulator is attached.
The consolidated native gate passes typecheck, lint, 508 Vitest tests, and 94 iOS/Android renderer tests.
The web gate passes lint and 1,361 tests; ten explicitly configured integration tests skip in the local fixture-free run.
At that stage, the Simulator snapshot bridge could not activate the radio controls.
The standalone XCUITest verification above subsequently completed selection, save, close, and reopen.

The native Settings policy cards were reproduced as a navigation dead end in both platform renderers.
They now link to the actual public community rules and privacy-control pages, recover from a failed browser launch, and use 44-point link targets.
The Help text now describes the implemented Now and Map behavior without claiming that Map renders nearby Plans.
Focused iOS/Android navigation and retry checks, native lint, and typecheck pass.

Read-only monitoring review found that available runtime logs do not establish active worker alerts.
The deployment's Hobby plan does not support built-in Vercel Alerts, and those function metrics would not directly evaluate queue-age and dead-letter log fields anyway.
An approved external monitor and notification recipient remain required, with the evidence contract recorded in [observability.md](docs/production-baseline/observability.md).

## Current state

The web redesign and twenty database migrations are deployed after the user's approval.
PRs #7 and #8 established the verified web release at `d41ea0b312de6eee8cf9d98b8242628dc7a978e6` with passing required CI.
Its recovery deployment `dpl_AFPvN11NF3cPp5w6uLSQYDTPrViJ` passed public-domain and API verification in `dub1`, matching Supabase's Dublin region.
The native-flow source and browser correction merged through [PR #9](https://github.com/AStoyanov2231/peek-poke.com/pull/9) as `7a2c37141e81c94e3cc65af730f6579d713c819b` after all required checks passed.
That release passed the deployed age-admission and social API suites and public desktop/mobile rendering checks.
PR #10 subsequently shipped the Plan association and optional provider code with its full CI and scoped live verification described above.
All 31 authorized queued events completed, and the recurring worker returned HTTP 200 after deployment.
The saved migration-specific recovery package covers all twenty changes, original application data and Storage files, and guarded scheduler reversal; it is not a complete Auth/Vault disaster-recovery backup.
The verified database baseline has 50 profiles, 11 Auth users, 96 Storage objects, and 183 migration entries after the twentieth migration.

The native development build now includes editable chat reply suggestions, Now radius and low-density actions, prioritized Inbox selection, and removal of unavailable map-coin controls.
Simulator verification reached pending age admission, date review, blocked-account recovery, and Now through Poke acceptance into chat.
Direct native privacy save/reopen now passes through XCTest against the installed Simulator app.
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
- [20260908174342_discovery_context_ranking_v2.sql](supabase/migrations/20260908174342_discovery_context_ranking_v2.sql).

The initial 13 redesign migrations passed hosted read-only compatibility review and the ordered embedded PostgreSQL chain.
The fourteenth legacy SQL repair passed an execution-failure regression and permission/security-context preservation checks.
The first sixteen migrations produced 179 history entries, the next three brought the total to 182, and the versioned discovery function brings it to 183.
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
- [x] Verify direct native UI privacy save/reopen using the standalone XCTest runner against the installed Simulator app.
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
The final source is published in [PR #9](https://github.com/AStoyanov2231/peek-poke.com/pull/9), and its review record is the source for final CI, merge, and deployment status.
Native binary distribution and physical-device acceptance remain separate launch requirements after the source merge.
The first PR #9 browser run exposed an outdated assertion expecting a venue choice to replace the previous reply suggestion.
Updated the actual chat journey to start with a typed draft, preserve it through both reply and venue selection, and verify zero message POST requests.
The focused real-browser rerun passes in 9.1 seconds, with the full required CI rerun tracked in PR #9.

The final discovery review also corrected a verification gap: CI previously discarded the screenshots produced by the browser journeys.
The browser job now retains only synthetic fixture PNGs for fourteen days, allowing direct desktop/mobile inspection before release.
