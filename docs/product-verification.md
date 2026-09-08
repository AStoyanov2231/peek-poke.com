# Product redesign verification

## Baseline test gate

Run `npm test` for the browser-independent suite.
The shared QR group database suites are integration tests and skip when no `SUPABASE_TEST_*` configuration is present.
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
The existing QR suites support the installed legacy schema; the product suite requires all ordered redesign migrations first.
The 2026-09-08 inventory found 163 hosted migration records and confirmed that the initial 13 redesign migrations are compatible with the full baseline schema.
The first production apply attempt was rejected by automatic approval review because verification permission did not include schema deployment, so no migration was applied.
The existing QR migration-boundary test passed with real hosted authentication.
The shared-group lifecycle passed concurrent creation, membership isolation, messaging, and retry checks before reproducing account deletion returning HTTP 500 from a legacy `pg_catalog.coalesce` call.
The additional `20260908140000_legacy_sql_special_forms.sql` migration corrects only the 13 audited function signatures that contain invalid qualified SQL special forms.
All 14 reviewed migrations still require explicit deployment approval after the automatic approval review rejection.
Run `node test/sql/legacy-sql-special-forms.mjs` to reproduce the failure locally and verify the correction, preserved permissions, and safe reapplication.
Both hosted test runs removed their synthetic accounts and restored the observed baseline of 50 profiles and 11 auth users.

## Authenticated browser checks

`npm run test:e2e` uses Playwright and never inserts an application authentication bypass.
Use `E2E_FIXTURE=1` for the fully isolated transport fixture.
The optional `E2E_BASE_URL`, `E2E_EMAIL`, and `E2E_PASSWORD` settings are reserved for integration-specific tests against an explicitly approved backend; the fixture journeys deliberately skip in that mode.
`E2E_BASE_URL` is restricted to a loopback URL, and that local server must use the approved Supabase target and a dedicated completed-onboarding test account.
The nine journeys use the actual login form and cover first-time onboarding, availability, Poke retry identity, editable venue suggestions and Plan prefill, chat, mutual meetup acknowledgement, Plan creation, anonymous invitations, explicit join after sign-in, discovery visibility save recovery, activity Map and profile context, recent-Plan confirmation with retry, and low-density/error states.
Screenshots and failed-test traces are saved under `test-results/e2e`.
Browser fixtures verify interactions and DTO handling; they do not verify hosted authentication, RLS, Storage, push delivery, or provider behavior.
The current nine-journey fixture run, including the privacy reopen regression, passed in `/tmp/peek-web-fixture-e2e-privacy-final.log`.

`test/e2e/fixture-supabase-server.mjs` is a loopback-only, test-only Supabase transport fixture for this browser harness.
It supplies a deterministic authenticated user and minimal REST/RPC results without using application bypass code, a hosted project, or production credentials.

## Native verification

The signed iPhone 16 development build and Android compilation pass after the iOS scene-configuration fix and the Expo 57.0.20 / React Native 0.86.3 patch alignment.
The unlocked Mac enabled actual fixture Login, Now availability, Poke sending/acceptance, Chat, Plan creation/detail/Back, recent meetup confirmation, location-decline recovery, Me, and discovery-sheet loading.
The generated-username onboarding replay passes through chosen-username entry, three interests, optional intent/location decline, and return to Now with completion persisted.
Direct privacy save/reload remains unverified.
The Simulator bridge omitted the discovery radio/button targets despite their visible labels; an alternate Device Hub UI connection timed out.
The fixture privacy PATCH/GET persistence was separately verified and restored to everyone.
New native screenshots are saved under `test-results/native` so rerunning Playwright does not remove them.
The generated-username evidence is `test-results/native/onboarding-temporary-username.jpg`.
The final native gate passed 486 Vitest tests across 63 files and 90 Jest tests across 30 iOS/Android suites, for 576 tests total.
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
The retention migration and authorized cleanup endpoint are release prerequisites, but deletion is not active until the production scheduler is configured to invoke it.
It must never authorize a reward or prove that a meeting occurred.

`POST /api/coins/meeting` remains deliberately unavailable until the service verifies an attestation from a supported device location provider.
The web and native runtime retain their eligibility and transport paths but do not submit automatic or manual reward claims until an explicit server-issued attestation capability is available.
Before enabling awards, record and verify the provider assertion server-side, bind it to the authenticated account and a short expiry, reject replayed assertions, and run two-device tests that prove stale, spoofed, blocked, distant, and concurrent claims cannot create an award.
The additive `20260908050000_mutual_meetup_acknowledgements.sql` migration provides a separate participant-private, pair-per-day acknowledgement with independent confirmation, expiry, account-deletion cascade, block handling, and idempotent API delivery.
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

The current web/server run passed 1,314 tests across 147 files in `/tmp/peek-product-final-web-tests-rerun.log`.
Three hosted-database integration suites deliberately skipped because their approved target environment was not supplied.
Root lint and the production build passed in `/tmp/peek-product-final-web-lint.log` and `/tmp/peek-product-final-web-build.log`.
The high-severity production dependency audit reported zero high or critical advisories and 15 moderate advisories.

Install Playwright Chromium when it is not available, or provide `E2E_CHROMIUM_EXECUTABLE_PATH` for an existing compatible local executable.
The fixture binds only to loopback, uses separate build output, overrides Supabase and provider credentials, and leaves the normal application authentication checks in place.
The fixture harness must always override real credentials with its loopback fixture configuration.

## Migration promotion

The canonical SQL lives in `supabase/migrations` in timestamp dependency order.
Review compatibility against the complete preexisting schema before applying it to an approved target.
All 14 reviewed migrations remain unapplied after automatic approval review rejected the first deployment attempt.
Production deployment requires explicit approval and must precede the matching application release.
`npm run test:product-db` executes the chain against a compact legacy fixture and checks domain invariants, but it does not simulate separate concurrent backend connections, full RLS roles, Storage, or Realtime infrastructure.
Before promotion, run simultaneous duplicate Poke responses, last-capacity Plan joins, reciprocal acknowledgements, block changes, and legacy refund attempts using synthetic accounts.
Verify that new application contracts are deployed only after their database functions and tables.

For rollback, stop new traffic to the affected feature and roll back application deployment first.
Preserve new social records and idempotency evidence; do not blindly drop populated tables or reintroduce coin charges while clients can still retry old operations.
Use a reviewed forward repair or restore rehearsal appropriate to the failing migration, and record the chosen database recovery point before promotion.

## Hosted security advisor review

The 2026-09-08 advisor reported three authenticated SECURITY DEFINER chat-summary functions.
Read-only review confirmed each derives the viewer from `auth.uid()`, rejects missing or deleted profiles, and restricts every room to the caller's membership.
These are intentional authenticated inbox endpoints, so no privilege suppression or removal was added.
The general advisor explanation is available in the [Supabase function-execution check](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable).

The advisor also reported disabled leaked-password protection.
Enabling it remains a hosted Auth configuration task under the [Supabase password-security guidance](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).
