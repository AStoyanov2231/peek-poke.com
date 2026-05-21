# Peek & Poke

Mobile-first social presence app: find nearby people on a live map, earn coins for IRL meetups, send DMs. Deployed on Vercel; iOS via Capacitor wrapping Next.js with native Swift extensions.

**Stack:** Next.js 16.1 (App Router) · React 19 · TypeScript 5 strict · Supabase (Postgres + Auth + Realtime) · Zustand 5 (UI state) · React Query 5 (server state) · Capacitor 8 · Mapbox GL 3 · Stripe · Tailwind + shadcn/ui · Vitest 4 · Playwright (E2E)

## Directory Map

```
src/app/(auth)/          # Unauthenticated pages: login, welcome, OAuth callback
src/app/(main)/          # Protected pages: map, inbox, friends, profile, admin
src/app/api/             # 38 API routes: profile, dm, friends, coins, stripe, preload
src/components/          # React components; map/, layout/, profile/, ui/ subdirs
src/hooks/               # useGeolocation, usePresence, useRealtimeDM, useMeetingDetection…
src/lib/                 # supabase/, peekpoke-bridge.ts, geo.ts, auth.ts, stripe.ts
src/stores/              # Zustand: appStore.ts + selectors.ts
ios/App/App/Native/      # Swift: RootTabBarController, MapTabViewController, AuthStore…
ios/App/App/Plugins/     # PeekPokeBridgePlugin.swift (custom Capacitor plugin)
tasks/                   # todo.md (active plan), lessons.md (corrections log)
```

## Commands

```bash
# Web
npm run dev              # Next.js + Turbopack on :3000
npm run build && npm run start   # Production build check
npm run test             # Vitest watch
npm run test:coverage    # Vitest with coverage (targets: 70% stmt/line, 60% branch)

# iOS / Capacitor — always use these npm scripts, not bare npx cap commands
npm run cap:sync         # Build + sync to Xcode (auto-patches swift-tools-version)
npm run cap:open         # Open Xcode workspace
```

## Architecture

### Native Bridge
`PeekPokeBridgePlugin.swift` ↔ `src/lib/peekpoke-bridge.ts` ↔ `NativeBridgeProvider.tsx`
New bridge calls must be defined in all three layers. Types live in `src/types/native.d.ts`.

### Two Map Implementations
- **iOS native**: `MapTabViewController.swift` + `MapTabAnnotations.swift` (Mapbox iOS SDK)
- **Web/desktop**: `src/components/map/PersistentMapHost.tsx` (react-map-gl)
Interactive rects are synced from web → native via `setMapInteractiveRects` bridge call.

### State Ownership
- **Zustand** (`appStore.ts`): UI/client state — profile, friends list, messages, coins, blocks
- **React Query**: server-fetched data with cache invalidation
Don't mix these. Async server data belongs in React Query, not Zustand.

### Auth Flow
Web: Supabase session cookies validated in `src/middleware.ts`. Native: `/api/auth/native-handoff` exchanges tokens; `AuthStore.swift` holds the atomic `AuthSession` in Keychain; web refresh is Supabase-owned. On cold launch, `SceneDelegate` reads Keychain tokens and posts them to the handoff endpoint to mint WebView cookies.

### Native / Web Contract

**Ownership — native owns:** tab bar, Mapbox map rendering + annotation management, touch passthrough hit-testing, Keychain token storage, app/tab badge counts. Push notifications go through the official `@capacitor/push-notifications` plugin (not the custom bridge).

**Ownership — web/server owns:** all Supabase data access, auth session refresh, location reporting (`/api/location`), nearby user discovery (`/api/nearby`), clustering logic, all in-WebView UI.

**Rule: native must not add Supabase data clients, Realtime channels, or direct database calls.** All data flows through Next.js API routes. The only Supabase-adjacent thing native touches is writing tokens to Keychain on `setAuth`.

**Bridge calls — Web → Native (`src/lib/peekpoke-bridge.ts` → `PeekPokeBridgePlugin.swift`):**

| Method | Purpose |
|---|---|
| `setAuth(accessToken, refreshToken, expiresAt)` | Write token triple to Keychain atomically |
| `clearAuth()` | Clear Keychain — **only on explicit sign-out or account deletion** |
| `getAuth()` | Read stored token triple from Keychain |
| `setRole({ isAdmin })` | Show/hide admin tab (created lazily, destroyed on revoke) |
| `setTabBadge({ tab, count })` | Set badge on a named tab item |
| `setAppBadge({ count })` | Set iOS app icon badge number |
| `openExternal({ url })` | Open URL in Safari |
| `setMapInteractiveRects([rects])` | Declare web UI hit areas; touches outside pass to Mapbox |
| `setMapPins({ pins })` | Send annotated pin array to native Mapbox for rendering |
| `setMapCamera(options)` | Fly/animate Mapbox camera |
| `setMapClusterConfig(options)` | Reserved — currently no-op |

**Bridge events — Native → Web (`PeekPokeBridgePlugin.swift` → `NativeBridgeProvider.tsx`):**

