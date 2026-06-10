# Pre-Production Code Review — Peek & Poke

**Scope:** all `src/app/api/**` routes, `(main)`/`(auth)` pages, `src/hooks`, `src/lib`, `src/stores`, `src/components`, `src/middleware.ts`. iOS Swift, tests, and generated files excluded. Reviewed at commit `4ef95f6` (current `dev`).

**Headline:** the codebase is genuinely well-structured — `withAuth`→authorize→Zod→`apiError` is followed consistently across the DM/profile/friends/moderation surface, IDOR coverage is solid, open-redirect defenses are everywhere, the Stripe webhook verifies signatures correctly, and uploads are properly bounded. The real risks cluster in four places: **the coin feature is broken AND exploitable**, **two SSR/state bugs can leak one user's data into another's session**, **the chat UI loses messages on thread switch and reconnect**, and **two unauthenticated/unvalidated endpoints leak precise location**.

---

## 🔴 Critical — fix before launch

### C1. `StoreHydrator` writes the global Zustand store during SSR → cross-user data leak
`src/components/StoreHydrator.tsx:7-9` (mounted at `src/app/(main)/layout.tsx:27`)

```tsx
useState(() => {
  useAppStore.getState().hydrateFromPreload(data);  // runs during render — on the server too
});
```
`useAppStore` is created with `create()` at module scope, so on the server it's **one store shared by every request in the same Node process** (Vercel Fluid Compute runs concurrent requests per instance). The `useState` initializer fires during render, mutating that shared store. If user B's request skips hydration (`preloadData` is `null` on RPC error — the layout guards with `{preloadData && <StoreHydrator/>}`), B's SSR'd `/profile`, `/inbox`, etc. can render **user A's profile/friends/threads into B's HTML**. Even when both hydrate, interleaved renders cross-contaminate.

**Fix:** never write the global store during render. Either hydrate inside a `useEffect` (client-only), or adopt the per-request store pattern (`createStore` + `useRef` in a context provider, seeded from `preloadData`).

### C2. Map coin collection is dead — GET and POST target different tables
`src/app/api/bots/route.ts:14` (GET reads `admin_coins`) vs `:33` (POST calls `collect_coin_bot`, which the live DB resolves against `coin_bots` with a `user_id = auth.uid()` filter)

A `admin_coins.id` never exists in `coin_bots`, so every collect returns `{ok:false, reason:'not_found'}`. `BotPin.tsx:36` only acts `if (data.ok)`, so the user taps a coin and **nothing happens** — no coin, no error, pin stays. The entire map-coin mechanic is non-functional in production.

**Fix:** point `collect_coin_bot` at `admin_coins` (and settle single- vs per-user collection semantics), or have GET serve `coin_bots`. Surface `reason` to the user instead of silently ignoring `ok:false`. **See H8 — fix the location-trust design at the same time, or you'll ship a working-but-farmable feature.**

---

## 🟠 High

### H1. Chat history vanishes on thread switch — `ChatSheetContent` never remounts
`src/components/sheet/ChatSheetContent.tsx:42,63-70`; mounted without `key` at `src/components/inbox/InboxChatPanel.tsx:17` and `src/app/(main)/chat/[threadId]/page.tsx:14`

`hasSeeded = useRef(false)` is never reset when `threadId` changes, and neither mount site passes `key={threadId}`. Switching threads re-renders the same instance, so thread B's history is never seeded into the store; the UI falls back to `data?.messages` until the first realtime message for B arrives — at which point line 70 (`storeMessages.length > 0 ? storeMessages : data.messages`) flips to the store and **the whole history disappears, leaving only that one message**. The `input`, `replyingTo`, and `editingMessage` state also leaks across threads — a reply drafted in A can submit into B with a thread-A `reply_to_id`.

**Fix:** render `<ChatSheetContent key={threadId} … />` at both call sites.

### H2. Your own sent message only appears via the realtime echo
`src/components/sheet/ChatSheetContent.tsx:70,102-110`

