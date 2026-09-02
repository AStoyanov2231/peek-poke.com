# Cross-platform parity matrix

Updated: 2026-08-07

The Next.js product is the functional and visual reference. “Native” means the
single Expo Router application in `apps/native`, with the same TypeScript
implementation exercised for both iOS and Android. Stripe checkout, webhook,
portal creation and platform association files are intentionally
web/backend-only; native may only open the canonical HTTPS Premium page when
the configured platform, region, storefront, and environment policy allows it.

The resumed independent source comparison has closed the bounded native
map-filter, authenticated-profile bootstrap, DM send/media/retry lifecycle,
Realtime session-fencing, friendship response/removal, public profile/media,
nearby/location freshness, meeting lifecycle, display-name edit/fanout,
admin-report moderation, and monotonic DM read-receipt slices at repository
level. This inventory remains in progress: hosted
migrations, staging flows, runtime, deployment, and security approval are not
established by those repository results.

## User-facing route inventory

| Web route and reference | Capability, actions, and branches | iOS counterpart | Android counterpart | Status |
| --- | --- | --- | --- | --- |
| `/welcome` — `src/app/(auth)/welcome/page.tsx` | Redirects to `/login`; it does not render a branded introduction | `apps/native/app/(auth)/welcome.tsx` and login welcome mode | Same Expo route, Android branch covered by static platform tests | Web redirect verified; native behavior remains part of the in-progress parity audit |
| `/login` — `src/features/auth/components/LoginPage.tsx` | Email/password sign-in and sign-up, Google/Apple OAuth, resend confirmation, forgot password, validation, provider and auth errors, invite preservation | `apps/native/app/(auth)/login.tsx` | Same Expo route | Implemented |
| `/auth/callback` — `src/app/auth/callback/route.ts` | OAuth/code exchange and error redirect | `apps/native/app/auth/callback.tsx` | Same Expo route/deep-link scheme | Implemented |
| `/reset-password` — `src/features/auth/components/ResetPasswordPage.tsx` | Recovery-code exchange, password validation/update, success/sign-out, invalid-link error | `apps/native/app/auth/reset-password.tsx` | Same Expo route | Implemented |
| Authenticated root `/` — `src/app/(main)/page.tsx` | Session restoration and route to map/onboarding | `apps/native/app/index.tsx`, `apps/native/app/_layout.tsx` use typed authenticated-profile preparation in the session-bound bootstrap sequence before `/api/bootstrap`, with stale-user guards | Same Expo bootstrap | Repository/migration PASS after the round-63 critic; hosted auth RPC/migration plus staging new-user and OAuth flows remain rollout-blocked |
| `/onboarding` — `src/features/onboarding/components/OnboardingPage.tsx` | Username validation/availability, minimum interest selection, add/remove interests, progress/loading/error, invite continuation | `apps/native/app/onboarding.tsx` | Same Expo route | Implemented |
| `/profile` — `src/features/profile/components/ProfilePageClient.tsx` | View profile; edit canonical display name, bio, and interests; manage cover, avatar, and photos; view stats/Premium and use share/settings. Display-name updates use the shared profile contract and invalidate current projections | `apps/native/app/(app)/profile.tsx` uses `owner-display-name-editor` with terminal profile/search/discovery invalidation after an update; bio/interests retain their dedicated bounded paths | Same Expo route with native pickers, sheets, alerts, and sharing | REPOSITORY PASS / RELEASE BLOCKED: `20260807221500_enforce_display_name_invariant.sql` and `20260807193532_durable_profile_update_fanout.sql` require hosted promotion plus disposable-Postgres, staging, browser, and device proof |
| `/profile/[userId]` — `src/features/profile/components/PublicProfilePage.tsx` | Viewer-aware profile, public/private media gating, interests/stats, friend request, chat, report, block, deleted/unauthorized/not-found/error. Public avatar/cover derive only from approved visible featured media, not stale raw profile strings | `apps/native/app/(app)/profile/[userId].tsx` uses the same strict public-photo/profile DTO and rejects malformed/foreign media before cache commit | Same Expo route | REPOSITORY PASS / RELEASE BLOCKED: `20260807145740_enforce_approved_profile_media_references.sql`, hosted promotion, and browser/device proof are required |
| `/premium` — `src/features/profile/components/PremiumPage.tsx` | Entitlement display/refresh, price, web checkout, web subscription portal, return-from-payment refresh | `apps/native/app/(app)/premium.tsx` displays authoritative backend entitlement; native dialog opens canonical HTTPS page only when policy permits | Same, with independent Android policy branch | Implemented; external store-policy config required |
| `/` map UI — `src/features/map/components/MainMapPage.tsx` | Location permission gate, nearby map/list, search, tags, bots, highlighted users, meeting detection, recenter, loading/empty/error. The web desktop nearby rail applies All/Friends/Online filtering to its rail list and search; the canvas continues to derive from nearby results | `apps/native/app/(app)/map.tsx` exposes an accessible All/Friends/Online menu. The selected filter and normalized search derive native markers, clusters, cards, highlighted user, and selected-cluster members; filter changes clear stale cluster selection | Same Expo route, with static iOS/Android filter and real Pressability coverage | Runtime-free repository PASS for this bounded filter behavior; device gestures, visual comparison, and live location/provider proof remain pending |
| `/friends`, `/messages`, `/inbox` — inbox feature files | Chats, friends, received/sent requests, accept/reject/cancel/remove, online/offline grouping, unread badges, empty/error/loading, destructive confirmation | `apps/native/app/(app)/inbox.tsx`; alias routes `friends.tsx` and `messages.tsx` | Same Expo routes | Implemented |
| `/chat/[threadId]` — chat feature files | Latest bounded history, older cursor pages, send text/media, edit/delete/reply, monotonic read state, typing, unread reconciliation, proximity, call entry, deleted peer, loading/error/retry | `apps/native/app/chat/[threadId].tsx` has top-boundary older-page loading and the shared account/thread-fenced read-receipt lifecycle | Same Expo route; keyboard avoidance/back behavior branches by platform | DM read receipts are `REPOSITORY PASS / RELEASE BLOCKED`; migration promotion, real pgTAP/PostgreSQL, staging, and browser/device proof remain required |
| `/invite/[inviterId]` — `src/features/invites/components/InvitePage.tsx` | Auth-aware invitation acceptance, profile continuation, failure/retry | `apps/native/app/invite/[inviterId].tsx` | Same Expo route and notification/deep-link navigation | Implemented |
| `/admin` — admin feature files | Role-gated photo moderation, report moderation, coin placement/removal, filters, pagination, mutation failures, loading/empty/unauthorized. Report actions own pending state and retain the queue with retry/cancel on failure | `apps/native/app/(app)/admin.tsx` uses the same strict report action/result contract with real accessible controls | Same Expo route | Admin reports are `REPOSITORY PASS / RELEASE BLOCKED`; no hosted moderation write, moderator runtime, staging, or device/browser proof is claimed |
| Global/main error and loading boundaries | Main error recovery, inbox error, profile loading/error, admin loading, retry | Expo Router error boundary in `apps/native/app/_layout.tsx`, `RouteErrorRecovery`, screen skeleton/error states | Same native boundary | Implemented |

