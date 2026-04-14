# Comprehensive Test Implementation Plan for peek-poke.com

## Implementation Status

**458 tests passing across 44 files** (as of 2026-04-14)

| Phase | Category | Tests | Status |
|-------|----------|-------|--------|
| 0 | Infrastructure (vitest config, mocks, factories) | — | ✅ Done |
| 1 | Pure functions (geo, utils, validation, email, constants, native, image-compression) | ~86 | ✅ Done |
| 2 | Validators (Zod schemas) | ~47 | ✅ Done |
| 3 | Zustand store + selectors | 57 | ✅ Done |
| 4 | Auth helpers | ~26 | ✅ Done |
| 5a | API routes: profile, friends, DM threads/messages/read | 40 | ✅ Done |
| 5b | API routes: coins, stripe, moderation, upload, account-delete | 56 | ✅ Done |
| 6 | Hooks (meeting, presence, realtimeDM, geolocation, auth, nearbyPresence, realtimeSync) | 55 | ✅ Done |
| 7 | Middleware (CSRF, auth redirects, onboarding, deleted accounts) | 19 | ✅ Done |
| 8 | E2E — Playwright smoke tests | ~5 | ❌ TODO |
| 9 | Component interaction tests | ~60 | ✅ Done |
| 10 | Integration / RLS tests | ~20 | ❌ TODO |
| 11 | Global providers (NativeBridge, Preload, AuthBridge) | ~15 | ✅ Done |

### TODO: Phase 8 — E2E (Playwright)
Needs: `npm install -D @playwright/test`, `npx playwright install`, `playwright.config.ts`, running dev server, seeded test user.
Files: `e2e/auth.setup.ts` (login + save cookies), `e2e/smoke.spec.ts` (login/home/profile/messages render).

### TODO: Phase 10 — Integration / RLS
Needs: separate Supabase test project with service role key + anon/user JWTs.
Files: `test/integration/rls-dm.test.ts`, `test/integration/rls-profiles.test.ts`, `test/integration/rpc-roles.test.ts`.

---

## Context

Original plan — ~480 tests across 55 files covering all app features: auth, profiles, friends, DMs, coins, payments, moderation, location, and native bridge. Vitest chosen for native ESM + Next.js 16 compatibility.

## Stack

- **Test Runner**: Vitest + @vitejs/plugin-react
- **Component Testing**: @testing-library/react + @testing-library/jest-dom
- **E2E**: Playwright
- **Environment**: jsdom

---

## File Organization

Co-located `__tests__` directories adjacent to source files:

```
src/lib/__tests__/          — pure functions, validators, auth, stripe-webhook
src/types/__tests__/        — database helper tests
src/stores/__tests__/       — appStore, selectors
src/hooks/__tests__/        — hook tests
src/app/api/__tests__/      — API route handler tests
src/app/__tests__/          — middleware tests
src/components/**/__tests__ — component interaction tests
test/setup.ts               — global test setup
test/mocks/                 — supabase.ts, stripe.ts, next.ts
test/helpers/               — factories.ts
test/integration/           — RLS and integration tests
```

**Naming**: `source-file-name.test.ts`, describe blocks match exported function name, `it('should [behavior] when [condition]')`.

---

## Phase 0: Infrastructure Setup

### Goal
Install deps, config files, mock utilities, npm scripts.

### Dependencies (devDependencies)

```
vitest @vitejs/plugin-react
@testing-library/react @testing-library/jest-dom @testing-library/user-event
jsdom
```

### Files to Create (7 files)

#### 1. `vitest.config.ts`
- plugins: [react()]
- test.globals: true
- test.environment: jsdom
- test.setupFiles: [./test/setup.ts]
- test.include: [src/**/__tests__/**/*.test.ts, src/**/__tests__/**/*.test.tsx]
- resolve.alias: { '@': path.resolve(__dirname, './src') }
- coverage.provider: v8
- coverage.include: src/lib, src/stores, src/hooks, src/app/api, src/types
- Thresholds: statements 70%, branches 60%, functions 70%, lines 70%

#### 2. `test/setup.ts`
Set env vars before imports:
- NEXT_PUBLIC_SUPABASE_URL = https://test.supabase.co
- NEXT_PUBLIC_SUPABASE_ANON_KEY = test-anon-key
- SUPABASE_SERVICE_ROLE_KEY = test-service-role-key
- STRIPE_SECRET_KEY = sk_test_fake
- STRIPE_WEBHOOK_SECRET = whsec_test_fake
- STRIPE_PREMIUM_PRICE_ID = price_test_fake
- NEXT_PUBLIC_APP_URL = http://localhost:3000
- Import @testing-library/jest-dom/vitest

