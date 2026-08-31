# Cross-platform parity matrix

Updated: 2026-08-31

The Next.js product is the functional and visual reference. “Native” means the
single Expo Router application in `apps/native`, with the same TypeScript
implementation exercised for both iOS and Android. Stripe checkout, webhook,
portal creation and platform association files are intentionally
web/backend-only; native may only open the canonical HTTPS Premium page when
the configured platform, region, storefront, and environment policy allows it.

The current client flow is QR-scoped group chat.
The web and Expo clients use room listing, opaque QR capability creation and
joining, bounded room text messages, durable room read state, room-safe profile
projections, and scoped Realtime hints.
Legacy location, nearby, direct-message, and social-discovery data and API
surfaces remain for compatibility, but the current room flow does not expose or
update them.
Hosted migrations, staging flows, runtime, deployment, and security approval
are not established by repository results alone.

## User-facing route inventory

| Web route and reference | Capability, actions, and branches | iOS counterpart | Android counterpart | Status |
| --- | --- | --- | --- | --- |
| `/welcome` — `src/app/(auth)/welcome/page.tsx` | Redirects to `/login`; it does not render a branded introduction | `apps/native/app/(auth)/welcome.tsx` and login welcome mode | Same Expo route, Android branch covered by static platform tests | Web redirect verified; native behavior remains part of the in-progress parity audit |
| `/login` — `src/features/auth/components/LoginPage.tsx` | Email/password sign-in and sign-up, Google/Apple OAuth, resend confirmation, forgot password, validation, provider and auth errors, invite preservation | `apps/native/app/(auth)/login.tsx` | Same Expo route | Implemented |
| `/auth/callback` — `src/app/auth/callback/route.ts` | OAuth/code exchange and error redirect | `apps/native/app/auth/callback.tsx` | Same Expo route/deep-link scheme | Implemented |
| `/reset-password` — `src/features/auth/components/ResetPasswordPage.tsx` | Recovery-code exchange, password validation/update, success/sign-out, invalid-link error | `apps/native/app/auth/reset-password.tsx` | Same Expo route | Implemented |
| Authenticated root `/` — `src/app/(main)/page.tsx`, `src/features/rooms/components/RoomsPage.tsx` | Session restoration and QR-room list with create, scan, join, unread, loading, and error states | `apps/native/app/index.tsx` redirects into the Rooms tab; `apps/native/app/(app)/rooms.tsx` provides the room list and QR creation flow; `apps/native/app/(app)/scan.tsx` supports camera scanning and validated manual payload entry | Same Expo bootstrap and room routes | Repository route and contract support present; hosted migration, staging, and runtime approval remain separate rollout gates |
| `/onboarding` — `src/features/onboarding/components/OnboardingPage.tsx` | Username validation/availability, minimum interest selection, add/remove interests, progress/loading/error, invite continuation | `apps/native/app/onboarding.tsx` | Same Expo route | Implemented |
| `/profile` — `src/features/profile/components/ProfilePageClient.tsx` | View profile; edit canonical display name, bio, and interests; manage cover, avatar, and photos; view stats/Premium and use share/settings. Display-name updates use the shared profile contract and invalidate current projections | `apps/native/app/(app)/profile.tsx` uses `owner-display-name-editor` with terminal profile/search/discovery invalidation after an update; bio/interests retain their dedicated bounded paths | Same Expo route with native pickers, sheets, alerts, and sharing | REPOSITORY PASS / RELEASE BLOCKED: `20260807221500_enforce_display_name_invariant.sql` and `20260807193532_durable_profile_update_fanout.sql` require hosted promotion plus disposable-Postgres, staging, browser, and device proof |
| `/profile/[userId]` — `src/features/profile/components/PublicProfilePage.tsx` | Viewer-aware profile, public/private media gating, interests/stats, report, block, deleted/unauthorized/not-found/error, with no location or presence projection in the room surface | `apps/native/app/(app)/profile/[userId].tsx` uses the room-safe public profile DTO and rejects malformed/foreign media before cache commit | Same Expo route | Room flow does not expose location or connection data; hosted promotion and browser/device proof remain separate gates |
| `/premium` — `src/features/profile/components/PremiumPage.tsx` | Entitlement display/refresh, price, web checkout, web subscription portal, return-from-payment refresh | `apps/native/app/(app)/premium.tsx` displays authoritative backend entitlement; native dialog opens canonical HTTPS page only when policy permits | Same, with independent Android policy branch | Implemented; external store-policy config required |
| `/map` compatibility route | Not a current web entry point | `apps/native/app/(app)/map.tsx` redirects to Rooms for old deep links | Same native route | Compatibility alias only; no map or location flow is mounted |
| `/friends`, `/messages`, `/inbox` compatibility routes | `/inbox` renders Rooms; `/friends` redirects to `/`; `/messages` redirects to `/inbox` | Native aliases redirect to Rooms and do not expose social-discovery or direct-message entry UI | Same Expo routes | Compatibility aliases only; legacy data and APIs are retained |
| `/chat/[threadId]` compatibility route | Legacy direct-message URLs redirect to `/` and are not a current entry point | No current room-flow direct-message entry point | Same Expo route policy | Compatibility route only; legacy direct-message data and APIs are retained |
| `/room/[roomId]` — `src/features/rooms/components/RoomChatContent.tsx` | Member-only room history, bounded older-page loading, text send with idempotency, read-state advancement, and room Realtime invalidation | `apps/native/app/(app)/room/[roomId].tsx` provides the same text-only room chat and durable read behavior | Same Expo route | Room migration and hosted RPC promotion are required before production approval |
| `/invite/[inviterId]` — `src/features/invites/components/InvitePage.tsx` | Auth-aware invitation acceptance, profile continuation, failure/retry | `apps/native/app/invite/[inviterId].tsx` | Same Expo route and notification/deep-link navigation | Implemented |
| `/admin` — admin feature files | Role-gated photo moderation, report moderation, coin placement/removal, filters, pagination, mutation failures, loading/empty/unauthorized. Report actions own pending state and retain the queue with retry/cancel on failure | `apps/native/app/(app)/admin.tsx` uses the same strict report action/result contract with real accessible controls | Same Expo route | Admin reports are `REPOSITORY PASS / RELEASE BLOCKED`; no hosted moderation write, moderator runtime, staging, or device/browser proof is claimed |
| Global/main error and loading boundaries | Main error recovery, Rooms loading/error, profile loading/error, admin loading, retry | Expo Router error boundary in `apps/native/app/_layout.tsx`, `RouteErrorRecovery`, room screen skeleton/error states | Same native boundary | Implemented |

