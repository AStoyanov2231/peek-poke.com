# Peek & Poke

Mobile-first social presence app: find nearby people on a live map, earn coins for IRL meetups, send DMs. iOS via Capacitor wrapping Next.js with native Swift extensions; deployed on Vercel.

**Stack:** Next.js 16.1 (App Router) · React 19 · TypeScript 5 strict · Supabase (Postgres + Auth + Realtime) · Zustand 5 (UI state) · React Query 5 (server state) · Capacitor 8 · Mapbox GL 3 · Stripe · Tailwind + shadcn/ui · Zod · Vitest 4 · Playwright (E2E)

## Engineering Standards

These are mandatory and override habit. **Prime directive: solve the root cause with a reusable abstraction — never patch a symptom.** If a fix would have to be repeated elsewhere, it is wrong: extract it into `src/lib/<domain>`, name it, type it, test it, and reuse it. Prefer an existing primitive (see *Reusable Building Blocks*) over inventing a new one.

### Design (OOP principles, applied idiomatically)
Apply SOLID and encapsulation through **modules, pure functions, hooks, and the occasional stateful class** — not through class React components.
- **Single responsibility.** One unit, one job. If describing it needs "and", split it.
- **Encapsulation.** A module exposes a small, typed public surface and hides its internals. Callers depend on the signature, never on implementation detail.
- **Dependency inversion.** Inject collaborators (clients, callbacks, params) — see `withAuth(handler)` and `useRealtimeDM(params)`. Never reach into a global/singleton from inside business logic; pass it in.
- **Composition over inheritance.** Build behavior from small functions and hooks. Reserve `class` for genuinely stateful domain objects (e.g. the Capacitor bridge); never subclass for code reuse.
- **DRY with intent.** Two copies is a warning; three is a defect. Extract before the third.
- **No speculative abstraction.** Generalize only when a second real caller exists. Reusable ≠ premature.

### TypeScript
- `strict` is on. No `any`, no `as` to silence the compiler, no non-null `!` on a value you didn't just guard — model the type correctly instead.
- Fully type every exported function and module boundary. Define an `interface`/`type` for params objects and payloads (see `PushPayload`, `UseRealtimeDMParams`).
- Validate **all** external input (request bodies, route params) with a Zod schema in `src/lib/validators.ts`. Let types flow from schemas (`z.infer`); don't hand-write a type the schema already produces.
- No magic numbers/strings — name them in `src/lib/constants.ts` or beside the module (`VISIBILITY_THROTTLE_MS`).
- Document non-obvious contracts and failure modes with JSDoc (see `sendPushToUser`).
- Import via the `@/*` alias, never deep relative `../../..` chains.

### React & hooks
- Components are **thin and presentational**. Push data fetching, side effects, and business rules down into hooks (`src/hooks`) or services (`src/lib`). No business logic in JSX — derive, then render.
- Custom hooks take typed dependencies, guard re-entrancy, and clean up **every** subscription/timer/listener in the effect's return (see `useRealtimeDM`).
- Read store state through selector hooks in `src/stores/selectors.ts` — never subscribe to the whole store. Use `useShallow` for arrays/objects/Sets and a stable empty reference (`EMPTY_MESSAGES`) to prevent needless re-renders.
- Prefer composition (small components + `children`) over prop-drilling or mega-components.

### State ownership (do not mix)
- **Server data → React Query.** Anything fetched from an API route, with cache invalidation. The server is the source of truth.
- **Client/UI data → Zustand** (`appStore.ts`): profile, friends, messages, coins, blocks, map selection.
- Never copy server data into Zustand "to be safe", and never put `fetch` logic in a new store action — that responsibility belongs to React Query or a service.

### API routes
- Wrap every protected handler in `withAuth<Params>` — it injects `{ user, supabase, params }` and returns 401. Never re-implement auth in a route.
- Fixed order: **authenticate** (`withAuth`) → **authorize** (`verifyThreadParticipant` / `requireAdminRole` / `isBlocked` / …) → **validate** (`parseBody` + Zod) → **act** → **respond**.
- Return failures with `apiError(message, status)`; never leak internals to the client. Log server faults with a `route:` prefix.
- User-scoped queries use `createClient()` (RLS enforced). Use `createServiceClient()` only when you must bypass RLS, only server-side, and never directly behind unvalidated input.
- Multi-step writes that must be atomic belong in a Postgres RPC, not two sequential `.update()` calls (the failure the `clear_thread_messages` TODO warns about).