## API/action inventory

All native durable business calls below use `apps/native/src/lib/api.ts` and the
versioned Next.js API. Native calls Supabase directly only for Auth session
management and private Realtime Broadcast/signaling.

| API route | Web behavior | Native behavior | Scope/status |
| --- | --- | --- | --- |
| `GET /api/bootstrap` | Minimal identity, onboarding, roles, config version, unread summary | Session/bootstrap routing and query seed | Shared |
| `GET/PATCH /api/profile` | Current profile read/edit; canonical nullable display name and transactional profile-update source event | Profile/onboarding read/edit; native terminal update invalidates profile/search/discovery projections | REPOSITORY PASS / RELEASE BLOCKED: display-name invariant and durable fanout migrations are local-only; hosted/Postgres/staging/device proof remains required |
| `GET /api/profile/[userId]` | Viewer-aware profile | Public profile/map preview | Shared |
| `PATCH /api/profile/username` | Username update | Onboarding username update | Shared |
| `POST /api/profile/complete-onboarding` | Complete onboarding | Complete onboarding | Shared |
| `GET/POST /api/profile/interests` | Read/add interests | Onboarding/profile interests | Shared |
| `DELETE /api/profile/interests/[interestId]` | Remove by profile-interest record ID | Same record-ID contract | Shared |
| `GET/POST /api/profile/photos` | Bounded list/upload metadata | Profile media list/upload | Shared |
| `PATCH/DELETE /api/profile/photos/[photoId]` | Reorder/avatar/privacy/delete | Same actions through native dialogs | Shared |
| `POST /api/profile/cover` | Upload cover | Native image picker then backend upload | Shared |
| `POST/DELETE /api/profile/push-token` | Browser/provider registration where applicable | Expo device registration/revocation | Shared; provider config external |
| `GET /api/interests` | Interest catalog | Onboarding/profile catalog | Shared/cached |
| `POST /api/upload` | Backend-authorized media upload | Chat/profile upload; no direct native Storage API | Shared |
| `POST /api/account/delete` | Disable-first destructive confirmation, global session revocation, transactional erasure/cleanup queue, retryable provider cleanup | Native settings confirmation and the same backend workflow | Shared; migration and worker promotion required before production activation |
| `GET/POST /api/friends` | Viewer-bound, peer-unique bounded reads and strict request-creation DTO. POST uses the migration-first `send_friend_request_idempotent` path and hashes/retains an attempt for ambiguous RPC 503 replay while clearing deterministic failures | Inbox/map/profile data through the same validated read/create contracts | Repository implementation only: real Postgres concurrency execution and hosted migration promotion remain unproven, so this is not a release pass |
| `GET /api/friends/requests` | Direction-bound, peer-unique received/sent pages | Inbox received/sent requests with identical validation | Shared |
| `PATCH/DELETE /api/friends/[friendshipId]` | PATCH accept/decline uses `respond_friend_request_idempotent` with transactional friend-limit enforcement and bounded abuse-limiter parsing. DELETE/block removal uses a migration-first durable refund design with immutable requester ownership | Native action dialogs use the same validated response/attempt contracts | Repository-coherent / RELEASE BLOCKED: real two-session Postgres removal/refund races, hosted migration, staging, and runtime proof remain unexecuted |
| `GET /api/invites` and `POST /api/invites/[inviterId]` | Secure origin-bound link creation and exact token-bound acceptance | Native share/deep-link accept through identical validated, no-store contracts | Shared |
| `POST/DELETE /api/users/[userId]/block` | Block/unblock backend capability; current profile UI exposes block | Native public-profile block; no extra native-only behavior invented | Parity with current web UI |
| `POST /api/users/[userId]/report` | Categorized report | Native category/reason alert flow | Shared |
| `POST /api/location` | Foreground location update | Foreground/map-only coalesced update; acknowledgement freshness is session-bound, retained-coordinate fenced, and expires through bounded clock-safe recovery | REPOSITORY PASS / RELEASE BLOCKED: live permission/location, hosted `user_locations` RLS/security, staging, and device/browser evidence are not claimed |
| `POST /api/nearby` | Bounded nearby discovery through server-only `nearby_users_for_user` | Focused map query only; shared acknowledgement freshness uses an 8-minute client TTL inside the 10-minute server window | REPOSITORY PASS / RELEASE BLOCKED: `20260807182907_bounded_nearby_discovery.sql` and its RPC are not hosted; staging, live map, and deployment evidence remain required |
| `GET /api/search/tags` | Tag suggestions | Native map search suggestions | Shared |
| `POST /api/search/tags/resolve` | Resolve selected tags | Native filter resolution | Shared |
| `POST /api/search/users` | Strict body/query/result contract with bounded cursor headers | Native map search with identical request and response validation | Shared |
| `GET/POST /api/bots` | Strict max-50 unique list and discriminated collection/recovery contract | Native map uses the same validated commit policy for balance/removal/refetch | Shared |
| `GET /api/coins`, `POST /api/coins/meeting` | Strict balance and discriminated meeting-result DTOs with canonical errors. POST uses the migration-first `record_meeting_idempotent` contract, request hash/key replay, and canonical terminal outcomes | Web meeting consumers use one owned epoch-fenced attempt; native meeting/detection/action consumers use the same terminal/replay, remount, auth, Realtime, initializer, and unauthorized-recovery fences | REPOSITORY PASS / RELEASE BLOCKED after the round-97 critic: `20260807190000_idempotent_coin_meetings.sql`, durable-workflow prerequisites, hosted RPCs, multi-device award behavior, and browser/device runtime proof remain absent |
| `GET/POST /api/dm/threads` | Strict viewer-bound inbox/unread pages plus privacy-safe, target-bound create/find | Native inbox/profile/map uses the same validated read and single-flight mutation contracts | Shared |
| `GET/POST /api/dm/[threadId]` | Newest-first bounded database history with stable older cursor. POST validates owner-bound media, retains one pending client/idempotency key across manual retry until terminal cleanup, and only calls the transactional send RPC; an absent RPC returns retryable `MESSAGE_SEND_UNAVAILABLE` with no legacy fallback | Web and native use the same pending-attempt lifecycle and load older pages from the cursor API | Repository PASS after the round-64 critic; production sending remains FAIL / BLOCKED because hosted `send_message_transactional` is absent and mounted browser/device/authenticated runtime proof is still required |
| `PATCH/DELETE /api/dm/[threadId]/[messageId]` | Edit/delete | Native long-press edit/delete | Shared |
| `POST /api/dm/[threadId]/read` | Strict, monotonic read cursor/state via the server-owned durable sequence; inactive/stale attempts do not commit | Native active-chat read state uses the same coordinator, no-op suppression, stale fences, and canonical backfill/fallback behavior | REPOSITORY PASS / RELEASE BLOCKED: `20260807210828_harden_dm_read_receipts.sql`, PostgreSQL 17 parser/plan30 fixture, and runtime-free tests only; real pgTAP/Postgres, staging, browser/device, and hosted proof are absent |
| `POST /api/dm/[threadId]/typing` | Private expiring typing hint and visible peer state | Native private expiring typing hint and visible peer state | Shared Realtime hint |
| `POST /api/dm/[threadId]/call` | Membership-authorized signaling | Native incoming/outgoing call signaling | Shared private Broadcast |
| `GET /api/webrtc/ice-servers` | Web call ICE credentials | Native call ICE credentials | Shared |
| `GET /api/billing/entitlements` | Backend-authoritative roles/subscription | Backend-authoritative native Premium state and foreground refresh | Shared |
| `GET /api/stripe/price` | Price display | Native informational price display | Shared read |
| `POST /api/stripe/checkout` | Web checkout | Not called by native | Web-only by policy |
| `POST /api/stripe/portal` | Web billing portal | Not called by native | Web-only by policy |
| `POST /api/stripe/webhook` | Stripe receipt/projection | No client caller | Backend-only |
| `GET /api/internal/outbox` | Secret-authenticated bounded worker for message/push, call push, billing audit, and deletion cleanup events | No client caller | Backend-only; no scheduler configured in source control |
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
| Meeting action lifecycle | Web action is bound to one current user/peer epoch and commits a terminal/replayed result only through its owner | Native action/detection consumers use the same remount-stable registry, auth/Realtime/initializer fencing, capped-wallet repeat handling, and unauthorized `ErrorRecovery` cleanup; repository proof only |
| Loading | Route/component skeletons and disabled actions | Screen skeletons/spinners and accessibility busy/disabled states |
| Empty | Map, chats, friends, requests, moderation empty messages | Equivalent native empty copy and actions |
| Location not determined | Location gate/request | Native permission request state; no nearby acknowledgement is fresh until a session-bound location update succeeds |
| Location denied/restricted | Permission explanation/retry | Native denied/error explanation without background polling; stale retained coordinates are fenced and cannot satisfy discovery freshness |
| Destructive action | Dialog confirmation for delete/block/remove/media | Native Alert/modal confirmation and disabled in-flight actions |
| Validation | Shared body/length/page limits and screen validation | Same API contract plus native form validation |
| Private media | Subscriber-gated display; public projection derives avatar/cover only from approved, visible featured media | Same strict backend entitlement/media policy and validated public-photo DTO | REPOSITORY PASS / RELEASE BLOCKED: approved-media migration, hosted schema, and runtime proof are pending |
| Deleted/blocked peer | Hidden/not-found or read-only history | Same safe failure/read-only chat behavior |
| Realtime disconnect/gap | Events are hints; durable API refresh | One private per-user channel carries message and friendship hints; each is coalesced into bounded API/query backfill on subscribe, reconnect, and foreground. Session-fenced and bounded push-permission lifecycle behavior passed the final repository legacy-fence critic | Repository PASS only: `20260807132650_push_session_fencing.sql` is not hosted, and staging/provider token-refresh/reconnect plus iOS/Android device proof remain pending |
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
- Interactive Mapbox markers now use `MarkerView` with real React Native
  `Pressable` semantics, and a visible native action sheet exposes equivalent
  cluster, user, and coin actions to assistive technology. Runtime-free Jest/Expo
  projects verify iOS/Android Pressability and 44pt/48dp geometry; approved-device
  VoiceOver/TalkBack traversal and OS gesture dispatch remain unverified.
- `supabase/migrations/20260729235452_durable_workflows.sql` and the
  `/api/internal/outbox` worker must be rehearsed against an isolated full
  schema baseline and promoted migration-first. In particular, production does not
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
- Nearby/location repository evidence depends on
  `20260807182907_bounded_nearby_discovery.sql`, including the server-only
  `nearby_users_for_user` RPC. It remains release-blocked pending hosted RPC and
  migration promotion, location RLS/security, staging, live permission, and
  browser/device map behavior evidence.
- Meeting lifecycle repository evidence depends on
  `20260807190000_idempotent_coin_meetings.sql` and the durable-workflow
  prerequisites it checks. It remains release-blocked pending hosted migration
  and RPC promotion, staging, real multi-device award behavior, and
  browser/device runtime proof.
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
