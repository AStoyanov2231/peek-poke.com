# Product redesign verification

## Baseline test gate

Run `npm test` for the browser-independent suite.
The shared-group, product-social, and private Realtime suites are integration tests and skip when no `SUPABASE_TEST_*` configuration is present.
They fail before running when any partial or unapproved configuration is present, so accidental use of a non-test database is visible.

WebRTC overall-deadline behavior is tested at the deterministic command-queue boundary, including dispatch that ignores abort.
The hook suite retains authority-failure and state-projection coverage, while the duplicate deadline case tied to shared global state was removed after reproducing full-suite flakiness.

## Database integration tests

Database integration configuration is separate from normal runtime configuration and must be supplied deliberately.
The suites create dedicated synthetic accounts and clean up only their generated record IDs.
The shared target guard rejects partial credentials, mismatched hosted project references, and public application URLs.
The browser/API server must always bind to loopback and use the same backend URL and keys as the test clients.

An isolated local or hosted Supabase environment remains the default for repeatable release testing.
The user explicitly authorized direct MyaouDB verification on 2026-09-08 instead of creating a paid branch.
For that approved verification, hosted tests require the exact project reference, `SUPABASE_TEST_ISOLATED=true` for dedicated test-record isolation, and the additional `SUPABASE_TEST_ALLOW_PRODUCTION=1` opt-in.
These flags do not authorize schema deployment or grant general permission for future production testing.
Never use existing accounts, send external notifications, or invoke broad cleanup during these suites.

```sh
export SUPABASE_TEST_URL=http://127.0.0.1:54321
export SUPABASE_TEST_APP_URL=http://127.0.0.1:3000
export SUPABASE_TEST_SERVICE_ROLE_KEY=local-service-role-key
export SUPABASE_TEST_ANON_KEY=local-anon-key
npm test -- --run test/shared-groups-database.test.ts test/shared-groups-migration.test.ts test/product-database.test.ts
```