`sendMutation.onSuccess` writes the new message into the React Query cache only, but line 70 prefers `storeMessages` once seeded. So the sender's message renders **only when the Supabase `postgres_changes` INSERT echo arrives**. On iOS the websocket is killed while backgrounded and during reconnect; the message is persisted (API returned 200) but never shows — users resend, creating duplicates.

**Fix:** in `onSuccess`, also call `useAppStore.getState().addMessage(threadId, message)` (it dedupes by id against the echo).

### H3. Stale React Query cache re-seeds the store and deletes newer realtime messages
`src/components/sheet/ChatSheetContent.tsx:51-68` + `src/components/QueryProvider.tsx:12-14`

`["dm-thread", threadId]` runs with `staleTime: 5min` and is **never invalidated** (realtime writes only to Zustand). Open chat A → leave → a message arrives via realtime (`addMessage`) → reopen A within 5 min: the query returns the cached, now-stale list without refetching, and the seed effect calls `setThreadMessages(threadId, data.messages)`, **overwriting the store and deleting the just-received message** from the UI (the thread-list preview still shows it, so the chat looks broken).

**Fix:** merge-by-id when seeding instead of replacing, or set `staleTime: 0` for `dm-thread`, or have `useRealtimeDM` keep the query cache in sync via `setQueryData`.

### H4. Middleware redirects drop refreshed Supabase session cookies → intermittent forced logout
`src/middleware.ts:33-52` (cookies captured into `response`) vs `:68,113,115,120,125,130` (redirects return a fresh `NextResponse.redirect` without those cookies)

`getUser()` (line 54) can rotate tokens into `response`, but every redirect branch builds a new response and discards them. If a refresh coincides with any redirect (hitting `/login` while authed, `/` with incomplete onboarding, etc.), the new refresh token never reaches the browser; the next request replays the consumed token and — outside Supabase's ~10 s reuse window — the token family is revoked and the user is silently logged out.

**Fix:** copy auth cookies onto every redirect: `response.cookies.getAll().forEach(c => redirect.cookies.set(c))`.

### H5. "Minimise call" silently destroys the call without telling the peer
`src/components/call/CallView.tsx:159-167`

The comment says minimise "does NOT end the call," but `onClick={clearCall}` sets `activeCall: null` → unmounts `CallView` → `useWebRTCCall` cleanup runs `pc.close()`, stops tracks, removes the channel — **without broadcasting an `end` signal**. The local user thinks the call continues; the peer's video freezes until ICE eventually fails seconds later.

**Fix:** either make minimise a real hang-up (`endCall`), or hoist the WebRTC session above `CallView` so minimise is UI-only.

### H6. Unauthenticated MCP endpoint leaks every user's exact location + identity
`src/app/api/[transport]/route.ts:300-330,354-382,242-251`

The `nearby_users`/`render_nearby_map` MCP tools call `createServiceClient()` (RLS bypass) with **no `withAuth`, no session, no authz** — and middleware explicitly CSRF-exempts `/api/mcp|sse|message`. Any anonymous caller can invoke them; `radius_km` is attacker-controlled up to 50 km and the response returns **un-rounded** `lat`/`lng` plus `username`/`display_name`/`avatar_url`. The authenticated `/api/nearby` deliberately rounds to 3 decimals precisely because exact location is sensitive — this path leaks it raw.

**Fix:** require an authenticated MCP session before returning user data; at minimum round coordinates as `/api/nearby` does, exclude users not opted into discovery, and cap `radius_km`.

### H7. Public call/ring/typing channels accept unvalidated, spoofable payloads
`src/hooks/useIncomingCall.ts:37`, `src/hooks/useWebRTCCall.ts:213`, `src/hooks/useTypingIndicator.ts:20`

The `calls:user:<id>` / `thread:<id>` channels are **public** Supabase broadcast channels (no `private: true`), and payloads are cast (`payload as RingPayload` / `as SignalingEvent`) with no validation. A crafted `{type:"invite"}` with no `fromUser` reaches `IncomingCallOverlay.tsx:18`, which dereferences `fromUser.display_name` → TypeError that unmounts the app shell mid-ring; `event.threadId` is interpolated unvalidated into a `fetch`; `event.sdp`/`candidate` flow into `new RTCSessionDescription/IceCandidate` guarded only by `callId` equality.

