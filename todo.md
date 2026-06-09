# Production Readiness TODO

Generated from `findings.md` deep scan — 2026-06-02.
Ordered by priority. Check off as completed.

---

## 🔴 Must fix before launch

- [ ] **Version-control the database schema.** Create a `supabase/migrations/`
      folder and capture the current schema, RLS policies, and RPCs as SQL
      migration files. Commit them. (Run `supabase db pull` or `supabase gen`.)
- [ ] **Generate & commit Supabase TypeScript types** from the schema so
      `src/types/database.ts` stays in sync.
- [ ] **Add error monitoring** (e.g. Sentry) for both server and client. Wire it
      into API route catches and the React error boundary.
- [ ] **Switch Stripe to live keys on Vercel.** Set `STRIPE_SECRET_KEY` (`sk_live_…`),
      `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` (`pk_live_…`), and `STRIPE_WEBHOOK_SECRET`
      as production env vars. Do NOT keep test keys for prod.
- [ ] **Add a Content-Security-Policy header** in `next.config.ts` (allowlist
      Mapbox, Supabase, Stripe, Google). Update `CLAUDE.md` — it claims a CSP
      exists but none is configured.
- [ ] **Verify all required env vars are set on Vercel** so the app doesn't crash
      on boot: `STRIPE_SECRET_KEY`, `NEXT_PUBLIC_SUPABASE_URL`,
      `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`,
      `NEXT_PUBLIC_MAPBOX_TOKEN`, APNS keys, `APPLE_TEAM_ID`.

---

## 🟠 Should fix soon

- [ ] **Add rate limiting** to abusable endpoints:
  - [ ] `POST /api/dm/[threadId]` (send message)
  - [ ] `POST /api/friends` (friend requests)
  - [ ] `POST /api/coins/meeting` (coin collection)
  - [ ] `POST /api/location` and `GET /api/nearby`
  - [ ] `POST /api/admin/coins` (coin placement)
- [ ] **Make multi-step operations atomic** (wrap in Postgres RPCs):
  - [ ] `set_avatar(photo_id)` — `src/app/api/profile/photos/[photoId]/route.ts:62`
  - [ ] `clear_thread_messages(thread_id)` — `src/app/api/dm/[threadId]/messages/route.ts:16`
  - [ ] `delete_thread_and_messages(thread_id)` — `src/app/api/dm/[threadId]/delete/route.ts:16`
- [ ] **Build the unblock feature.** Add an `unblock_user()` RPC and wire up the
      DELETE handler — `src/app/api/users/[userId]/block/route.ts:32`.
- [ ] **Fix photo deletion cleanup.** Error-check the un-awaited
      `avatar_url: null` update — `src/app/api/profile/photos/[photoId]/route.ts:141`.
- [ ] **Add API-layer authorization checks** (don't rely on RPCs alone): verify
      thread participation before `send_message`, and friendship ownership before
      unfriend.

---

## 🟡 Nice to fix

- [ ] **Create a `.env.example`** documenting every required and optional env var.
- [ ] **Add HSTS header** (`Strict-Transport-Security: max-age=31536000; includeSubDomains`)
      in `next.config.ts`.
- [ ] **Move `allowedDevOrigins: ["192.168.100.2"]`** out of production config
      (make it dev-only) — `next.config.ts:4`.
- [ ] **Add `robots.txt`** and richer metadata (og tags, canonical) to
      `src/app/layout.tsx`.
- [ ] **(Optional) Add analytics** if you want usage insight.
- [ ] **Validate bounds** on `GET /api/bots` lat/lng query params —
      `src/app/api/bots/route.ts:5`.
- [ ] **Validate self-block / already-blocked** in block endpoint —
      `src/app/api/users/[userId]/block/route.ts:5`.

---

## 🧹 Housekeeping

- [ ] **Fix the Vitest mock warning** — move `vi.mock()` calls in
      `test/mocks/supabase.ts` to the top level (will become an error in a future
      Vitest version).
- [ ] **Validate Stripe webhook payload shape** beyond the signature before
      casting — `src/app/api/stripe/webhook/route.ts:22`.
- [ ] **Review `console.log` in Stripe webhook** for unhandled events —
      `src/app/api/stripe/webhook/route.ts`.

---

### ✅ Already in good shape (no action needed)
- TypeScript build: 0 errors
- Tests: 478/478 passing
- Lint: clean
- Secrets: never committed to git history
- Auth guards, input validation (Zod), XSS fix, Stripe signature verification
- Dating feature fully removed