### Reusable Building Blocks — reach for these before writing new code
| Need | Use | Never |
|---|---|---|
| Protect a route | `withAuth<P>(handler)` | re-read the session manually |
| Validate input | Zod schema in `validators.ts` + `parseBody` | parse/trust raw JSON |
| Authorize | `verifyThreadParticipant` · `requireAdminRole` · `requireModeratorRole` · `isBlocked` · `hasSubscriberRole` | inline role/ownership checks |
| API error response | `apiError(message, status)` | bespoke error shapes / leaking internals |
| Server DB (user) | `createClient()` (RLS) | service client for user-scoped reads |
| Server DB (privileged) | `createServiceClient()` | exposing it to the client or unvalidated input |
| Read UI state | selector hooks in `selectors.ts` | subscribing to the whole store |
| Send a push | `sendPushToUser(userId, payload)` | calling APNs directly |
| Geo math | `src/lib/geo.ts` | re-deriving haversine / bbox |

### Definition of done
- Type-checks clean (`npm run build`) and passes `npm run lint` + `npm run test`.
- New logic has a Vitest test. Coverage targets: 70% stmt/line, 60% branch.
- No shipped `TODO`-as-feature, no commented-out code, no stray `console.log`.
- Reused an existing primitive where one fit; extracted a new one where the logic will recur.

## Directory Map

```
src/app/(auth)/          # Unauthenticated pages: login, welcome, OAuth callback
src/app/(main)/          # Protected pages: map, inbox, friends, profile, admin
src/app/api/             # REST API routes: profile, dm, friends, coins, stripe, preload…
src/components/          # React components; map/, layout/, profile/, ui/ subdirs
src/hooks/               # useGeolocation, usePresence, useRealtimeDM, useMeetingDetection…
src/lib/                 # supabase/, push/, webrtc/, auth.ts, validators.ts, geo.ts, peekpoke-bridge.ts
src/stores/              # Zustand: appStore.ts, callStore.ts + selectors.ts
src/types/               # database.d.ts, native.d.ts
ios/App/App/Native/      # Swift: RootTabBarController, MapTabViewController, AuthStore…
ios/App/App/Plugins/     # PeekPokeBridgePlugin.swift (custom Capacitor plugin)
tasks/                   # todo.md (active plan), lessons.md (corrections log)
```

## Commands

```bash
npm run dev              # Next.js + Turbopack on :3000
npm run build            # Production build — also the type-check gate
npm run lint             # eslint
npm run test             # Vitest (run once); test:watch / test:coverage / test:e2e also available

# iOS / Capacitor — always the npm scripts, never bare `npx cap …`
npm run cap:sync         # Build + sync to Xcode (patches swift-tools-version; npx cap sync does not)
npm run cap:open         # Open the Xcode workspace
```

## Architecture

### Native bridge
`peekpoke-bridge.ts` (web) ↔ `PeekPokeBridgePlugin.swift` (native) ↔ `NativeBridgeProvider.tsx` (events). Types in `src/types/native.d.ts`. A new call lives in **all three layers or none**.

**Web → Native**

| Method | Purpose |
|---|---|
| `setAuth(accessToken, refreshToken, expiresAt)` | Write token triple to Keychain atomically |
| `clearAuth()` | Clear Keychain — **only on explicit sign-out or account deletion** |
| `getAuth()` | Read stored token triple |
| `setRole({ isAdmin })` | Show/hide admin tab (lazy create, destroy on revoke) |
| `setTabBadge({ tab, count })` / `setAppBadge({ count })` | Tab / app-icon badges |
| `openExternal({ url })` | Open URL in Safari |
| `setMapInteractiveRects([rects])` | Declare web hit areas; touches outside pass to Mapbox |
| `setMapPins({ pins })` · `setMapCamera(options)` | Render pins / animate camera in native Mapbox |

**Native → Web**

| Event | Payload | When |
|---|---|---|
| `navigate` | `{ route, source }` | Tab tap or deeplink |
| `appResumed` | `{ route }` | App foregrounded |
| `authRefresh` | `{ accessToken, refreshToken, expiresAt }` | Cold-launch handoff complete |
| `mapCameraChanged` | `{ lat, lng, zoom, bearing, pitch, isUserGesture, bounds? }` | Map idle after pan/zoom |
| `mapPinTapped` | `{ id, kind, childIds? }` | Annotation tapped |