#### 3. `test/mocks/supabase.ts`
- **createMockQueryBuilder(returnData, returnError)**: Chainable builder (select, insert, update, delete, eq, neq, order, limit, single, maybeSingle). Returns `{ data, error }` on terminal calls.
- **createMockSupabaseClient(overrides)**: Full client mock — from(), rpc(), auth (getUser, getSession, signOut, onAuthStateChange), storage (from → upload, getPublicUrl, remove), channel() (on, subscribe, untrack, track, presenceState), removeChannel().
- **mockSupabaseServer(mockClient?)**: Mocks `@/lib/supabase/server` → createClient() async, createServiceClient() sync.
- **mockSupabaseBrowser(mockClient?)**: Mocks `@/lib/supabase/client` → createClient() sync.

#### 4. `test/mocks/stripe.ts`
- **createMockStripe()**: customers.create, checkout.sessions.create, subscriptions.retrieve, webhooks.constructEvent, billingPortal.sessions.create.
- **mockStripeModule()**: Mocks `@/lib/stripe` → stripe export.

#### 5. `test/mocks/next.ts`
- **createNextRequest(url, { method, body, headers, searchParams })**: Creates NextRequest with origin/host headers for CSRF.
- **createFormDataRequest(url, formData, { method, headers })**: NextRequest with FormData for upload route.

#### 6. `test/helpers/factories.ts`
Factory functions (typed, defaults overridable via partial):
- **buildProfile(overrides?)**: Profile with roles: ["user"], onboarding_completed: true
- **buildFriendship(overrides?)**: status: "accepted"
- **buildDMThread(overrides?)**: With participant IDs, preview
- **buildDMMessage(overrides?)**: message_type: "text"
- **buildProfilePhoto(overrides?)**: Valid Supabase URL
- **buildNearbyUser(overrides?)**: NYC coordinates
- **resetFactoryCounter()**: Reset UUID counter

#### 7. Update `package.json` scripts
```json
"test": "vitest run",
"test:watch": "vitest",
"test:coverage": "vitest run --coverage",
"test:ui": "vitest --ui"
```

---

## Phase 1: Pure Function Unit Tests (NO mocks)

**8 test files, ~86 tests**

### 1. `src/lib/__tests__/geo.test.ts` (~12 tests)
Source: `src/lib/geo.ts` → haversineKm(), formatDistance()
- haversineKm: identical coords → 0, NYC→LA ~3944km, London→Paris ~343km, 50m short distance, antipodal ~20015km, commutative, negative coords
- formatDistance: meters for <1km, km for ≥1km, rounding, zero distance

### 2. `src/lib/__tests__/utils.test.ts` (~10 tests)
Source: `src/lib/utils.ts` → cn(), getInitials()
- cn: merge classes, conditionals, Tailwind conflict resolution, empty/null/undefined
- getInitials: 2 chars uppercased, null/undefined/empty → "??", single char

### 3. `src/lib/__tests__/validation.test.ts` (~14 tests)
Source: `src/lib/validation.ts` → isValidUUID(), isValidMediaUrl()
- isValidUUID: valid v4, uppercase, empty, partial, wrong length, invalid chars
- isValidMediaUrl: valid Supabase URL, non-HTTPS, wrong host, empty, malformed, javascript: protocol

### 4. `src/lib/__tests__/email-validation.test.ts` (~25 tests)
Source: `src/lib/email-validation.ts` → validateEmail(), isValidEmailFormat()
- validateEmail: valid email, empty, no @, double @, typo detection (gmial→gmail, gmail.con→gmail, yaho→yahoo, hotmial→hotmail, outlok→outlook, iclod→icloud), disposable blocking (tempmail, yopmail), length limits, normalization, trimming
- isValidEmailFormat: valid/invalid, RFC 5322 special chars

### 5. `src/lib/__tests__/constants.test.ts` (~6 tests)
Source: `src/lib/constants.ts` → getCategoryEmoji()
- Correct emoji per category, unknown → bullet, empty → bullet
- Constants consistency check (MAX_PHOTOS, FREE_USER_FRIEND_LIMIT)

### 6. `src/types/__tests__/database.test.ts` (~8 tests)
Source: `src/types/database.ts` → hasRole(), isPremium()
- hasRole: has role, lacks role, null/undefined profile, empty roles, multiple roles
- isPremium: has "subscriber", lacks "subscriber"