**Fix:** add `ringPayloadSchema`/`signalingEventSchema` discriminated unions to `validators.ts` and `safeParse` every broadcast payload; make the channels private with Realtime RLS.

### H8. Coin economy is farmable — server trusts client-asserted position
`src/app/api/bots/route.ts:28-39` and `src/app/api/coins/meeting/route.ts` (RPC `record_meeting`)

Two related holes: (a) `POST /api/bots` passes the collector's `lat`/`lng` straight from the request body into `collect_coin_bot` — read a coin's exact coords from the GET endpoint, POST them back as your position, always "on" the coin. (b) `record_meeting` checks only that the caller is one of two *accepted friends* — **no distance check** against `user_locations`, so `POST /api/coins/meeting {friend_id}` from anywhere awards both users a coin. Since coins gate friend requests, the economy is trivially scriptable (the 10/min limit and cap of 5 only throttle, not prevent). C2 currently masks (a), but fixing C2 without this exposes it.

**Fix:** never accept position from the client — have both RPCs compute proximity against the server-recorded `user_locations` rows for `auth.uid()`, requiring recency + distance below threshold.

### H9. Blocking does not stop a Premium subscriber from re-opening a thread and DMing the blocker
`src/app/api/dm/threads/route.ts:17-39` + `src/app/api/dm/[threadId]/route.ts:44-47`

`block_user` deletes the friendship and DM threads, but `create_or_find_thread` (verified against the live DB) only checks `are_friends` **or** subscriber role — it never consults `user_blocks`, and neither the threads POST nor the message-send route calls `isBlocked`. So if A blocks B and B has the subscriber role, B can immediately recreate the thread and keep messaging A, and `notifyRecipient` keeps pushing APNs notifications to A. The call route (`dm/[threadId]/call/route.ts:44-47`) already shows the intended pattern (`isBlocked` before invite) — the DM routes are missing it.

**Fix:** add an `isBlocked(supabase, user.id, body.user_id)` gate in the threads POST (and check blocks before sending messages/pushes), or add a `user_blocks` check inside `create_or_find_thread`.

---

## 🟡 Medium

### M1. Meeting-detection threshold is smaller than the coordinate rounding error
`src/app/api/nearby/route.ts:34-35` + `src/hooks/useMeetingDetection.ts:7,63-70`

`/api/nearby` rounds coords to 3 decimals (~69 m worst-case combined error); `useMeetingDetection` then requires `haversineKm(...) <= 0.05` (50 m) on those rounded values. Because rounding is deterministic, two friends at the same spot can permanently read >50 m apart and never earn the coin, while friends ~100 m apart can "meet." **Fix:** raise `MEETING_RADIUS_KM` above the rounding error (≥0.12 km), or detect meetings server-side from precise `user_locations`.

### M2. Preload silently fabricates a coin balance of 5 on RPC failure
`src/app/api/preload/route.ts:22` + `src/lib/preload-server.ts:13-18`

`coinsResult.error` is never checked; any `get_user_coins_data` failure substitutes `{ balance: 5, metFriendIds: [] }`. A premium user with 40 coins sees "5" after a refresh, and the empty `metFriendIds` re-fires `/api/coins/meeting` for every already-met friend. **Fix:** check `coinsResult.error`; fail the preload or return `coins: null` the client treats as "unknown."

### M3. Rejecting an approved avatar photo leaves it live; making a photo private is non-atomic
`src/app/api/moderation/photos/[photoId]/route.ts:34-42` and `src/app/api/profile/photos/[photoId]/route.ts:40-50,85-91`

The moderation reject path sets `approval_status:"rejected"` but never clears `is_avatar`/`profiles.avatar_url`, so a rejected image keeps serving as the avatar everywhere. Separately, setting a photo private nulls `avatar_url` then updates `profile_photos` in two statements — if the second fails the user is left avatar-null but photo-still-public. **Fix:** make both flows single RPCs (the codebase already mandates RPCs for atomic multi-writes — cf. `set_avatar`/`delete_photo`).

