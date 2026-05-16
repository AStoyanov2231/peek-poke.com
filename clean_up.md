# iOS Native/Web/Server Communication Cleanup

## Conclusion

The current hybrid app works by accident more than by design. The communication model is too wide: auth, location, presence, map pins, camera state, route state, badges, and refresh events all cross the native/web boundary separately. Several of those paths are dead or duplicated.

The clean direction is:

1. Keep Supabase data ownership in Next.js/WebView.
2. Keep native iOS ownership limited to Keychain token storage, tab shell, push/badges, and Mapbox rendering.
3. Use one small Capacitor bridge only for shell events and native-map render commands.
4. Remove native Supabase realtime/data-fetching unless a native screen truly consumes it.

That would reduce code size and remove most token/session race conditions.

## Current Communication Map

- Web auth session is cookie-based through `@supabase/ssr`.
- Native auth session is Keychain-based in `AuthStore`.
- Web writes tokens to native through `PeekPokeBridge.setAuth`.
- Native cold launch asks web to mint cookies through `/auth/native-handoff`.
- Server API routes can authenticate by cookies or by native `Authorization: Bearer ...`.
- Web computes presence, nearby users, clusters, pins, and visible users.
- Native Mapbox only renders pins/camera and sends camera/pin-tap events back.

That split is mostly correct. The bug is that the code also contains a second native Supabase client, a native presence manager, a native API client, and unused refresh/route bridge events. Those create extra state machines without adding current product behavior.

## Bugs And Flaws

### 1. Native Supabase client duplicates web/server state

`ios/App/App/Native/SupabaseClient.swift` maintains a full Supabase session and realtime auth from `AuthStore` even though the actual app data flow is already handled by Next.js/WebView.

Evidence:

- `SupabaseService` creates its own `SupabaseClient` and listens to `AuthStore.shared.$accessToken`.
- `PresenceManager` uses that client for a native `user-locations` realtime channel.
- `APIClient` uses native bearer-token requests to Next.js.

Problem:

This creates three auth sources: WebView cookies, Keychain tokens, and native Supabase session. They can drift independently. It also increases code size and adds refresh logic that is hard to reason about.

Cleanup:

Remove native Supabase as a default runtime dependency. Keep native auth as a token vault only. Let the WebView talk to Supabase/Next.js and let `/auth/native-handoff` mint cookies from Keychain tokens when needed.

Files to delete or heavily reduce:

- `ios/App/App/Native/SupabaseClient.swift`
- `ios/App/App/Native/PresenceManager.swift`
- `ios/App/App/Native/APIClient.swift`

### 2. `APIClient.swift` appears unused

`APIClient` defines native fetches for `/api/profile/:id` and `/api/coins`, handles bearer tokens, and refreshes on 401. I found no call sites outside its own file.

Problem:

This is dead code plus a second API/auth path. It also hardcodes `AppConfig.webOrigin`, which is brittle for staging, preview, or non-`www` production domains.

Cleanup:

Delete `APIClient.swift` unless there is a planned native-only screen that needs it. If native screens later need server data, prefer one typed endpoint and one small native HTTP client, not a full parallel data layer.

### 3. `PresenceManager.swift` duplicates `useNearbyPresence` and is not wired into the UI

Web already tracks location and nearby presence through:

- `useGeolocation`
- `useNearbyPresence`
- Zustand `nearbyUsers`
- `NativeMapBridge.setMapPins`

Native also has `PresenceManager`, which subscribes to the same `user-locations` channel and computes nearby users, but there is no evidence it feeds the map or app store.

Problem:

The app has two implementations of the same location/presence protocol. If both ever run, users can publish two different presence payloads. If only web runs, the native code is dead.

Cleanup:

Delete native `PresenceManager` and keep presence in web/server for now. Longer-term, replace global client-side presence with a server-mediated nearby API or RPC so exact location is not broadcast to every subscribed client.

### 4. AuthStore publishes token fields separately, which can race

`AuthStore.update` writes three separate `@Published` properties inside one async main-queue block:

- `accessToken`
- `refreshToken`
- `expiresAt`

`SupabaseService` subscribes only to `$accessToken` and reads `AuthStore.shared.refreshToken` separately.

Problem:

That can observe a new access token with an old or nil refresh token. It is a classic split-state race. `NativeAuthCoordinator` also reads `AuthStore.shared.accessToken`, `refreshToken`, and `expiresAt` from an actor without `AuthStore` being `@MainActor` isolated.

Cleanup:

Replace the three published fields with one value:

```swift
struct AuthSession {
    let accessToken: String
    let refreshToken: String
    let expiresAt: Date?
}
```

Publish `session: AuthSession?` atomically, and mark `AuthStore` as `@MainActor`. If native Supabase is removed, most of this race disappears.

### 5. Every WebView can clear the global native Keychain

`AuthBridgeProvider` calls `PeekPokeBridge.clearAuth()` whenever its Supabase session is null. In the tab architecture, several WebViews are loaded/warmed independently.

Problem:

A transient null session, redirected admin WebView, stale cookie state, or tab-specific auth event can wipe the global native Keychain for the entire app. The global Keychain should not be cleared by every WebView instance independently.

Cleanup:

Only clear Keychain on explicit sign-out/account deletion, not on generic `getSession() === null` in any WebView. Token sync should be handled by one owner, ideally a single mounted provider in the active authenticated shell.

### 6. Native refresh bridge is half-dead

The bridge advertises and listens for `refreshNeeded`, but the native refresh path currently refreshes directly through `NativeAuthCoordinator` and sends `authRefresh` back to web. I found no native call to `notifyRefreshNeeded()`.