### Two map implementations
- **iOS native:** `MapTabViewController.swift` + `MapTabAnnotations.swift` (Mapbox iOS SDK).
- **Web/desktop:** `src/components/map/PersistentMapHost.tsx` (react-map-gl).
Web declares interactive hit areas to native via `setMapInteractiveRects`; touches outside them pass through to Mapbox.

### Auth flow
Web: Supabase session cookies validated in `src/middleware.ts`. Native: `/api/auth/native-handoff` exchanges tokens; `AuthStore.swift` holds the atomic `AuthSession` in Keychain; Supabase owns refresh. Cold launch: `SceneDelegate` reads Keychain tokens → posts to the handoff endpoint → mints WebView cookies.

### Native / Web contract
- **Native owns:** tab bar, Mapbox rendering + annotations, touch hit-testing, Keychain tokens, app/tab badges. Push goes through `@capacitor/push-notifications` (not the custom bridge).
- **Web/server owns:** all Supabase data access, auth refresh, location reporting (`/api/location`), nearby discovery (`/api/nearby`), clustering, all in-WebView UI.
- **Rule:** native adds **no** Supabase clients, Realtime channels, or DB calls — everything flows through Next.js API routes. The only Supabase-adjacent native action is writing tokens to Keychain on `setAuth`.

### Push notifications
`sendPushToUser(userId, payload)` → `src/lib/push/send.ts` → `@parse/node-apn` → APNs → device. Client init/permission/token-upload/deep-link live in `src/lib/push-notifications.ts`; the APNs provider singleton + env in `src/lib/push/apns.ts`; token CRUD at `/api/profile/push-token`.

```ts
import { sendPushToUser } from "@/lib/push/send";
await sendPushToUser(recipientId, {
  title: "Hello",
  body: "Message text",
  route: "/chat/<threadId>",   // deep-links on tap; prefixes: /inbox /chat /profile /admin
  threadId: "<threadId>",      // iOS coalescing
  badge: 3,                    // optional app-icon badge
});
```
Fire-and-forget (never throws). 410 tokens are pruned automatically; non-410 rejections log as `sendPushToUser APNs rejections:`. Tokens live in `profiles.push_tokens` (jsonb, max 20, deduped).

**Traps:**
- `AppDelegate.swift` must forward **both** APNs callbacks (`didRegisterForRemoteNotificationsWithDeviceToken` / `didFailToRegisterForRemoteNotificationsWithError`) to `NotificationCenter` — `@capacitor/push-notifications` v4+ does not swizzle. Missing → `registration` never fires → `push_tokens` empty for every user.
- `APNS_PRODUCTION` must match the build: Xcode debug → device = sandbox = `false`; TestFlight/App Store = production = `true`. Mismatch is silent — check Vercel logs for `BadDeviceToken`.
- One-time setup (Xcode Push capability, APNs `.p8` key, `APNS_*` env vars) is already configured; consult Vercel env if re-provisioning.

## Quirks & Traps

- **Capacitor sync:** use `npm run cap:sync`, never `npx cap sync` — the script patches `swift-tools-version` in `ios/App/CapApp-SPM/Package.swift`, without which Xcode builds fail.
- **Mapbox token:** `ios/App/Secrets.xcconfig` as `MAPBOX_ACCESS_TOKEN` (copy from `Secrets.xcconfig.example`). Never put it in `.env`; never commit the file.
- **iOS target:** Swift 6.2, iOS 26 minimum — requires the latest Xcode beta.
- **CSP:** allowlist all external resources in `next.config.ts` (Mapbox, Supabase, Stripe, Google already present). New third-party scripts/fonts/workers need explicit entries.
- **Dating feature removed:** `discover`, `matches`, age-gate, and onboarding flow were intentionally deleted — do not re-add.
- **Capacitor env:** `capacitor.config.ts` switches `server.url` between `localhost:3000` (dev) and the production domain by `NODE_ENV`.

## Workflow

- **Plan first:** write the plan to `tasks/todo.md` and check in before building.
- **Log corrections:** after any correction, add a preventive rule to `tasks/lessons.md`.
- **Verify, don't assume:** never mark work done without a passing test or an in-app demonstration.
- **Subagents:** delegate isolated investigation to keep the main context clean.