| Event | Payload | When |
|---|---|---|
| `navigate` | `{ route, source }` | Tab bar tap or deeplink |
| `appResumed` | `{ route }` | App foregrounded |
| `authRefresh` | `{ accessToken, refreshToken, expiresAt }` | Cold-launch handoff complete |
| `mapCameraChanged` | `{ lat, lng, zoom, bearing, pitch, isUserGesture, bounds? }` | Mapbox map idle after pan/zoom |
| `mapPinTapped` | `{ id, kind, childIds? }` | Annotation tapped |

### Push Notifications

**Architecture — three layers:**

```
iOS (APNs) → AppDelegate.swift → @capacitor/push-notifications → NativeBridgeProvider.tsx
                                                                  → /api/profile/push-token (stores token)

Server: sendPushToUser(userId, payload)  →  src/lib/push/send.ts  →  @parse/node-apn  →  APNs  →  device
```

**Files:**
- `src/lib/push-notifications.ts` — client init, permission request, token upload, deep-link on tap
- `src/lib/push/send.ts` — `sendPushToUser(userId, PushPayload)`: fetches tokens from DB, sends via APNs, prunes invalid tokens
- `src/lib/push/apns.ts` — singleton APNs provider, reads env vars
- `src/app/api/profile/push-token/route.ts` — POST stores token, DELETE removes on sign-out
- `ios/App/App/AppDelegate.swift` — **must** contain the two APNs callbacks below

**Critical AppDelegate requirement** (`@capacitor/push-notifications` v4+ does not use swizzling):
```swift
func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
    NotificationCenter.default.post(name: .capacitorDidRegisterForRemoteNotifications, object: deviceToken)
}
func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
    NotificationCenter.default.post(name: .capacitorDidFailToRegisterForRemoteNotifications, object: error)
}
```
Without these, iOS calls back with the device token but nothing forwards it to Capacitor → `registration` event never fires → token never reaches the DB → no push possible. Symptom: `profiles.push_tokens` is empty for all users.

**Sending a push** from any API route:
```typescript
import { sendPushToUser } from "@/lib/push/send";
await sendPushToUser(recipientId, {
  title: "Hello",
  body: "Message text",
  route: "/chat/thread-id",   // deep-links into the app on tap
  threadId: "thread-id",      // iOS notification coalescing
  badge: 3,                   // optional app icon badge count
});
```
`sendPushToUser` is fire-and-forget (never throws). Non-deliverable tokens are pruned automatically (APNs 410). Non-410 APNs rejections are logged to Vercel as `sendPushToUser APNs rejections:`.

**Deep links on tap:** `notification.data.route` is read in `pushNotificationActionPerformed` and routed via Next.js router. Allowed prefixes: `/inbox`, `/chat`, `/profile`, `/admin`.

**Token storage:** `profiles.push_tokens` — jsonb array of `{ token, platform }`, max 20 per user, deduped on upload.

**One-time setup:**
1. Xcode → App target → Signing & Capabilities → `+ Capability` → **Push Notifications** (creates `App.entitlements` with `aps-environment`)
2. Apple Developer → Keys → `+` → Apple Push Notifications service → download `.p8` once
3. Env vars (Vercel + `.env.local`): `APNS_KEY_ID`, `APNS_TEAM_ID`, `APNS_KEY_P8` (raw `.p8` content or base64), `APNS_BUNDLE_ID` (`com.peekpoke.app`), `APNS_PRODUCTION`

**APNs environment — must match build type:**
| Build | Token type | `APNS_PRODUCTION` |
|---|---|---|
| Xcode debug → device | Sandbox | `false` |
| TestFlight or App Store | Production | `true` |

Mismatch is silent (APNs drops the notification). Check Vercel logs for `BadDeviceToken` reason if pushes stop working after a build type change.

## Quirks & Traps

**Capacitor sync**: Use `npm run cap:sync`, never `npx cap sync` — the npm script patches `swift-tools-version` in `ios/App/CapApp-SPM/Package.swift` without which Xcode builds fail.

**Mapbox token**: Stored in `ios/App/Secrets.xcconfig` as `MAPBOX_ACCESS_TOKEN` (Xcode build variable). Copy from `Secrets.xcconfig.example`. Never put it in `.env` or commit the file.

**iOS target**: Swift 6.2, iOS 26 minimum. Requires latest Xcode beta — older Xcode will not compile.

**CSP**: All external resources must be allowlisted in `next.config.ts`. Mapbox, Supabase, Stripe, and Google are already there. New third-party scripts/fonts/workers need explicit CSP entries.

**Dating feature**: `discover`, `matches`, age-gate, and onboarding flow were intentionally removed. Do not re-add.

**Capacitor environment**: `capacitor.config.ts` switches `server.url` between `localhost:3000` (dev) and the production domain based on `NODE_ENV`.

**Push notifications**: Full flow documented in the Architecture section below.

## Workflow

- **Plan first**: write plan to `tasks/todo.md`, check in before starting
- **After any correction**: update `tasks/lessons.md` with a rule that prevents the repeat
- **Verification**: never mark complete without running tests or demonstrating in-app
- **Subagents**: use for isolated tasks to keep the main context clean
- **Principles**: simplest solution that solves the problem; find root causes, no temporary fixes