Problem:

There are two refresh protocols:

- web refreshes and calls `setAuth`
- native refreshes and emits `authRefresh`

One path is dead and the other duplicates Supabase cookie refresh behavior.

Cleanup:

Pick one:

- Preferred: web/Supabase owns refresh; native stores whatever web sends.
- Fallback: native can refresh only on cold-launch handoff, then web owns the session again.

Remove `refreshNeeded` from Swift plugin, TypeScript bridge types, and `NativeBridgeProvider`.

### 7. `setLastRoute` is no-op but still called on every route change

`NativeBridgeProvider` computes a tab from the current path and calls `PeekPokeBridge.setLastRoute`. Swift then calls `RootTabBarController.setLastRoute`, which is explicitly a no-op because each WebView retains its own navigation state.

Problem:

This is pure bridge noise and makes future readers think route restoration exists somewhere.

Cleanup:

Delete:

- `routeToTab`
- the `setLastRoute` effect in `NativeBridgeProvider`
- `setLastRoute` from bridge types/plugin methods
- `RootTabBarController.setLastRoute`

### 8. Splash hiding is duplicated

`NativeBridgeProvider` hides the native splash on mount. `AuthBridgeProvider` also hides it after its first session sync. The Swift `notifyReady` implementation resolves but does nothing.

Problem:

Three readiness concepts exist, but only two do anything, and neither is tied cleanly to data readiness or first paint.

Cleanup:

Keep exactly one splash policy:

- Hide from one client provider when the initial route is mounted and the app store is hydrated enough to render.
- Remove `notifyReady` if native does not use it.

### 9. Admin WebView is warmed before role visibility is known

`RootTabBarController` creates and warms `adminBridgeVC` on launch even when `isAdminVisible` is false.

Problem:

This loads `/admin` for non-admin users, which is unnecessary work and can trigger redirects/session events in a hidden WebView. Hidden WebViews should not be allowed to influence global auth state.

Cleanup:

Only instantiate/warm the admin WebView after the web layer reports `isAdmin: true`, or remove the native admin tab entirely and keep admin as a web route.

### 10. Native map clustering is computed in web with approximate camera bounds

Native Mapbox emits only camera center/zoom/bearing/pitch. `NativeMapBridge` then invents bounds using screen size and zoom. The comment says native will emit exact bounds, but it does not.

Problem:

Visible users and clusters can be wrong, especially with pitch, bearing, device safe areas, and latitude distortion. This is also a lot of bridge traffic: web computes clusters, serializes pins, native recreates annotations.

Cleanup options:

- Simple option: keep clustering in web, but have native emit exact visible bounds from Mapbox.
- Cleaner native-map option: web sends raw nearby users and selected state; native owns camera bounds, clustering, and annotations.

The second option reduces bridge churn and removes duplicated map math.

### 11. Global realtime location exposure remains a product/security flaw

`useNearbyPresence` joins a global `user-locations` presence channel, publishes exact `lat`/`lng`, and filters nearby users locally.

Problem:

Every subscribed client can potentially receive exact coordinates before local filtering. This is bigger than a cleanup issue; it is a privacy boundary problem.

Cleanup:

Move nearby discovery to the server:

- client sends current location to one API/RPC
- server returns only allowed nearby profiles
- return rounded/coarsened coordinates unless exact location is required
- keep online presence separate from exact location

## Recommended Target Architecture

### Native owns

- Keychain token vault
- root tab shell
- native Mapbox rendering
- push notification permission and badge count
- native-to-web route events for push/deep links only

### Web/Next.js owns

- Supabase browser session/cookies
- session refresh
- API calls
- preload/store hydration
- nearby discovery
- realtime DM/friend/profile updates
- profile/admin/inbox screens

### Bridge should shrink to

Web to native:

- `setAuth(session)` after login/refresh
- `clearAuth(reason)` only on explicit sign-out/delete
- `setRole({ isAdmin })`
- `setBadge({ tab, count })`
- `setMapOverlayRects(rects)`
- `setMapData(...)` or `setMapPins(...)`
- `setMapCamera(...)`

Native to web:

- `navigate({ route, source })`
- `appResumed`
- `authAvailable` or handoff only on cold launch
- `mapCameraChanged` with exact bounds
- `mapPinTapped`

Remove:

- `refreshNeeded`
- `notifyReady` if unused
- `setLastRoute`
- native `APIClient`
- native `PresenceManager`
- native `SupabaseService` unless a real native realtime feature is added

## Suggested Cleanup Order

1. Delete dead native data/realtime code: `APIClient.swift`, `PresenceManager.swift`, and then `SupabaseClient.swift` if nothing else needs it.
2. Reduce auth sync: make web session the refresh owner, and make native Keychain a passive mirror.
3. Remove dead bridge methods: `refreshNeeded`, `setLastRoute`, and likely `notifyReady`.
4. Stop hidden WebViews from mutating global auth; clear Keychain only on explicit sign-out/delete.
5. Fix native map bounds: either emit exact bounds or move clustering fully native.
6. Replace `user-locations` exact-coordinate realtime with a server-mediated nearby API/RPC.

## Highest-Risk Bugs To Fix First

1. Hidden/secondary WebViews can call `clearAuth()` and wipe native Keychain.
2. `AuthStore` publishes split token fields and native refresh code reads them non-atomically.
3. Client-side exact-location presence leaks too much location data.
4. Dead refresh and route bridge methods make auth/session behavior harder to reason about.
5. Native map clustering uses approximate bounds despite native owning the real map viewport.

