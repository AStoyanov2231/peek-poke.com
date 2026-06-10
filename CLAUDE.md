# Peek & Poke

Mobile-first social presence app: find nearby people on a live map, earn coins for IRL meetups, send DMs. iOS via Capacitor wrapping Next.js with native Swift extensions; deployed on Vercel.

**Stack:** Next.js 16.1 (App Router) · React 19 · TypeScript 5 (strict) · Supabase (Postgres + Auth + Realtime) · Zustand 5 (UI) · React Query 5 (server state) · Capacitor 8 · Mapbox GL 3 · Stripe · Tailwind + shadcn/ui · Zod · Vitest 4 · Playwright.

## Commands

```bash
npm run dev        # Next.js + Turbopack on :3000
npm run build      # Production build — also the type-check gate
npm run lint       # eslint
npm run test       # Vitest once (also test:watch / test:coverage / test:e2e)
npm run cap:sync   # Build + sync to Xcode — NEVER `npx cap sync` (it skips the swift-tools-version patch and Xcode builds fail)
npm run cap:open   # Open the Xcode workspace
```

**Done means:** `npm run build` + `npm run lint` + `npm run test` all pass, and new logic has a Vitest test (coverage targets: 70% stmt/line, 60% branch).

## Conventions you can't infer from the code

Extract a reusable abstraction into `src/lib/<domain>` only when the logic actually recurs — not speculatively. Lint and `strict` types are the style guide; there isn't a separate one.

**Reach for these primitives before writing new code:**

| Need | Use |
|---|---|
| Protect a route | `withAuth<P>(handler)` — injects `{ user, supabase, params }`, returns 401 |
| Validate input | Zod schema in `src/lib/validators.ts` + `parseBody`; let types flow via `z.infer` |
| Authorize | `verifyThreadParticipant` · `requireAdminRole` · `requireModeratorRole` · `isBlocked` · `hasSubscriberRole` |
| API error | `apiError(message, status)` — never leak internals to the client |
| Server DB (user, RLS) | `createClient()` |
| Server DB (privileged) | `createServiceClient()` — server-only, never behind unvalidated input |
| Read UI state | selector hooks in `src/stores/selectors.ts` (`useShallow` + stable empty refs) |
| Send a push | `sendPushToUser(userId, payload)` — fire-and-forget, never call APNs directly |
| Geo math | `src/lib/geo.ts` — never re-derive haversine/bbox |

**API route order (fixed):** authenticate (`withAuth`) → authorize → validate (`parseBody` + Zod) → act → respond. Multi-step writes that must be atomic go in a Postgres RPC, not sequential `.update()` calls.

**State ownership (don't mix):** server data → React Query (the source of truth, with cache invalidation); client/UI data → Zustand (`appStore.ts`: profile, friends, messages, coins, blocks, map selection). Never copy server data into Zustand; never put `fetch` in a store action.

**Imports:** the `@/*` alias, never `../../..` chains.

## Architecture

- **Native bridge** — `peekpoke-bridge.ts` (web) ↔ `PeekPokeBridgePlugin.swift` (native) ↔ `NativeBridgeProvider.tsx` (events). The full method/event contract lives in `src/types/native.d.ts`; read it before touching the bridge. A new call lives in **all three layers or none**.
- **Native/web contract** — native owns the tab bar, Mapbox rendering + annotations, touch hit-testing, Keychain tokens, and badges. Native adds **no** Supabase clients, Realtime channels, or DB calls; everything flows through Next.js API routes. The only Supabase-adjacent native action is writing tokens to Keychain on `setAuth`. Web declares interactive hit areas via `setMapInteractiveRects`; touches outside them pass through to Mapbox.
- **Two maps** — native: `MapTabViewController.swift` (Mapbox iOS SDK); web/desktop: `src/components/map/PersistentMapHost.tsx` (react-map-gl).
- **Auth** — web: Supabase cookies validated in `src/middleware.ts`. Native: `/auth/native-handoff` exchanges tokens, `AuthStore.swift` keeps them in Keychain, Supabase owns refresh. Call `clearAuth()` only on explicit sign-out or account deletion. Note two distinct auth locations: the `(auth)` route group is just `login` + `welcome`; the OAuth `callback` and `native-handoff` routes live in the plain `src/app/auth/` dir.
- **Push** — `sendPushToUser` → `src/lib/push/send.ts` → APNs. Payload `{ title, body, route?, threadId?, badge? }`; `route` deep-links on tap (`/inbox` `/chat` `/profile` `/admin`). Tokens in `profiles.push_tokens` (jsonb, max 20, deduped).

## Gotchas

- **`APNS_PRODUCTION` must match the build** — Xcode debug → device = sandbox = `false`; TestFlight/App Store = `true`. Mismatch is silent; check Vercel logs for `BadDeviceToken`.
- **`AppDelegate.swift` must forward both APNs callbacks** to `NotificationCenter` (`@capacitor/push-notifications` v4+ doesn't swizzle), or `push_tokens` stays empty for every user.
- **Mapbox token** lives in `ios/App/Secrets.xcconfig` as `MAPBOX_ACCESS_TOKEN` — never in `.env`, never committed.
- **CSP** — allowlist any new third-party script/font/worker in `next.config.ts`.
- **iOS target** — Swift 6.2, iOS 26 minimum; needs the latest Xcode beta.
- **The dating feature was removed on purpose** — `discover`, `matches`, and the age-gate. Don't re-add. (`(main)/onboarding` is the *current* username + interests flow, not dating — keep it.)

## Workflow

- Plan first in `tasks/todo.md` for multi-file or uncertain work; skip the plan for a one-sentence change.
- After a correction, append a preventive rule to `tasks/lessons.md` (one lesson, with the why).
- Delegate isolated investigation to subagents to keep the main context clean.