### M4. Public profile page flashes the previous user and races out of order
`src/app/(main)/profile/[userId]/page.tsx:39-58`

`loading` is initialized `true` only once; the fetch effect re-runs on `userId` change without resetting `loading`, aborting, or guarding stale responses. Profile A → B shows A's data under B's URL until B lands, and out-of-order responses leave the wrong user permanently displayed. **Fix:** use `useQuery({ queryKey: ["profile", userId] })`, or reset state and ignore stale responses.

### M5. `payment-method-subscribe` expands a field removed from the pinned Stripe API version
`src/app/api/stripe/payment-method-subscribe/route.ts:55-68` + `src/lib/stripe.ts:8`

The client pins `2025-12-15.clover`, but `Invoice.payment_intent` was removed in `2025-03-31.basil`. `expand:["latest_invoice.payment_intent"]` is invalid → the `subscriptions.create` 500s; and `incomplete` (3DS/SCA) subscriptions fall through to `return {success:true}` at line 68, telling the user they're subscribed when no payment confirmed. Latent today (only hosted-checkout has a UI caller) but it ships. **Fix:** expand `latest_invoice.confirmation_secret`, return it for client confirmation, and never return success when `status === "incomplete"`. Also add Zod validation for `paymentMethodId`.

### M6. `/api/nearby` rate limit removed → city-scale user/location harvesting
`src/app/api/nearby/route.ts` (regression in commit `4ef95f6`)

The recent perf commit dropped `enforceRateLimit("nearby")`. The route accepts any `lat`/`lng` and returns nearby users' handles + ~110 m coords; with no limit, an authed attacker grid-scans a whole city to enumerate every active user and their approximate location. The commit's rationale ("auth + Zod protect them") doesn't hold — auth proves *a* user, Zod doesn't bound volume. Unlike `/api/location` (idempotent upsert, lower risk), `/api/nearby` returns fresh enumeration data per call. **Fix:** restore a per-user limit (e.g. 30/60 s) — generous enough for normal map polling, tight enough to block scraping.

### M7. Fire-and-forget pushes without `after()` are dropped on Vercel
`src/app/api/dm/[threadId]/route.ts:71` and `src/app/api/dm/[threadId]/call/route.ts:93`

`void notifyRecipient(...)` starts a profiles query + APNs round trip, then the handler returns; Vercel can freeze the function once the response completes, so the push may never send — intermittently, with no log trace. **Fix:** wrap in `after(() => …)` from `next/server` (or `waitUntil`).

### M8. Send failure silently discards the message; non-OK meeting response blocks the claim
`src/components/sheet/ChatSheetContent.tsx:148-152` and `src/hooks/useMeetingDetection.ts:74-92`

The composer clears `input`/`replyingTo` *before* `mutate` and the mutation has no `onError`, so a 429/network drop loses the typed text with zero feedback. Separately, `useMeetingDetection` does `.then(res => res.json())` without checking `res.ok`, so a 429/500 leaves the friendId in `calledRef` and the coin is never retried that session. **Fix:** add `onError` that restores composer state; in the meeting hook, `if (!res.ok) calledRef.delete(id)` and clear `calledRef` on `userId` change.

### M9. Geolocation `watchPosition` leaks when unmounted mid-await
`src/hooks/useGeolocation.ts:54-73`

If unmount happens while `await Geolocation.watchPosition(...)` is pending, `watchId` is assigned after cleanup and never cleared, and the callback has no `cancelled` check — the watch keeps calling `setUserLocation` forever. React 19 StrictMode hits this every mount in dev. **Fix:** after the await, `if (cancelled) { clearWatch; return }` and guard the callback.

### M10. `clearStore` doesn't fully reset → stale data leaks across accounts
`src/stores/appStore.ts:279-313,527-549`

`clearStore` misses `bots`, `pendingUserId`, `highlightedData`, `coinSpent`. The previous account's bot pins persist into the next login, and a hung `selectUser` fetch leaves `pendingUserId` set forever, permanently dead-ending that pin (line 529 early-returns). `calledRef` in `useMeetingDetection` similarly survives logout. **Fix:** reset all four fields in `clearStore`; add a timeout/abort to the `selectUser` fetch.