## API/action inventory

All native durable business calls below use `apps/native/src/lib/api.ts` and the
versioned Next.js API. Native calls Supabase directly only for Auth session
management and private Realtime Broadcast/signaling.

| API route | Web behavior | Native behavior | Scope/status |
| --- | --- | --- | --- |
| `GET /api/bootstrap` | Minimal identity, onboarding, roles, config version, and surface-specific unread summary | Room surface requests the room unread count; legacy callers may request the DM thread count | Shared surface-aware bootstrap contract |
| `GET/PATCH /api/profile` | Current profile read/edit; the room read surface omits location and connection fields | Profile/onboarding read/edit; room startup uses the room-safe current-profile request | Shared; display-name migrations and hosted/Postgres/staging/device proof remain separate gates |
| `GET /api/profile/[userId]` | Viewer-aware public profile; the room surface omits location and connection fields | Public profile through the room-safe DTO | Shared; current room flow does not expose location or presence |
| `PATCH /api/profile/username` | Username update | Onboarding username update | Shared |
| `POST /api/profile/complete-onboarding` | Complete onboarding | Complete onboarding | Shared |
| `GET/POST /api/profile/interests` | Read/add interests | Onboarding/profile interests | Shared |
| `DELETE /api/profile/interests/[interestId]` | Remove by profile-interest record ID | Same record-ID contract | Shared |
| `GET/POST /api/profile/photos` | Bounded list/upload metadata | Profile media list/upload | Shared |
| `PATCH/DELETE /api/profile/photos/[photoId]` | Reorder/avatar/privacy/delete | Same actions through native dialogs | Shared |
| `POST /api/profile/cover` | Upload cover | Native image picker then backend upload | Shared |
| `POST/DELETE /api/profile/push-token` | Browser/provider registration where applicable | Expo device registration/revocation | Shared; provider config external |
| `GET /api/interests` | Interest catalog | Onboarding/profile catalog | Shared/cached |
| `POST /api/upload` | Backend-authorized legacy DM/profile media upload | Profile upload; no direct native Storage API; room messages are text-only | Shared; room media is not currently supported |
| `POST /api/account/delete` | Disable-first destructive confirmation, global session revocation, transactional erasure/cleanup queue, retryable provider cleanup | Native settings confirmation and the same backend workflow | Shared; migration and worker promotion required before production activation |
| `GET/POST /api/friends` | Legacy viewer-bound friend reads and request creation remain available for compatibility | No current room-flow caller | Compatibility-only; current clients do not expose or update social discovery |
| `GET /api/friends/requests` | Direction-bound, peer-unique received/sent pages remain available for legacy clients | No current room-flow caller | Compatibility-only |
| `PATCH/DELETE /api/friends/[friendshipId]` | Legacy accept/decline and delete/block actions remain available for older clients | No current room-flow caller | Compatibility-only |
| `GET /api/invites` and `POST /api/invites/[inviterId]` | Secure origin-bound link creation and exact token-bound acceptance | Native share/deep-link accept through identical validated, no-store contracts | Shared |
| `POST/DELETE /api/users/[userId]/block` | Block/unblock backend capability; current profile UI exposes block | Native public-profile block; no extra native-only behavior invented | Parity with current web UI |
| `POST /api/users/[userId]/report` | Categorized report | Native category/reason alert flow | Shared |
| `POST /api/location` | Legacy location update endpoint is retained but fails closed with `LOCATION_VERIFICATION_UNAVAILABLE` | No current client caller; no location permission or coordinate update is mounted in the room flow | Compatibility-safe fail-closed endpoint |
| `POST /api/nearby` | Legacy nearby endpoint is retained but fails closed with `LOCATION_VERIFICATION_UNAVAILABLE` | No current client caller | Compatibility-safe fail-closed endpoint |
| `GET /api/search/tags`, `POST /api/search/tags/resolve`, `POST /api/search/users` | Legacy map/search contracts remain available where supported | No current room-flow caller | Compatibility-only; no map-based presence is rendered |
| `GET/POST /api/bots`, `GET /api/coins`, `POST /api/coins/meeting` | Legacy coin and meeting surfaces remain available or fail closed according to their route contracts | No current room-flow caller | Compatibility-only; room membership is not location-based |
| `GET/POST /api/dm/threads` | Legacy direct-message inbox and thread creation contract remains available for older clients | No current room-flow caller | Compatibility-only; current clients do not expose direct-message entry |
| `GET/POST /api/dm/[threadId]` | Legacy bounded direct-message history and send contract remains available for older clients | No current room-flow caller; room chat uses the room endpoints below | Compatibility-only; room messages are text-only and room-scoped |
| `GET/POST /api/rooms` | GET lists member-only room summaries with bounded cursor pagination; POST creates a room and returns its summary plus the creator-only opaque QR capability | Native uses the same validated list and create contracts through `apiFetch` | Shared room contract; hosted room migration and RPC promotion remain required |
| `POST /api/rooms/join` | Validates an opaque QR capability at the server boundary, joins the authenticated user, and returns only the resolved room summary | Native camera and manual-paste scanner sends the same validated payload | Shared member-only join contract |
| `GET/POST /api/rooms/[roomId]/messages` | GET returns bounded member-only room history and advances the viewer read cursor on the initial page; POST sends text with an idempotency key | Native uses the same room history, text composer, and retry-safe send contract | Shared room contract; hosted room migration and RPC promotion remain required |
| `POST /api/rooms/[roomId]/read` | Advances the authenticated member's durable room read cursor and emits a hint only when the position advances | Native room clients invalidate room and unread queries from scoped hints | Shared durable read-state contract |
| `PATCH/DELETE /api/dm/[threadId]/[messageId]` | Legacy direct-message edit/delete remains available for older clients | No current room-flow caller | Compatibility-only |
| `POST /api/dm/[threadId]/read` | Legacy direct-message read cursor remains available for older clients | No current room-flow caller; room reads use `/api/rooms/[roomId]/read` | Compatibility-only |
| `POST /api/dm/[threadId]/typing` | Legacy private direct-message typing hint remains available for older clients | No current room-flow caller | Compatibility-only |
| `POST /api/dm/[threadId]/call` | Legacy membership-authorized direct-message call signaling remains available for older clients | No current room-flow caller | Compatibility-only |
| `GET /api/webrtc/ice-servers` | Web call ICE credentials for retained legacy call flows | No current room-flow caller | Compatibility-only |
| `GET /api/billing/entitlements` | Backend-authoritative roles/subscription | Backend-authoritative native Premium state and foreground refresh | Shared |
| `GET /api/stripe/price` | Price display | Native informational price display | Shared read |
| `POST /api/stripe/checkout` | Web checkout | Not called by native | Web-only by policy |
| `POST /api/stripe/portal` | Web billing portal | Not called by native | Web-only by policy |
| `POST /api/stripe/webhook` | Stripe receipt/projection | No client caller | Backend-only |
| `GET /api/internal/outbox` | Secret-authenticated bounded worker for message/push, call push, billing audit, and deletion cleanup events | No client caller | Backend-only; Vercel Cron |
| `GET/POST/DELETE /api/admin/coins/**` | Admin coin management | Native admin role equivalent | Shared role-gated |
| `GET/PATCH /api/moderation/photos/**` | Photo moderation, including atomic featured-media clearing on rejection | Native admin photo moderation through the same strict media DTO | REPOSITORY PASS / RELEASE BLOCKED: approved-media migration promotion, staging, and runtime proof are required |
| `GET/PATCH /api/moderation/reports/**` | Role-gated report moderation; raw database rows, including nullable profile relations, are parsed fail-closed before strict list/mutation DTOs are returned | Native admin report moderation uses the same request-correlated mutation contract and queue invalidation only after valid success | REPOSITORY PASS / RELEASE BLOCKED: raw DB parser/contract evidence only; no hosted write, moderator session, staging, browser, or device runtime proof |
| Association-file routes | Web-hosted iOS/Android app-link metadata | Consumed by OS deep-link handling, not app UI | Platform infrastructure |
| Legacy `GET /api/preload` | Compatibility for older supported clients | Current native/web migrate to bounded bootstrap/screen queries | Compatibility-only; removal needs usage evidence |