### 7. `src/lib/__tests__/native.test.ts` (~5 tests)
Source: `src/lib/native.ts` -> isNativeApp(), postToNative()
- isNativeApp: true when Bearer token present, false otherwise
- postToNative: calls window.webkit.messageHandlers, no-op when missing

### 8. `src/lib/__tests__/image-compression.test.ts` (~6 tests)
Source: `src/lib/image-compression.ts` -> compressImage(), createThumbnail()
- Compression reduces dimensions/size, preserves aspect ratio
- Thumbnail creation (max 512KB), handles transparent backgrounds

---

## Phase 2: Validator Tests (Zod Schemas)

**1 test file, ~45 tests**

### `src/lib/__tests__/validators.test.ts`
Source: `src/lib/validators.ts`
- **usernameSchema** (~8): valid, <3 chars, >20 chars, spaces, special chars, underscores, numeric
- **profileUpdateSchema** (~8): valid partial, empty obj, display_name >50, bio >500, location_text >100, invalid avatar_url, valid avatar_url, unknown fields rejected
- **friendRequestSchema** (~3): valid UUID, non-UUID, missing field
- **dmThreadCreateSchema** (~2): valid/invalid UUID
- **dmMessageSchema** (~8): valid, empty, >4000 chars, trim, whitespace-only, default type, image type, media_url validation
- **dmMessageEditSchema** (~3): valid, trim, empty/whitespace
- **moderationActionSchema** (~5): approve, reject with reason, reject without reason, invalid action, whitespace-only reason
- **photoUpdateSchema** (~3): valid display_order, boolean is_avatar, non-integer rejected
- **parseBody** (~5): valid JSON, invalid JSON → 400, schema fail → 400, Zod error message, malformed body

---

## Phase 3: Zustand Store Tests

**2 test files, ~55 tests**

### 1. `src/stores/__tests__/appStore.test.ts` (~45 tests)
Source: `src/stores/appStore.ts`
Setup: `beforeEach → useAppStore.getState().clearStore()`
- **Profile** (~4): setProfile, setPhotos, updateStats merge, setStats replace
- **Friends** (~10): setFriends, addFriend (append + increment), removeFriend (remove + decrement + clamp), addSentRequest, addSentRequestFull, removeSentRequest, removeRequest, filter pending deletions, mark/clear deletion pending
- **Messages** (~10): setThreads, setThreadMessages, addMessage (append + dedup), updateMessage (update + no-op), markThreadRead (zero unread + clamp totalUnread), removeThread, clearThreadMessages
- **Coins** (~5): setCoins, addMetFriendId, triggerCoinSpent (flag + count), timer reset after 600ms (vi.useFakeTimers), rapid trigger clears previous timer
- **Blocked users** (~5): setBlockedUsers, addBlockedUser (+ remove friend/thread + decrement), no decrement for non-friend, removeBlockedUser
- **Presence/Location** (~4): setOnlineUsers, setUserLocation, setNearbyUsers, setVisibleUsers
- **clearStore** (~2): resets all, fresh Set instances
- **preloadAll** (~5): sets isPreloading, populates from response, 401 → redirect, failure → preloadError, filters pending deletions

### 2. `src/stores/__tests__/selectors.test.ts` (~10 tests)
Source: `src/stores/selectors.ts` (uses renderHook)
- useProfile, useCoins, useFriends, useThreads, useTotalUnread
- useIsFullyLoaded (true when all 3 flags true, false when any false)
- useIsPremium (subscriber role check)
- useHasRole (specific role match)

---

## Phase 4: Auth Helper Tests (Mock Supabase)

**1 test file, ~26 tests**

### `src/lib/__tests__/auth.test.ts`
Source: `src/lib/auth.ts`
Mocks: `@/lib/supabase/server` → createClient
- **withAuth** (~6): calls handler when authenticated, 401 when not, passes resolved route params, passes empty params when no context, passes supabase client, awaits params promise
- **requireModeratorRole** (~4): null for moderator, null for admin, 403 for neither, correct RPC args
- **verifyThreadParticipant** (~4): returns thread for participant_1/2, null for non-participant, null when missing
- **isBlocked** (~4): true A→B, true B→A, false neither, checks both directions
- **hasSubscriberRole** (~4): true for subscriber, false for non-subscriber, correct RPC call, false when null
- **createClient (Dual-Mode)** (~4): returns Bearer-authenticated client when Authorization header present, returns Cookie-authenticated client when header missing, handled headers() promise resolution