Use secure environment loading for real credentials and never print or commit their values.
The shared-group suites use explicit 30-second hooks and bounded network-test timeouts; a five-second unit-test default can race teardown against real API requests.
Hosted mode also requires `SUPABASE_TEST_TARGET` to match the project reference in `SUPABASE_TEST_URL`.
A production target requires explicit user authorization in addition to the opt-in flags.
Deployed API verification additionally requires `SUPABASE_TEST_ALLOW_DEPLOYED_APP=1`, the exact `https://www.peek-poke.com` origin, and the approved MyaouDB project with every existing hosted opt-in.
Without that additional gate, browser and API integration tests require a loopback application origin.
The deployed age and product API helpers refuse redirects, preventing credentials from following an unexpected host or login response.
The existing QR suites support the installed legacy schema; the product suite requires all ordered redesign migrations first.
The 2026-09-08 initial inventory found 163 hosted migration records and confirmed that the initial 13 redesign migrations are compatible with the full baseline schema.
The user subsequently approved production schema deployment and public publication after the initial verification-only authorization.
The existing QR migration-boundary test passed with real hosted authentication.
The shared-group lifecycle passed concurrent creation, membership isolation, messaging, and retry checks before reproducing account deletion returning HTTP 500 from a legacy `pg_catalog.coalesce` call.
The additional `20260908113704_legacy_sql_special_forms.sql` migration corrects only the 13 audited function signatures that contain invalid qualified SQL special forms.
All twenty migrations are installed with their actual hosted timestamps recorded in the repository, and the verified database has 183 migration-history entries.
The fifteenth corrects hosted Poke outbox uniqueness and service-role access.
The sixteenth removes product-social records when a profile is tombstoned and serializes concurrent writes with account erasure.
The seventeenth migration adds adult admission with no birth-date storage.
The eighteenth repairs the reproduced hosted group-reader and blocked-Plan regressions and revokes access to three retired chat RPCs.
The nineteenth migration, `20260908150805_profile_photo_moderation_buckets`, fixes the old two-bucket profile-photo constraint that raised SQLSTATE `23514` by adding `approved` and `quarantine` buckets.
The twentieth migration adds `get_available_people_v2`, preserving the original discovery definition and contract while ranking eligible people by authorized social context before limiting results.
The age-admission release run passed four tests in 33.61 seconds, and its social run passed one test in 32.27 seconds, including Redis-backed rate-limit coverage.
Run `node test/sql/legacy-sql-special-forms.mjs` to reproduce the failure locally and verify the correction, preserved permissions, and safe reapplication.
The scoped hosted runs removed their synthetic records and restored the observed baseline of 50 profiles, 11 Auth users, and 96 Storage objects.
The complete twenty-migration recovery archive preserves the unchanged nineteen-migration archive and adds the guarded discovery rollback; [SUPABASE_ROLLBACK.md](../SUPABASE_ROLLBACK.md) records its checksum and verification.
The discovery release merged through [PR 12](https://github.com/AStoyanov2231/peek-poke.com/pull/12) at `b2668558a134deeac13582e7f2a10b847852da1a` with all eight checks passing and a Ready production deployment in `dub1`.
Its scoped deployed social suite passed in 19.05 seconds, including v1 compatibility, v2 context, direct-client RPC denial, stale-location and block exclusion, and synthetic cleanup.

## Private Realtime provider proof

`test/product-realtime-database.test.ts` uses the same explicit hosted-target guard and does not need an application server.
Run it separately from suites that create accounts, because it checks whole-project counts before and after its scoped fixtures.
The hosted run passed on 2026-09-08: the synthetic owner subscribed to its private `sync:user:<uuid>` topic, received a real service-originated `messages-changed` broadcast, and received a new broadcast after reconnecting with a fresh authenticated client.
An unrelated synthetic account was denied with the provider's `CHANNEL_ERROR`, not merely a timeout.
Cleanup restored all three baseline counts: 50 profiles, 11 Auth users, and 96 Storage objects.
Broadcast is ephemeral, so this proves new delivery after reconnect; missed-event recovery remains the application's API refresh on subscription, not provider replay.

## Private Storage provider proof

`test/product-storage-database.test.ts` passed against the explicitly approved hosted target on 2026-09-08.
It verifies the private `media` bucket's service upload/read/delete lifecycle and denies direct reads or signed-URL creation to both a synthetic owner and an outsider.
This matches the application's server-mediated media architecture.
Strict teardown checks the exact generated key is absent and removes only its tracked synthetic profiles and Auth accounts.
This is a Storage access-boundary test; it does not replace application route authorization tests or a full media recovery rehearsal.

## Authenticated browser checks

`npm run test:e2e` uses Playwright and never inserts an application authentication bypass.
Use `E2E_FIXTURE=1` for the fully isolated transport fixture.
The optional `E2E_BASE_URL`, `E2E_EMAIL`, and `E2E_PASSWORD` settings are reserved for integration-specific tests against an explicitly approved backend; the fixture journeys deliberately skip in that mode.
`E2E_BASE_URL` is restricted to a loopback URL, and that local server must use the approved Supabase target and a dedicated completed-onboarding test account.
The eleven journeys use the actual login form and cover first-time onboarding, availability, Poke retry identity, editable venue suggestions and Plan prefill, chat, mutual meetup acknowledgement, Plan creation, anonymous invitations, explicit join after sign-in, discovery visibility save recovery, activity Map and profile context, recent-Plan confirmation with retry, and low-density/error states.
Screenshots and failed-test traces are saved under `test-results/e2e`.
Browser fixtures verify interactions and DTO handling; they do not verify hosted authentication, RLS, Storage, push delivery, or provider behavior.
The earlier nine-journey fixture run, including the privacy reopen regression, passed in `/tmp/peek-web-fixture-e2e-privacy-final.log`.
The current browser fixture evidence covers eleven journeys.

`test/e2e/fixture-supabase-server.mjs` is a loopback-only, test-only Supabase transport fixture for this browser harness.
It supplies a deterministic authenticated user and minimal REST/RPC results without using application bypass code, a hosted project, or production credentials.

## Native verification

The signed iPhone 16 development build and Android compilation pass after the iOS scene-configuration fix and the Expo 57.0.20 / React Native 0.86.3 patch alignment.
The unlocked Mac enabled actual fixture Login, Now availability, Poke sending/acceptance, Chat, Plan creation/detail/Back, recent meetup confirmation, location-decline recovery, Me, and discovery-sheet loading.
The generated-username onboarding replay passes through chosen-username entry, three interests, optional intent/location decline, and return to Now with completion persisted.
Direct privacy selection, save, close, and reopen passed on 2026-09-08 through a standalone XCUITest runner against the installed iPhone 16 Simulator app.
The repeatable test selects a different audience from the initial state, saves, closes Settings, reopens Discovery visibility, and asserts the exact checked state.
Review corrected a substring assertion that also matched unchecked; the corrected test passed in 21.9 seconds with Friends selected, and a separate read-only fixture GET confirmed the saved audience was friends.
XCTest exposed the React Native radio controls as Other elements, resolving the earlier snapshot bridge limitation without changing application code.
The repeatable opt-in harness and its initial-state prerequisites are in [test/native-ui](../test/native-ui/README.md).
The inspected screenshot and private local result-bundle receipt are `test-results/native/discovery-visibility-reopen.jpg` and `test-results/native/discovery-visibility-reopen.receipt.txt`.
New native screenshots are saved under `test-results/native` so rerunning Playwright does not remove them.
The generated-username evidence is `test-results/native/onboarding-temporary-username.jpg`.
The PR 12 native gate passed 516 Vitest tests and 98 Jest tests, for 614 tests total.
The earlier 486-Vitest and 90-Jest result is historical evidence.
The native Poke sender, note, absolute local expiry, accepted-chat navigation, and Inbox badge behavior were visually verified in `test-results/native/pokes-received.jpg`, `test-results/native/poke-accepted-chat.jpg`, and `test-results/native/pokes-cleared-after-accept.jpg`.
The fixture intentionally omits accepted incoming Pokes and sent entries after acceptance, so those screenshots do not prove terminal-history or sent-card UI; unit presentation and state tests cover those paths.
The suite, TypeScript, and lint logs are `/tmp/peek-product-native-consolidated.log`, `/tmp/peek-product-native-consolidated-types.log`, and `/tmp/peek-product-native-consolidated-lint.log`.
This evidence does not establish physical-device or provider readiness.
Native screenshots are retained under `test-results/native`; earlier native screenshots under `test-results/e2e` are historical and may be erased by later Playwright runs.

Keep `with-ios-release-hardening` first in the Expo plugin list.
Its plist callback writes the completed Debug configuration before returning the hardened Release configuration.
Registering the scene plugin before it omitted the Debug scene manifest and left the application window unattached on iOS 27.
`apps/native/test/ios-plugin-order.test.ts` executes real Expo mod composition against a temporary fixture and verifies both plist outputs.

Use normal local Simulator signing when testing SecureStore.
An unsigned build with `CODE_SIGNING_ALLOWED=NO` compiled but failed SecureStore access with a missing-entitlement error.
Run CocoaPods from `apps/native/ios` so native autolinking resolves the correct project.
The SDK 57 prebuild invocation regenerated the iOS directory even without an explicit clean flag during this run; preserve the reusable native-development workflow and avoid regeneration for JavaScript-only changes.

`test/e2e/native-fixture-server.mjs` serves synthetic native API responses on loopback port 3002 alongside the isolated Supabase fixture on 54321.
It supports availability, Poke creation/acceptance, chat, Plan creation/detail/acknowledgement, ID-specific profile summaries, and persisted discovery-audience preferences without changing the application authentication path.
Use fixture-only Metro environment values and never point this harness at production services.

## Meeting reward prerequisite

Approximate location discovery is available only after the user grants location permission and the client has a fresh server acknowledgement.
It excludes the caller's coordinate from discovery after ten minutes and returns other people only in coarse display cells.
The retention and outbox schedules are active in production.
Production alert configuration remains open; [the observability baseline](production-baseline/observability.md) is authoritative.
It must never authorize a reward or prove that a meeting occurred.

`POST /api/coins/meeting` remains deliberately unavailable until the service verifies an attestation from a supported device location provider.
The web and native runtime retain their eligibility and transport paths but do not submit automatic or manual reward claims until an explicit server-issued attestation capability is available.
Before enabling awards, record and verify the provider assertion server-side, bind it to the authenticated account and a short expiry, reject replayed assertions, and run two-device tests that prove stale, spoofed, blocked, distant, and concurrent claims cannot create an award.
The additive `20260908113347_mutual_meetup_acknowledgements.sql` migration provides a separate participant-private, pair-per-day acknowledgement with independent confirmation, expiry, account-deletion cascade, block handling, and idempotent API delivery.
It must never be represented as evidence of physical presence or used to award coins.
Realtime convergence for acknowledgements is not yet emitted through the existing outbox worker, so clients refresh `GET /api/meetups?peerId=UUID` every 30 seconds and after acknowledgement requests until that follow-up is implemented.

## Reproducible local commands

```sh
npm test
npm run lint
npm run build
npm run test:product-db
npm run native:typecheck
npm run native:lint
npm run native:test
E2E_FIXTURE=1 npm run test:e2e
```

## Current local verification evidence

The PR 12 root web/server evidence records 1,368 passing tests and 10 intentional skips.
The earlier 1,314-test run in `/tmp/peek-product-final-web-tests-rerun.log` deliberately skipped three hosted suites because its approved target environment was not supplied.
The new hosted Realtime and Storage suites also require explicit credentials and are excluded from ordinary fixture-only CI.
Root lint and the production build passed in `/tmp/peek-product-final-web-lint.log` and `/tmp/peek-product-final-web-build.log`.
The high-severity production dependency audit reported zero high or critical advisories and 15 moderate advisories.
Five SQL suites are part of the current verification set.

The opt-in `node test/sql/postgres-concurrency.mjs --load` run additionally passed on local PostgreSQL 17 with 100,000 stale rows, 1,000 fresh rows, and 3,000 committed concurrent updates.
It verified bounded batches, exact stale-row removal, fresh-row retention, and a stale row refreshed while locked surviving cleanup after commit.
The [load report](production-baseline/location-retention-load.md) records measured local timing and the hosted conditions it does not model.

Install Playwright Chromium when it is not available, or provide `E2E_CHROMIUM_EXECUTABLE_PATH` for an existing compatible local executable.
The fixture binds only to loopback, uses separate build output, overrides Supabase and provider credentials, and leaves the normal application authentication checks in place.
The fixture harness must always override real credentials with its loopback fixture configuration.

## Migration promotion

The canonical SQL lives in `supabase/migrations` in timestamp dependency order.
Review compatibility against the complete preexisting schema before applying it to an approved target.
The approved twenty-migration production batch is installed and its follow-up hosted regressions are tracked in `Progress.md`.
The matching application release must follow successful hosted verification and the release configuration checks.
`npm run test:product-db` executes the chain against a compact legacy fixture and checks domain invariants, but it does not simulate separate concurrent backend connections, full RLS roles, Storage, or Realtime infrastructure.
Before promotion, run simultaneous duplicate Poke responses, last-capacity Plan joins, reciprocal acknowledgements, block changes, and legacy refund attempts using synthetic accounts.
Verify that new application contracts are deployed only after their database functions and tables.

For rollback, stop application writes, workers, and scheduled jobs, then follow [SUPABASE_ROLLBACK.md](../SUPABASE_ROLLBACK.md) for the exact deployed batch.
Preserve new social records and idempotency evidence; do not blindly drop populated tables or reintroduce coin charges while clients can still retry old operations.
Use a reviewed forward repair or restore rehearsal appropriate to the failing migration, and record the chosen database recovery point before promotion.

## Hosted security advisor review

The 2026-09-08 advisor reported three authenticated SECURITY DEFINER chat-summary functions.
Read-only review confirmed each derives the viewer from `auth.uid()`, rejects missing or deleted profiles, and restricts every room to the caller's membership.
These are intentional authenticated inbox endpoints, so no privilege suppression or removal was added.
The general advisor explanation is available in the [Supabase function-execution check](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable).

The advisor also reported disabled leaked-password protection.
Enabling it remains a hosted Auth configuration task under the [Supabase password-security guidance](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

## Separate-session erasure test limitation

The hosted stale-request regressions prove that writes reaching the database after a tombstone cannot recreate availability, Plan membership, idempotency, or metrics rows.
The SQL guards lock referenced active profiles in sorted UUID order with `FOR SHARE`, which conflicts with the profile's deletion update.
Attempts to observe an actual blocked concurrent transaction through the management connector and a separate REST process were inconclusive because tool dispatch and approval timing serialized or reordered execution.
The observed late SQL write was rejected with SQLSTATE 23514, but no live lock-wait assertion is claimed.
A deterministic two-session PostgreSQL harness with a transaction barrier remains part of the full release evidence.