### M11. Email/password login discards the preserved `redirectTo` deep link
`src/app/(auth)/actions.ts:77` + `src/app/(auth)/login/page.tsx:42,69`

Middleware sets `?redirectTo=<path>` and OAuth honors it, but `handleSubmit` calls `login(formData)` without it and the action unconditionally `redirect("/")`. Anyone following a push/shared deep link who signs in with email/password lands on the map instead of the destination. **Fix:** thread `redirectTo` (validated via the existing `isValidRedirectPath`) into `login()`.

### M12. Edit message bypasses the 4000-char limit
`src/lib/validators.ts:55-61`

`dmMessageSchema.content` caps at `.max(4000)`, but `dmMessageEditSchema` has only `.min(1)`. Create a 1-char message, PATCH it to megabytes — written verbatim and broadcast over realtime to both participants. **Fix:** add `.max(4000)` to `dmMessageEditSchema`; add `maxLength={4000}` to the composer input.

### M13. Supabase clients are completely untyped — every row/RPC is implicit `any`
`src/lib/supabase/server.ts`, `client.ts`, `src/lib/auth.ts:3`

No `Database` generic is passed anywhere and `src/types/database.ts` is hand-written. Every `.from().select()` / `.rpc()` returns `any`, voiding the "no any" rule on the most important path. Drift already exists: `middleware.ts:81,96` selects `deleted_at`, absent from the hand-written `Profile` type. In `verifyThreadParticipant` (`auth.ts:57-66`) `thread.participant_1_id !== userId` is an unchecked `any` comparison — a column rename silently breaks an **authorization gate**. **Fix:** generate `Database` types and pass them to all three client factories; this also removes the `data as X[]` casts scattered across `useUserSearch`, `useTagSuggestions`, `resolveTagIds`, the MCP route, and `bots`.

### M14. Realtime `payload.new as DMMessage` diverges from the hand-written type
`src/hooks/useRealtimeDM.ts:124,165`

`DMMessage` (`src/types/database.ts:82-97`) declares `reply_to: DMMessageReplySnippet | null` as non-optional, but that field is synthesized by the `get_conversation` RPC, not a DB column. The raw replication row only carries `reply_to_id`, so realtime-inserted messages have `reply_to === undefined` while the type promises `snippet | null`. Today `ChatMessageList` uses a truthy guard (so replies silently render without their preview), but any code that distinguishes `=== null` from a snippet — which the type invites — throws on `msg.reply_to.id`. The UPDATE handler also spreads the entire raw row into the store, leaking unselected/extra columns into objects typed `DMMessage`. **Fix:** define a `DmMessageRow` type for the actual table row and map row → `DMMessage` explicitly (`reply_to: null`), or validate the payload with Zod before `addMessage`/`updateMessage`.

### M15. Untyped preload `res.json()` can throw inside the store and brick the app on the preload screen
`src/stores/appStore.ts:267-268` + `src/lib/preload-server.ts`

`const data: PreloadResponse = await res.json()` trusts a hand-written type over whatever `get_preload` actually returns (an `any` blob). `hydrateFromPreload` immediately dereferences `data.profile.profile`, `data.friends.friends.filter(...)` — any shape drift or partial RPC result throws inside the store action and leaves the app stuck on the preload screen with no recovery. The code already half-distrusts the type (`data.coins?.balance ?? 5`, `sentRequests || []`) for some fields but blindly trusts others. Same family: `fetchAndCacheProfile` (`useRealtimeDM.ts:48-51`) and `useAuth.ts:23-24` cache an `any` into state typed `Profile`. **Fix:** parse with a `preloadResponseSchema` (Zod) once at the fetch boundary and let types flow via `z.infer`.

### M16. Gap-window: initial-fetch seeding overwrites realtime messages that arrived mid-fetch
`src/components/sheet/ChatSheetContent.tsx:63-68`