---

## Phase 5: API Route Handler Tests (Mock Supabase + Stripe)

**12 test files, ~95 tests**

Mock strategy: Mock `@/lib/supabase/server`, let withAuth run naturally. Each test creates NextRequest → calls handler → asserts status + JSON.

### 1. `src/app/api/__tests__/profile.test.ts` (~8)
GET: returns profile with roles, 401
PATCH: updates display_name, rejects invalid avatar_url, rejects unknown fields, 400 bad JSON, 500 DB error, 401

### 2. `src/app/api/__tests__/friends.test.ts` (~8)
GET: returns list via RPC, 500
POST: sends request, 400 invalid UUID, 400 missing, RPC error, 500
PATCH/DELETE: accept, unfriend

### 3. `src/app/api/__tests__/dm-threads.test.ts` (~6)
GET: returns threads, 500
POST: creates/finds thread, 400 invalid, RPC error, 500

### 4. `src/app/api/__tests__/dm-messages.test.ts` (~12)
GET: returns conversation, 400 invalid thread
POST: sends message, 400 empty, 400 >4000
PATCH: edit own within 15min, 403 others', 400 expired, 400 deleted
DELETE: soft-delete own, 403 others', 400 already deleted

### 5. `src/app/api/__tests__/dm-read.test.ts` (~5)
POST: marks read, 400 invalid thread, 404 not participant, only other sender's messages, 500

### 6. `src/app/api/__tests__/coins.test.ts` (~4)
GET: returns balance, 500, 401

### 7. `src/app/api/__tests__/coins-meeting.test.ts` (~7)
POST: records meeting + award, already_met, 400 missing friend_id, 400 invalid UUID, RPC error, 500, 401

### 8. `src/app/api/__tests__/stripe-checkout.test.ts` (~8)
POST: creates session, new Stripe customer, existing customer, 400 already premium, 500 missing price, 404 no profile, 500 Stripe error, 401

### 9. `src/app/api/__tests__/stripe-webhook.test.ts` (~12)
POST: 400 missing sig, 400 invalid sig, checkout.session.completed, subscription.updated (active), subscription.updated (canceled), subscription.deleted, invoice.payment_failed, unhandled event
Plus `src/lib/__tests__/stripe-webhook.test.ts` (~8): handler functions for checkout completed, subscription updated/deleted

### 10. `src/app/api/__tests__/moderation.test.ts` (~8)
GET: queue for moderator, 403 non-moderator, default "pending", validate status
PATCH: approve, reject with reason, 400 reject without reason, 400 invalid ID

### 11. `src/app/api/__tests__/upload.test.ts` (~7)
POST: uploads + returns URL, 400 no file, 400 bad type, 400 >2MB, thumbnail upload, 500 storage error, cleanup on thumbnail fail

### 12. `src/app/api/__tests__/account-delete.test.ts` (~4)
POST: soft-delete, sign out, 500, uses service client

---

## Phase 6: Hook Tests

**7 test files, ~55 tests**

Mock strategy: renderHook + mock Supabase browser client, navigator.geolocation, Zustand store.

### 1. `src/hooks/__tests__/useMeetingDetection.test.ts` (~8)
- Calls /api/coins/meeting when friend within 50m, deduplicates per session, allows retry on error

### 2. `src/hooks/__tests__/usePresence.test.ts` (~7)
- Creates channel, tracks on SUBSCRIBED, syncs online IDs, untracks on hidden

### 3. `src/hooks/__tests__/useRealtimeDM.test.ts` (~12 tests)
- getKnownProfile: finds in profile, profileCache, friends, threads
- addMessage on postgres INSERT
- **fetchAndCacheProfile**: triggered on unknown sender, updates message with profile on success
- **auto-mark-read**: calls /api/dm/[id]/read when incoming message thread matches activeThreadId
- **visibilitychange**: refetchThreads throttled to 30s

### 4. `src/hooks/__tests__/useGeolocation.test.ts` (~6)
- watchPosition on mount, clearWatch on unmount, debounces 5s, updates store

### 5. `src/hooks/__tests__/useAuth.test.ts` (~7)
- User from session, fetch profile via API, handles fetchOrCreateProfile failure

### 6. `src/hooks/__tests__/useNearbyPresence.test.ts` (~8 tests)
- Filters users beyond 2km radius (Haversine), syncs online/offline status, handles track/untrack

### 7. `src/hooks/__tests__/useRealtimeSync.test.ts` (~4 tests)
- Orchestrates sub-hooks (DM, Friendships, Profiles), passes correct store actions

