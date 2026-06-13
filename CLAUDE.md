# Peek & Poke

Mobile-first social-presence app: nearby people on a live map, coins for IRL meetups, DMs + 1:1 calls. **One** Next.js app running in two runtimes — a browser SPA, and a single persistent iOS `WKWebView` wrapped by a native Swift shell (Capacitor 8). The deep map of how it all fits together is **`docs/ARCHITECTURE.md`** — start there.

**Stack:** Next.js 16 (App Router) · React 19 · TS strict · Supabase (Postgres + RLS + Realtime + Storage) · Zustand · TanStack Query · Mapbox GL + supercluster · Stripe · Upstash · APNs · Capacitor 8.

## Docs come first

`docs/` holds deep, cited references — one file per subsystem, with `ARCHITECTURE.md` as the hub and index. **This file is rules; the docs are how things actually work.** Don't restate doc depth here; point to it.

- **Read before you touch a subsystem.** Before planning or editing in an area, read its doc — it's the ground truth for the flow, key files (`file:line`), and gotchas. Subsystems (all under `docs/`): `BRIDGE` · `AUTH` · `API` · `MCP` · `DATA` · `REALTIME` · `DEEPLINKS` · `MAPS` · `CALLING` · `COINS` · `SEARCH` · `UPLOAD` · `PAYMENTS` · `PUSH`.
- **Update in the same change (hard rule).** If a change alters what a doc describes, fix the doc *as part of that change* — a stale doc or wrong `file:line` is a bug, not a follow-up. A change is **doc-affecting** when it: adds/removes/renames an API route, bridge method, or native→web event; changes an auth / preload / realtime flow; adds or drops a table, RPC, or Storage bucket; or changes a documented invariant. Touch the **How it works** steps, refresh citations, and add/remove gotchas to match.
- **When editing docs:** keep the `file:line` convention, prefer prose + a mermaid diagram over walls of text, and write `> TODO: verify` rather than guess. If you add or remove a doc, update the index in `ARCHITECTURE.md`.

## How to work

- **Plan mode** for multi-file or uncertain work; just do one-sentence changes. No `tasks/*.md` planning files.
- **Cite `file:line`** in explanations (matches the docs). Show diffs and concrete plans, not essays — terse over exhaustive.
- **Done means** `npm run build` + `npm run lint` + `npm run test` all green, and new logic has a Vitest test. Verify before claiming done; if a step was skipped or fails, say so.
- **Scope discipline.** Do what's asked. Extract an abstraction into `src/lib/<domain>` only when logic actually recurs — not speculatively. Lint + strict types are the style guide.
- Record durable lessons/corrections in `/memory`, not a file.

## Commands

```bash
npm run dev        # Next.js + Turbopack on :3000
npm run build      # production build — also the type-check gate
npm run lint       # eslint
npm run test       # Vitest once (also test:watch / test:coverage / test:e2e)
npm run cap:sync   # build + sync to Xcode — NEVER `npx cap sync` (skips the swift-tools-version patch; Xcode build fails)
npm run cap:open   # open the Xcode workspace
```

## Reach for these before writing new code

| Need | Use |
|---|---|
| Protect a route | `withAuth<P>(handler)` → injects `{ user, supabase, params }`, returns 401 |
| Validate input | Zod schema in `src/lib/validators.ts` + `parseBody`; let types flow via `z.infer` |
| Authorize | `verifyThreadParticipant` · `requireAdminRole` · `requireModeratorRole` · `isBlocked` · `hasSubscriberRole` |
| API error response | `apiError(message, status)` — never leak internals to the client |
| Server DB (user / RLS) | `createClient()` |
| Server DB (privileged) | `createServiceClient()` — server-only, never behind unvalidated input |
| Read client state | selector hooks in `src/stores/selectors.ts` |
| Send a push | `sendPushToUser(userId, payload)` — fire-and-forget, never call APNs directly |
| Geo math | `src/lib/geo.ts` — never re-derive haversine/bbox |

**API route order (fixed):** authenticate (`withAuth`) → authorize → validate (`parseBody` + Zod) → act → respond. Multi-step writes that must be atomic go in a Postgres RPC, not sequential `.update()` calls. Details: `docs/API.md`.

**State ownership:** the canonical client store is Zustand `appStore` — profile, friends, threads/messages, coins, blocks, presence, map selection — hydrated from the SSR preload (`get_preload` RPC) and kept live by the `useRealtime*` hooks; read it via selectors. TanStack Query is used only for specific server reads/mutations (admin tabs, chat sheet, search/tag suggestions), *not* core domain state. Never put `fetch` in a store action. Imports use the `@/*` alias. See `docs/ARCHITECTURE.md` → State & data flow and `docs/REALTIME.md`.

## Traps (non-obvious, can't infer from code)

- **A bridge call lives in all three layers or none** — `peekpoke-bridge.ts` (web) ↔ `PeekPokeBridgePlugin.swift` (native) ↔ `NativeBridgeProvider.tsx` (events). See `docs/BRIDGE.md`.
- **`APNS_PRODUCTION` must match the build** — debug/device = sandbox = `false`; TestFlight/App Store = `true`. Mismatch is silent (`BadDeviceToken` in Vercel logs). See `docs/PUSH.md`.
- **`AppDelegate.swift` must forward both APNs callbacks** to `NotificationCenter` — `@capacitor/push-notifications` doesn't swizzle them, or `profiles.push_tokens` stays empty for every user.
- **Mapbox token** → `ios/App/Secrets.xcconfig` as `MAPBOX_ACCESS_TOKEN`; never `.env`, never committed.
- **CSP** — allowlist any new third-party script / font / worker in `next.config.ts`.
- **iOS target** — Swift 6.2, iOS 26 minimum; needs the latest Xcode beta.
- **The dating feature was removed on purpose** (`discover`, `matches`, the age-gate) — don't re-add. `(main)/onboarding` is the *current* username + interests flow — keep it.