The global DM channel is always subscribed and `addMessage` appends incoming messages immediately. If a message arrives after the `GET /api/dm/[threadId]` snapshot is taken but before the seed effect runs, `setThreadMessages(threadId, data.messages)` **replaces** the store array and drops that message until the next reload. (Distinct from H3, which is the stale-cache-on-reopen path; this is the first-open race.) **Fix:** merge-by-id when seeding (union of fetched + existing store messages, sorted by `created_at`) instead of replacing — the same merge fix resolves H3.

---

## 🟢 Low (worth a sweep)

| # | Location | Issue | Fix |
|---|----------|-------|-----|
| L1 | `src/middleware.ts:24` | `new URL(origin)` throws on literal `Origin: null` (sandboxed iframes) → 500 instead of 403 | `URL.canParse(origin)` guard |
| L2 | `src/app/api/bots/route.ts:29`, `coins/meeting/route.ts:11`, `dm/[threadId]/call/route.ts:22-29` | bare `request.json()` with no try/catch or Zod; `isNaN(null/[])` is `false` so `null` coords pass; `id` not UUID-checked → 500s | `parseBody` + Zod schema |
| L3 | `src/app/api/friends/requests/route.ts:18-21` | `.error` on both queries unchecked → DB failure returns empty 200, indistinguishable from no-requests | check `.error`, return `apiError(500)` |
| L4 | `src/stores/appStore.ts:455-472,422-428` | `addBlockedUser`/`removeThread` filter the thread but don't subtract its `unread_count` from `totalUnread` → stale tab/app badge | decrement `totalUnread` (clamp ≥0) |
| L5 | `src/hooks/useNearbyPresence.ts:22-34` | leading-edge-only debounce drops the user's final location when they stop moving → stale position to others | schedule a trailing flush |
| L6 | `src/hooks/useWebRTCCall.ts:190-201,336-345`, `useIncomingCall.ts:70-76` | transient ICE `disconnected` treated as terminal (kills calls on network handoff); ring-timeout/cancel doesn't signal an already-accepted callee → stuck "Connecting…" forever | grace timer on `disconnected`; send `end` on the call channel + callee-side handshake timeout |
| L7 | `src/hooks/useAuth.ts:19-29` | every consumer (`ChatSheetContent`, `useProximityToThread`, `ChatsTab`, `FriendsTab`, …) fires its own `POST /api/auth/profile` on mount; opening a chat = 2+ POSTs | lift into one provider or back with a shared React Query key; consumers only use `user.id` |
| L8 | `src/components/admin/tabs/AdminModerationTab.tsx:72-98` | approve only invalidates `["mod-photos","pending"]`, reject invalidates nothing → "Approved"/"Rejected" tabs stale for 5 min | `onSettled: invalidate ["mod-photos"]` |
| L9 | `src/app/invite/[inviterId]/route.ts:8-22` | `inviterId` not UUID-validated; `accept_invite_link` error discarded before redirect | `isValidUUID` guard + check RPC error |
| L10 | `src/lib/rate-limit.ts:12-30` | fails open silently if Redis env is missing — in prod one misconfig disables all remaining limiters with no warning | log/alert (or fail closed for sensitive limiters) when unconfigured in prod |
| L11 | `src/components/inbox/ChatsTab.tsx:12-16` + Finding C1 | SSR'd relative timestamps differ from client at hydration → hydration mismatch/flicker | client-only timestamp render (mooted by fixing C1) |
| L12 | env `!` assertions: `dm/[threadId]/call/route.ts:49`, `typing/route.ts:16`, `supabase/server.ts`, `native-handoff` | missing service-role key → `Authorization: Bearer undefined`, calls "ring forever," failures only `console.error`'d | central `src/lib/env.ts` validating required vars at boot |
| L13 | `src/components/inbox/InboxClient.tsx:24,28` | `searchParams.get("tab") as Tab` — `/inbox?tab=garbage` (incl. native deep links) puts a non-`Tab` value into state; `<Tabs value>` matches no trigger → empty panel | parse against a `TABS` allowlist, fall back to `"chats"` |
| L14 | `src/lib/stripe-webhook.ts:67,94` | `session.subscription as string` assumes never-expanded objects; if expansion is ever enabled, `subscriptions.retrieve(object)` throws → 500 → Stripe retries the event forever | `typeof x === "string" ? x : x.id` |
| L15 | `src/middleware.ts:54,79-98,137` | `profiles` select (+ `getUser()` network call) on **every** matched navigation/RSC prefetch; `pp_onboarded` fast-path cookie is only set by `complete-onboarding`, so pre-existing users and new devices never get it and permanently take the slow branch | set `pp_onboarded` from middleware once DB confirms completion; cache the deleted check |
| L16 | `src/hooks/useWebRTCCall.ts:104-122,442-446` | hanging up before the channel is `SUBSCRIBED` queues the `end` into `pendingSignals`, then `cleanup()` clears it and removes the channel → `end` never delivered, caller rings to the 30s timeout | if not yet subscribed, fall back to `POST /api/dm/<threadId>/call` (`cancel`/`reject`) |
| L17 | `src/components/map/BotPin.tsx:22` | `setTimeout(() => setHint(false), 2000)` never cleared; if the pin unmounts within 2s (coin refill re-render) `setHint` fires after unmount — harmless in React 19 but off-standard | store the id in a ref and clear it in effect cleanup |
| L18 | `src/app/api/location/route.ts` (regression in `4ef95f6`) | same commit removed `enforceRateLimit("location")`; lower impact than M6 since the write is an idempotent upsert keyed by `user_id` (spamming rewrites one row), so it's DB write-amplification rather than exfiltration | acceptable to leave given idempotency, but document the intent or add a generous cap |