## State, permission, and failure parity

| State/branch | Web reference behavior | Native iOS/Android behavior |
| --- | --- | --- |
| Signed out/session expired | Redirect to login; preserve safe continuation | Deactivate authenticated UI, clear query/app/call state, revoke push best-effort, stop auth refresh, sign out locally, force-remove persisted auth, remove Realtime channels/token, then replace with login once |
| Session restoration | Cookie/session bootstrap plus authenticated-profile preparation before application bootstrap | SecureStore-backed Supabase session, typed `/api/auth/profile` preparation, then `/api/bootstrap`, with stale-user/session guards |
| Unauthorized/forbidden | Deliberate 401/403 and role/not-found UI | Typed `ApiRequestError`, auth reset for 401, role-gated admin and safe messages |
| Offline/provider error | Canonical typed errors retain request ID/code/Retry-After; safe query network/5xx retries are bounded and 4xx/429/mutations are not retried | Same shared retry/backoff policy, offline state, screen recovery, and single-attempt mutations |
| Room QR capability | The Rooms screen creates a capability that is rendered as a QR code and never treats it as a room identifier | The scanner validates the same payload shape before sending it and clears the payload after resolution; the server resolves it and authorizes membership |
| Room membership and messages | Room history and send actions are available only to room members; room messages currently support text only | Native room screens use the same bounded history and idempotent send contract; durable room migration and hosted RPC promotion remain required |
| Room read state | Initial room history reads and the dedicated read endpoint advance a monotonic member cursor | Scoped room hints invalidate the active messages query, room list, and unread bootstrap; hints are not the durable source of state |
| Loading | Route/component skeletons and disabled actions | Screen skeletons/spinners and accessibility busy/disabled states |
| Empty | Rooms, profiles, moderation, and retained legacy surfaces show their own empty states | Equivalent native room and profile empty copy and actions |
| Legacy location/discovery state | Location and nearby routes remain compatibility surfaces and fail closed where disabled | No location permission request, coordinate update, nearby polling, map presence, or meeting detection is mounted in the current room flow; legacy data is preserved |
| Destructive action | Dialog confirmation for delete/block/remove/media | Native Alert/modal confirmation and disabled in-flight actions |
| Validation | Shared body/length/page limits and screen validation | Same API contract plus native form validation |
| Private media | Subscriber-gated display; public projection derives avatar/cover only from approved, visible featured media | Same strict backend entitlement/media policy and validated public-photo DTO; approved-media migration, hosted schema, and runtime proof remain pending |
| Deleted/blocked legacy peer | Hidden/not-found or read-only legacy direct-message history | No current room-flow behavior; retained legacy clients use the safe failure/read-only contract |
| Realtime disconnect/gap | Events are hints; durable API refresh | Room flow uses a private per-user channel for unread and membership hints plus private per-room channels for message hints, followed by bounded API/query invalidation. Legacy DM realtime remains separate; staging/provider reconnect and iOS/Android device proof remain pending |
| Incoming notification/deep link | Browser/app-link route | Expo notification response maps only allowlisted internal routes |
| Reduced motion/accessibility | Semantic controls, focus/contrast styles | Accessibility labels/roles/states, native touch targets, platform back/keyboard conventions |
| Native billing link denied | Not applicable to web checkout | Neutral Premium account explanation with no purchase CTA |
| Native billing link allowed | Canonical HTTPS web Premium page | Native explanatory dialog, cancel/continue, system browser, then backend entitlement refresh on resume |