---

## Phase 7: Middleware Tests

**1 test file, ~18 tests**

### `src/app/__tests__/middleware.test.ts`
Source: `src/middleware.ts`
- **CSRF** (~5): blocks POST /api/* without origin, skips for Bearer token
- **Unauthenticated** (~4): redirects to /login, preserves redirectTo
- **Onboarding** (~6): redirects based on onboarding_completed status
- **Deleted accounts** (~2): sign out + redirect

---

## Phase 8: E2E Setup (Playwright)

**2 test files, ~5 tests**
- `e2e/auth.setup.ts`: login once, reuse cookies
- `e2e/smoke.spec.ts`: login renders, home loads, profile loads, messages loads

---

## Phase 9: Component Interaction Tests

**8 test files, ~60 tests**

### 1. `src/components/profile/__tests__/ProfilePageClient.test.tsx` (~10)
- Profile data rendering, bio char count (500 limit), photo delete confirmation, interest removal

### 2. `src/components/inbox/__tests__/InboxClient.test.tsx` (~8)
- Tab switching (Chats, Friends, Requests), empty states, thread selection updates store

### 3. `src/components/friends/__tests__/SwipeableFriendCard.test.tsx` (~6)
- Renders friend info, swipe revealed unfriend button, unfriend triggers API + store removal

### 4. `src/components/map/__tests__/MapView.test.tsx` (~12)
- MapLibre instance (mocked), pins at correct coords, cluster click zoom, pin click opens sheet

### 5. `src/components/coins/__tests__/CoinBalance.test.tsx` (~6)
- Balance from store, animation on change, "Insufficient Coins" dialog trigger

### 6. `src/components/messages/__tests__/MessageDeliveryStatus.test.tsx` (~6)
- Sent/Delivered/Read states, checkmark colors, timestamp formatting

### 7. `src/components/profile/__tests__/PhotoGallery.test.tsx` (~6)
- Moderation labels (Pending/Approved/Rejected), private blur for non-premium, avatar indicator

### 8. `src/components/layout/__tests__/Navigation.test.tsx` (~6)
- Active state highlighting, unread badge count from store, mobile/desktop visibility

---

## Phase 10: Integration & RLS Verification

**3 test files, ~20 tests**

### 1. `test/integration/rls-dm.test.ts` (~8)
- User A cannot read User B's DM thread, cannot insert message, can only update/delete own

### 2. `test/integration/rls-profiles.test.ts` (~6)
- Users only update own profile, private photos visibility rules, moderator bypass

### 3. `test/integration/rpc-roles.test.ts` (~6)
- `grant_role` fails for anon/auth keys, succeeds for service_role, `user_has_role` accuracy

---

## Phase 11: Native Bridge & Global Providers

**3 test files, ~15 tests**

### 1. `src/components/__tests__/NativeBridgeProvider.test.tsx` (~5)
- `window.navigateFromNative` injection, navigation to allowed routes, rejection of external URLs

### 2. `src/components/__tests__/PreloadProvider.test.tsx` (~6)
- SplashScreen during load, switches to children on success, global error state handling

### 3. `src/components/__tests__/AuthBridgeProvider.test.tsx` (~4)
- Native auth token sync, handles sign-out signal from native bridge

---

## Summary (Updated)

| Phase | Category | Files | Tests |
|-------|----------|-------|-------|
| 0 | Infrastructure | 7 | 0 |
| 1 | Pure functions | 8 | ~86 |
| 2 | Validators | 1 | ~45 |
| 3 | Zustand store | 2 | ~55 |
| 4 | Auth helpers | 1 | ~26 |
| 5 | API routes | 12 | ~95 |
| 6 | Hooks | 7 | ~55 |
| 7 | Middleware | 1 | ~18 |
| 8 | E2E (outline) | 2 | ~5 |
| 9 | Components | 8 | ~60 |
| 10| Integration/RLS| 3 | ~20 |
| 11| Global Providers| 3 | ~15 |
| **Total** | | **55** | **~480** |

---

## Key Risks and Mitigations

1. **Dual Auth in Middleware**: Verify `getUser()` works for Bearer tokens.
2. **RLS Bypass**: Mocking Supabase in API tests hides RLS bugs; Phase 10 integration tests are mandatory.
3. **Map Complexity**: `jsdom` can't render GL; mock MapLibre events and flyTo calls.
4. **Native Interaction**: `window.location.href` in native bridge needs careful mock to avoid "navigation not implemented" errors in Vitest.
