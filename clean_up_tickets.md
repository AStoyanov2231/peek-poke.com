# Cleanup Tickets For iOS Native/Web/Server Sync

These tickets are split so another agent can take them one at a time. Start with the low-risk deletions, then simplify auth, then address map and location privacy.

## Ticket 1: Delete unused native `APIClient`

Priority: High

Problem:

`ios/App/App/Native/APIClient.swift` defines a native bearer-token API layer for `/api/profile/:id` and `/api/coins`, but it appears unused. Keeping it creates a second server communication path next to the WebView/Next.js path.

Files:

- `ios/App/App/Native/APIClient.swift`
- `ios/App/App.xcodeproj/project.pbxproj`

Implementation:

- Confirm there are no references to `APIClient`, `ProfileResponse`, `CoinsResponse`, or `APIError`.
- Remove `APIClient.swift`.
- Remove the file from the Xcode project.

Acceptance criteria:

- `rg "APIClient|ProfileResponse|CoinsResponse|APIError"` returns no app-code references.
- iOS project still opens/builds past project-file parsing.

## Ticket 2: Delete unused native `PresenceManager`

Priority: High

Problem:

`PresenceManager.swift` duplicates web `useNearbyPresence` by subscribing to `user-locations`, tracking location, and computing nearby users in native. It does not appear to feed the current UI, which gets nearby users from the WebView/Zustand state.

Files:

- `ios/App/App/Native/PresenceManager.swift`
- `ios/App/App.xcodeproj/project.pbxproj`

Implementation:

- Confirm there are no live references to `PresenceManager` or native `NearbyUser`.
- Remove `PresenceManager.swift`.
- Remove the file from the Xcode project.

Acceptance criteria:

- `rg "PresenceManager|NearbyUser" ios/App/App` returns no stale references, except unrelated web type names outside native.
- Native map still receives pins from `NativeMapBridge`.

## Ticket 3: Remove native Supabase runtime if no native feature remains

Priority: High

Problem:

`SupabaseClient.swift` creates a native Supabase session and realtime auth layer. After deleting `APIClient` and `PresenceManager`, its only likely purpose is native token refresh, which duplicates web/Supabase cookie refresh.

Files:

- `ios/App/App/Native/SupabaseClient.swift`
- `ios/App/App/Native/NativeAuthCoordinator.swift`
- `ios/App/App.xcodeproj/project.pbxproj`
- `ios/App/CapApp-SPM/Package.swift`

Implementation:

- Remove `SupabaseService` if nothing native needs `SupabaseClient`.
- Remove native Supabase package dependency if unused.
- Simplify `NativeAuthCoordinator` so it only returns stored tokens or reports missing session.
- Keep `/auth/native-handoff` as the cold-launch cookie minting path.

Acceptance criteria:

- `rg "SupabaseService|import Supabase|SupabaseClient" ios/App/App` returns no stale references.
- Native app can still show login when no Keychain token exists.
- Native app can still hand off Keychain tokens to `/auth/native-handoff` on cold launch.

## Ticket 4: Make native auth storage atomic

Priority: High

Problem:

`AuthStore` publishes `accessToken`, `refreshToken`, and `expiresAt` separately. Consumers can observe a new access token with a stale refresh token.

Files:

- `ios/App/App/Native/AuthStore.swift`
- `ios/App/App/Native/NativeAuthCoordinator.swift`
- `ios/App/App/Plugins/PeekPokeBridgePlugin.swift`
- any Swift files reading `AuthStore.shared.accessToken`, `refreshToken`, or `expiresAt`

Implementation:

- Introduce one `AuthSession` value containing `accessToken`, `refreshToken`, and `expiresAt`.
- Replace split published fields with `@Published private(set) var session: AuthSession?`.
- Keep `isAuthenticated` derived from `session != nil`.
- Mark `AuthStore` `@MainActor` if all reads/writes are UI/session-facing.
- Update bridge `getAuth` and `setAuth` to read/write the atomic session.

Acceptance criteria:

- No code reads token fields separately from `AuthStore`.
- One update call changes the entire session.
- Sign-in, cold launch, and sign-out paths still change authenticated state correctly.

## Ticket 5: Stop generic null web sessions from clearing Keychain

Priority: Critical

Problem:

`AuthBridgeProvider` calls `PeekPokeBridge.clearAuth()` whenever a WebView sees no Supabase session. With multiple warmed WebViews, a hidden or redirected WebView can wipe the global native Keychain.