## Material external and rollout dependencies

- Native outbound web billing remains denied by default until the product owner
  configures platform, region, storefront, and environment eligibility.
- APNs/FCM/Expo credentials, universal/app-link provider configuration, separate
  non-production environments, Supabase Realtime topic authorization policies,
  leaked-password protection, PITR/restore rehearsal, and production telemetry
  require provider-console or deployment actions and are not claimed here.
- The repository-only verification boundary excludes simulators, emulators,
  devices, native binaries, browser UI, store policy review, and store submission.
- Native QR scanning uses Expo Camera and also supports validated manual payload
  entry; camera permission and approved-device scanner behavior remain runtime
  gates.
- `supabase/migrations/20260729235452_durable_workflows.sql` and the
  `/api/internal/outbox` Cron must be rehearsed against an isolated full schema
  baseline and promoted migration-first. In particular, production does not
  expose `send_message_transactional`, so production DM sending correctly
  fails closed until that migration exists. Production was not mutated.
- The authenticated-profile repository/migration path needs hosted promotion
  and isolated staging evidence for new-user, OAuth, refresh, and disabled-user
  transitions before rollout approval.
- Friendship mutation proof requires promotion and real Postgres execution of
  `20260807131003_atomic_friend_request_idempotency.sql`; the separate PATCH
  accept/decline path is in `20260807134834_atomic_friend_response_idempotency.sql`.
  DELETE/block/refund is migration-first in
  `20260807141926_atomic_friend_removal_idempotency.sql` and is repository-coherent
  only: real two-session Postgres concurrency is still required.