---

## Verified clean (checked, no issue)
Async params under Next 16 (`withAuth` awaits `params`, chat page uses `use()`); no server-only code leaking into client bundles; `useSearchParams` properly Suspense-wrapped; `error.tsx`/`reset` wiring on root/`(main)`/inbox/profile; Stripe webhook signature verification + UUID re-validation; upload content-type/size/path bounds; consistent open-redirect allowlists; no `dangerouslySetInnerHTML` or `javascript:` sinks anywhere; `isValidMediaUrl` pins media to the Supabase host; IDOR checks present on every `[threadId]`/`[messageId]`/`[photoId]`/`[friendshipId]` route; `useRealtimeDM`/`useRealtimeFriendships`/`usePresence` channel cleanup and StrictMode guards correct; Zustand selectors use `useShallow` + stable empty refs; `useOptimistic` rollback in friends tabs correct.

---

## Suggested fix order
C1 and C2 first (data leak + dead feature), then H1–H4 (chat correctness + auth stability), then H5–H8 (calls + the location/coin exposure), then the Medium batch. The two coin findings (C2 + H8) should be fixed together, and the chat findings (H1–H3) all live in `ChatSheetContent.tsx` — one focused pass fixes the cluster.

---

## Route → gap table (only routes with a gap)

| Route | Auth | Authz | Validation | Client | Gap |
|---|---|---|---|---|---|
| `GET/POST /api/[transport]` (MCP) | **none** | **none** | Zod (radius only) | **service (RLS bypass)** | Unauth PII + exact-location leak (H6) |
| `POST /api/bots` | withAuth | **none** | **no Zod; `id` not UUID; lat/lng unbounded** | createClient | Coin farming via client-asserted location; no rate limit (C2/H8) |
| `GET /api/bots` | withAuth | n/a | lat/lng `isNaN` only | createClient | Returns exact coin coords (enables H8) |
| `POST /api/nearby` | withAuth | n/a | Zod (coords) | createClient | **Rate limit removed** → harvesting (M6) |
| `POST /api/location` | withAuth | n/a | Zod (coords) | createClient | Rate limit removed (low — idempotent) |
| `POST /api/stripe/payment-method-subscribe` | withAuth | self | **no Zod on `paymentMethodId`** | createClient | Validation gap (M5) |
| `GET /invite/[inviterId]` | self-check | n/a | **`inviterId` not validated; RPC error ignored** | createClient | Robustness (L9) |