Files:

- `src/components/AuthBridgeProvider.tsx`
- sign-out/account-delete code paths
- `src/lib/peekpoke-bridge.ts`
- `ios/App/App/Plugins/PeekPokeBridgePlugin.swift`

Implementation:

- Remove generic `clearAuth()` from `syncSession(null)`.
- Call `clearAuth()` only from explicit sign-out/account deletion flows.
- Optionally change bridge API to `clearAuth({ reason: "signout" | "account_delete" })`.
- Ensure failed handoff routes the user to login without clearing Keychain unless refresh is explicitly invalid.

Acceptance criteria:

- Hidden WebViews cannot clear native auth just because their local session is null.
- Explicit sign-out still clears cookies, app store, and native Keychain.
- Cold launch with valid Keychain token still mints WebView cookies.

## Ticket 6: Remove dead `refreshNeeded` bridge path

Priority: Medium

Problem:

The bridge defines and listens for `refreshNeeded`, but the Swift code does not appear to emit it. The app already has web refresh and native refresh paths, so this is dead protocol surface.

Files:

- `src/lib/peekpoke-bridge.ts`
- `src/components/NativeBridgeProvider.tsx`
- `ios/App/App/Plugins/PeekPokeBridgePlugin.swift`
- `ios/App/App/Native/SharedBridgeViewController.swift`

Implementation:

- Remove `RefreshNeededEvent` and `refreshNeeded` listener from TypeScript.
- Remove `notifyRefreshNeeded()` from Swift if unused.
- Remove comments that describe native API 401 refresh through this event.

Acceptance criteria:

- `rg "refreshNeeded|notifyRefreshNeeded|RefreshNeededEvent"` returns no stale references.
- Auth refresh behavior is documented as web-owned or cold-launch handoff-owned.

## Ticket 7: Remove no-op `setLastRoute` bridge path

Priority: Medium

Problem:

`NativeBridgeProvider` calls `setLastRoute` on route changes, but `RootTabBarController.setLastRoute` is a no-op because each WebView keeps its own state.

Files:

- `src/components/NativeBridgeProvider.tsx`
- `src/lib/peekpoke-bridge.ts`
- `ios/App/App/Plugins/PeekPokeBridgePlugin.swift`
- `ios/App/App/Native/RootTabBarController.swift`

Implementation:

- Delete `routeToTab`.
- Delete the route effect calling `PeekPokeBridge.setLastRoute`.
- Remove `setLastRoute` from bridge type/plugin methods.
- Remove no-op Swift method.

Acceptance criteria:

- `rg "setLastRoute|routeToTab"` returns no stale references.
- Native tab switching behavior is unchanged.

## Ticket 8: Consolidate native splash readiness

Priority: Medium

Problem:

`NativeBridgeProvider` and `AuthBridgeProvider` both hide the Capacitor splash. Swift `notifyReady` resolves but does nothing.

Files:

- `src/components/NativeBridgeProvider.tsx`
- `src/components/AuthBridgeProvider.tsx`
- `src/lib/peekpoke-bridge.ts`
- `ios/App/App/Plugins/PeekPokeBridgePlugin.swift`

Implementation:

- Pick one owner for `SplashScreen.hide`.
- Prefer one provider that hides splash after first route mount and initial store/session check.
- Remove `notifyReady` from bridge if native does not use it.

Acceptance criteria:

- `SplashScreen.hide` is called from one place.
- `notifyReady` is either meaningful or deleted.
- App does not show a double fade or premature blank screen.

## Ticket 9: Do not warm hidden admin WebView for non-admin users

Priority: Medium

Problem:

`RootTabBarController` creates and warms `adminBridgeVC` before role visibility is known. Hidden `/admin` loads can trigger redirects/session events and unnecessary work.

Files:

- `ios/App/App/Native/RootTabBarController.swift`
- possibly `src/components/AuthBridgeProvider.tsx`

Implementation:

- Make `adminBridgeVC` lazy or optional.
- Instantiate/warm it only after `setRole({ isAdmin: true })`.
- Destroy it or remove it from tabs when role becomes false.

Acceptance criteria:

- Non-admin startup does not load `/admin`.
- Admin tab appears after role sync.
- Switching roles does not crash or leave selectedIndex invalid.

## Ticket 10: Emit exact native map bounds

Priority: Medium

Problem:

Native Mapbox emits camera center/zoom but not exact visible bounds. Web computes approximate bounds in `NativeMapBridge`, which can produce wrong visible users and clusters.

Files:

- `ios/App/App/Native/MapTabViewController.swift`
- `src/lib/peekpoke-bridge.ts`
- `src/components/map/NativeMapBridge.tsx`

Implementation:

- Add exact visible bounds to the `mapCameraChanged` event from native Mapbox.
- Extend `MapCameraChangedEvent` with `bounds: [west, south, east, north]`.
- Replace `boundsFromCamera(...)` usage with native-provided bounds once available.
- Keep fallback only for pre-first-camera event if needed.

Acceptance criteria:

- `NativeMapBridge` uses exact native bounds for `setVisibleUsers` and clustering.
- Pitched/rotated map views produce correct visible user lists.
- Existing pin tap and recenter behavior still works.

## Ticket 11: Reduce native map bridge payload churn

Priority: Low

Problem:

Web recomputes clusters, serializes every pin, and native recreates all annotations whenever dependencies change. This is expensive and duplicates map logic.

Files:

- `src/components/map/NativeMapBridge.tsx`
- `ios/App/App/Native/MapTabViewController.swift`
- `ios/App/App/Native/MapTabAnnotations.swift`
- `src/lib/peekpoke-bridge.ts`

Implementation:

- After Ticket 10, consider moving clustering into native.
- Send raw nearby user/bot data plus selected/highlighted state to native.
- Let native own viewport filtering, clustering, and annotation diffing.
- Add basic diffing so unchanged annotations are not recreated.

Acceptance criteria:

- Bridge traffic shrinks during camera movement.
- Native annotations update incrementally where possible.
- Visual behavior matches current map pins, clusters, highlighted user, and bot pins.

## Ticket 12: Replace exact-location realtime presence with server-mediated nearby discovery

Priority: Critical

Problem:

`useNearbyPresence` publishes exact `lat`/`lng` to a global `user-locations` presence channel and filters nearby users locally. This leaks more location data than the product needs.

Files:

- `src/hooks/useNearbyPresence.ts`
- `src/hooks/useGeolocation.ts`
- `src/components/PreloadProvider.tsx`
- new or existing API/RPC route for nearby users
- Supabase SQL/RLS artifacts if available

Implementation:

- Add a server endpoint or RPC that accepts current location and returns only authorized nearby profiles.
- Store/update current user location server-side with appropriate precision and expiry.
- Return coarsened coordinates unless exact pin placement is required.
- Keep online presence separate from exact location.
- Remove or limit the global `user-locations` realtime channel.

Acceptance criteria:

- Clients no longer receive all users' exact presence coordinates through one global channel.
- Map still gets nearby users within the intended radius.
- Meeting detection still works or is moved server-side.

## Ticket 13: Document final bridge contract

Priority: Low

Problem:

The bridge currently contains old methods, dead comments, and unclear ownership. Future agents will add more sync paths unless the contract is explicit.

Files:

- `project_overview.md`
- `CLAUDE.md` if repo-specific agent instructions should mention it
- `src/lib/peekpoke-bridge.ts`
- `ios/App/App/Plugins/PeekPokeBridgePlugin.swift`

Implementation:

- Add a short "Native/Web contract" section.
- List what native owns and what web/server owns.
- List the remaining bridge methods and event directions.
- Explicitly say native should not add Supabase data/realtime clients unless a native-only feature needs it.

Acceptance criteria:

- New agents can understand the sync model without reading every Swift and TS bridge file.
- Bridge type definitions and Swift plugin methods match the documented contract.

## Suggested Execution Order

1. Ticket 1: Delete unused native `APIClient`.
2. Ticket 2: Delete unused native `PresenceManager`.
3. Ticket 6: Remove dead `refreshNeeded`.
4. Ticket 7: Remove no-op `setLastRoute`.
5. Ticket 8: Consolidate splash readiness.
6. Ticket 5: Stop generic null sessions from clearing Keychain.
7. Ticket 4: Make native auth storage atomic.
8. Ticket 3: Remove native Supabase runtime if still unused.
9. Ticket 9: Do not warm hidden admin WebView.
10. Ticket 10: Emit exact native map bounds.
11. Ticket 11: Reduce native map bridge payload churn.
12. Ticket 12: Replace exact-location realtime presence.
13. Ticket 13: Document final bridge contract.