- Realtime repository proof depends on
  `20260807132650_push_session_fencing.sql`, which still needs hosted
  promotion, isolated staging, provider, and iOS/Android device evidence.
- Public profile/photo, moderation, and cover repository evidence depends on
  `20260807145740_enforce_approved_profile_media_references.sql`; it remains
  migration-first and release-blocked pending hosted promotion, staging, and
  browser/device proof.
- QR-room repository evidence depends on
  `20260814090000_qr_scoped_chat_rooms.sql` and
  `20260814100000_qr_room_account_erasure.sql`.
  Hosted migration/RPC promotion, staging, multi-session membership and read
  convergence, and browser/device scanner and chat proof remain required.
- Legacy location, nearby, bot, and meeting routes are retained for compatibility
  but the current web and Expo flow does not call them or expose their
  location/presence behavior.
- Display-name edit and cross-account convergence repository evidence depends on
  `20260807221500_enforce_display_name_invariant.sql` and
  `20260807193532_durable_profile_update_fanout.sql`. Their parser and
  plan-fixture checks do not substitute for disposable PostgreSQL execution,
  hosted promotion, authorized staging, multi-account delivery, or browser and
  iOS/Android device proof.
- Admin-report moderation has repository parser, contract, and recovery proof
  only. No hosted moderation write was authorized or performed; real moderator
  roles/sessions, staging, browser and iOS/Android device actions, audit trail,
  and operational/rollback evidence remain release blockers.
- DM read-receipt repository evidence depends on
  `20260807210828_harden_dm_read_receipts.sql`; the PostgreSQL 17 parser and
  plan30 fixture do not substitute for real pgTAP/disposable PostgreSQL,
  hosted migration promotion, staging, multi-session convergence, or browser
  and iOS/Android device proof.
