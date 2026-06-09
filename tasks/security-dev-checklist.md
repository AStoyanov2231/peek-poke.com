# Security Dev-Phase Checklist

Track progress on security issues that need fixing during development.
Full details for each item in `SECURITY_REVIEW_REPORT.md`.

---

## Architectural Fixes (redesign core flows)

- [ ] **SEC-003** — `/api/nearby` returns exact coordinates — snap to ~100 m grid server-side; show distance bands for non-friends
- [ ] **SEC-004** — Coin awards trust client proximity — move haversine check into `record_meeting` RPC; use persisted `user_locations`, not client POST body
- [ ] **SEC-005** — Either DM participant can wipe shared thread — add per-user `hidden_for_user_1/2` flags; make hard-delete moderator-only
- [ ] **SEC-009** — File uploads trust client MIME type — server-side magic-byte sniff + `sharp` re-encode; reject anything `sharp` can't decode
- [ ] **SEC-011** — Native handoff has no CSRF/origin check — add Origin check + short-lived HMAC nonce; reject if cookies already belong to a different user
- [ ] **SEC-013** — Account deletion only kills current session — call `admin.signOut(userId, 'global')`; schedule hard-delete job; lock API surface immediately on `deleted_at`
- [ ] **SEC-014** — URL safety validation duplicated in 3 places with drift — consolidate into one `isSafeInternalPath()` using `new URL(p, base).origin` check; single allow-list shared by middleware, push, OAuth callback, and native nav
- [ ] **SEC-018** — Bot coin collection trusts client lat/lng — have `collect_coin_bot` RPC use persisted user location, not client-supplied coordinates

---

## Broken for Test Users Now

- [ ] **SEC-008** — Photos auto-approve, bypassing moderation — default new uploads to `approval_status: "pending"`; hide pending photos from public APIs
- [ ] **SEC-012** — Realtime global subscriptions — verify Supabase Realtime RLS on `dm_messages`, `profiles`, `friendships`; add per-thread filter where possible; test with a non-participant account
- [x] **SEC-017** — `/api/location` accepts `NaN` and out-of-range values — validate `Number.isFinite(lat) && lat >= -90 && lat <= 90` (same for lng); use Zod schema
- [ ] **SEC-023** — Universal Links broken — set `APPLE_TEAM_ID` env var in Vercel; add `com.apple.developer.associated-domains` entitlement to `App.entitlements`
- [x] **SEC-025** — `unblock_user` is a raw table delete — implement `unblock_user()` RPC that properly reverses all side effects of `block_user()`

---

## Repo & Build Hygiene

- [ ] **SEC-024** — No CI — add `.github/workflows/ci.yml` running `npm ci && npm run build && npm test && npm audit --audit-level=high` on every PR; add branch protection on `dev` and `master`
- [ ] **SEC-020** — Supabase media host hardcoded — derive `ALLOWED_MEDIA_HOST` from `new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname` in `src/lib/validation.ts`
- [ ] **SEC-026** — `cap:sync` uses BSD `sed -i ''` — replace with `node -e` one-liner or `replace-in-file` package so it works on Linux CI
- [ ] **SEC-027** — `capacitor.config.ts` gitignored but tracked — either remove the `.gitignore` entry (file is safe to track) or `git rm --cached` and commit a template
- [ ] **SEC-028** — Raw security notes in repo root — move `security_report.md`, `report.md`, `clean_up.md`, `clean_up_tickets.md` to a private wiki or delete after issues are fixed

---

## Pre-Launch (do not need to fix in dev phase)

These are tracked here for awareness but are not dev-phase blockers:

- [ ] **SEC-001** — APNs entitlement `development` → `production` *(only needed for App Store build)*
- [ ] **SEC-002** — Add CSP + HSTS headers to `next.config.ts`
- [ ] **SEC-006** — Set `limitsNavigationsToAppBoundDomains: true` + `WKAppBoundDomains` in Info.plist
- [ ] **SEC-007** — Restrict `openExternal` to `https://` + domain allow-list in Swift
- [ ] **SEC-010** — Enforce single-token-per-device on push token upload; delete from other profiles
- [ ] **SEC-015** — Verify Stripe `paymentMethodId` belongs to calling customer before attach
- [x] **SEC-016** — Add Upstash rate limiting to all mutation endpoints
- [ ] **SEC-019** — Validate APNs key parses correctly at module load; prefer base64-only env var
- [ ] **SEC-021** — Remove Mapbox token `print` from DEBUG builds in `AppConfig.swift`
- [ ] **SEC-022** — Strip `console.*` in production via `compiler.removeConsole`; use structured logger server-side
- [ ] **SEC-029** — Add explicit auth or intentional-public comment to `/api/interests`
- [ ] **SEC-030** — Replace `error: error.message` with generic message + server-side log
- [ ] **SEC-031** — Re-evaluate Bearer-token CSRF bypass in `src/middleware.ts`
- [ ] **SEC-032** — Verify embedded entitlements show `aps-environment = production` on every Release archive
- [ ] **SEC-033** — Reduce `pp_onboarded` cookie from 1 year to 30 days; refresh on use

---

## Suggested Fix Order

Ordered by: unblock others first → enable CI early → visible test-user breakage → big architectural changes → auth/upload hardening → consolidation.

### Phase 1 — Quick hygiene (< 1 day, low risk, unblock everything else)

1. **SEC-027** — Resolve gitignore vs tracked `capacitor.config.ts` (5 min)
2. **SEC-026** — Fix `cap:sync` BSD `sed` so it works on any machine (15 min)
3. **SEC-028** — Remove/move raw security notes from repo root (15 min)
4. **SEC-020** — Derive Supabase media host from env var instead of hardcoding (30 min)
5. **SEC-017** — Add Zod lat/lng range + `isFinite` validation to `/api/location` (30 min)

### Phase 2 — Set up CI (gates all future work)

6. **SEC-024** — Add GitHub Actions CI workflow + branch protection on `dev`/`master`

### Phase 3 — Fix what's broken for TestFlight testers right now

7. **SEC-023** — Set `APPLE_TEAM_ID` env var + add `associated-domains` entitlement (Universal Links)
8. **SEC-008** — Change photo upload default from `"approved"` → `"pending"` (one-line fix)
9. **SEC-012** — Verify Supabase Realtime RLS on `dm_messages`, `profiles`, `friendships` with a non-participant test account
10. **SEC-025** — Implement `unblock_user()` RPC to properly reverse `block_user()` side effects

### Phase 4 — Core privacy & data integrity architecture (DB/RPC changes)

11. **SEC-003** — Snap returned coordinates to ~100 m grid server-side in `/api/nearby`
12. **SEC-005** — Add per-user soft-delete flags to `dm_threads`/`dm_messages` (schema migration)
13. **SEC-004** — Move proximity check into `record_meeting` RPC using persisted `user_locations`
14. **SEC-018** — Move proximity check into `collect_coin_bot` RPC (same pattern as SEC-004)

> Do SEC-004 and SEC-018 together — they are the same pattern and share the RPC approach.

### Phase 5 — Auth & upload security (touches more code paths)

15. **SEC-009** — Add server-side magic-byte sniff + `sharp` re-encode to upload pipeline
16. **SEC-011** — Add Origin check + HMAC nonce to `/auth/native-handoff`
17. **SEC-013** — Fix account deletion: `admin.signOut(userId, 'global')` + hard-delete job + API lockout on `deleted_at`

### Phase 6 — Consolidation (refactor after auth flows are stable)

18. **SEC-014** — Centralize all URL safety validation into one `isSafeInternalPath()` helper
