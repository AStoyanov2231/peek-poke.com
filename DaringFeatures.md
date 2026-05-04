# Peek & Poke Dating Transformation — Plan

Pivot existing social/friends app into Tinder-style dating product with map as discovery surface. Build phased on top of current Next.js + Supabase + Stripe codebase.

Each phase = one branch off `dev`, one PR. Phases ship in order. Phase 0 unblocks everything else.

---

## Master TODO

- [x] Phase 0 — Schema foundation
- [x] Phase 1 — Dating preferences + age gate
- [x] Phase 2 — Onboarding redesign
- [x] Phase 3 — Poke loop + mutual match (Tinder MVP playable)
- [x] Phase 4 — Match inbox + 72h expiration
- [ ] Phase 5 — Selfie verification
- [ ] Phase 6 — Map differentiator
- [ ] Phase 7 — Voice intro + video bio
- [ ] Phase 8 — Connection (Meet-IRL, post-date pulse)
- [ ] Phase 9 — Safety (Date Guardian, panic button, AI mod)
- [ ] Phase 10 — Premium + Platinum tiers
- [ ] Phase 11 — Coin sinks (Boost, Super Poke, Rewind, Rematch, Unblur)
- [ ] Phase 12 — Retention (streaks, insights, pause profile)
- [ ] Phase 13 — QoL (keyword blocks, mutual friends)

---

## Phase 0 — Schema Foundation

**Adds:** `platinum` role · dating columns on `profiles` (DOB, gender, orientation, height, relationship goal, smoking/drinking/kids, verified flag, ghost/incognito flags) · new tables: `dating_preferences`, `pokes`, `matches`, `passes`, `daily_action_counters` · new constants in `src/lib/constants.ts` · types added to `src/types/database.ts` · helper `isPlatinum`, `isVerified`, `profileAge`.

**Why first:** every later phase reads/writes these. Nothing else compiles without them.

**Done when:** migrations applied via Supabase MCP, types updated, factories updated, tests green.

---

## Phase 1 — Dating Preferences + Age Gate

**Features:**
1. **Dating preferences** — gender(s) interested in, age range, distance, dealbreakers (smoking/drinking/kids/relationship goal), verified-only filter, women-only mode toggle. Persisted in `dating_preferences` table.
2. **Age gate** — DOB required at signup, 18+ enforced server-side via middleware redirect + API guard. Sub-18 blocked at every entry point.
3. **Settings UI** — bottom sheet for editing prefs, distance slider capped at `FREE_DISTANCE_KM` for free users, advanced filters gated to premium.

**Done when:** GET/PUT `/api/dating/preferences` works, store has `datingPreferences` slice, settings sheet edits persist, sub-18 user can't reach `/`.

---

## Phase 2 — Onboarding Redesign

**Features:**
1. **Multi-step dating onboarding** — DOB → identity (gender/orientation/height) → preferences → dealbreakers → photos → review.
2. **4+ photo hard rule** — can't finish onboarding without 4 approved photos.
3. **Re-onboarding for legacy users** — middleware routes existing accounts missing `dating_onboarding_completed` through the same flow.

**Done when:** new + existing users land on `/onboarding/dating`, walk all steps, end with `dating_onboarding_completed = true` and ≥4 photos.

---

## Phase 3 — Poke Loop + Mutual Match (Tinder MVP)

**Features:**
1. **Poke** — replaces friend-request as primary signal. One direction. Stored in `pokes` table.
2. **Mutual match** — when both users have active pokes, server creates a `matches` row + a `dm_threads` row atomically. Triggers a "It's a match!" celebration overlay.
3. **Pass** — left-swipe records a `passes` row, hides target for 30 days.
4. **Candidate feed** — `get_match_candidates` RPC returns nearby singles filtered by viewer's prefs, excluding passed/poked/matched/blocked.
5. **Swipe stack UI** — Tinder-style card deck on `/discover`. Heart, X, Star buttons. Drag-to-swipe. Daily quota for free users (10/day).

**Done when:** two test accounts can poke each other, match is created, both land in shared DM thread.

---

## Phase 4 — Match Inbox + 72h Expiration

**Features:**
1. **Matches tab** — separate inbox surface listing active matches sorted by recency.
2. **72h expiration** — match dies if no DM is sent within 72h. Trigger sets `first_message_at` on first message, removing the timer.
3. **Unmatch** — one-tap unmatch, sets `unmatched_at` and removes thread from both sides.
4. **Realtime sync** — matches appear/disappear live via Supabase channel.

**Done when:** matches list renders with countdown badges, expired matches drop off, unmatch removes from both users.

---

## Phase 5 — Selfie Verification

**Features:**
1. **Verification flow** — random pose challenge (tilt left/right/thumbs up), camera capture, server-side face match against avatar.
2. **Verified badge** — blue shield icon on profile cards and swipe cards when `verified_at` set.
3. **Coin reward** — +50 coins on first successful verification.
4. **Rate limit** — max 3 attempts/day; selfies deleted after decision regardless of outcome (privacy).

**Dependency flag:** needs `@vladmandic/face-api` — confirm with user before installing.

**Done when:** verification flow passes for own face, fails for stranger's face, badge renders.

---

## Phase 6 — Map Differentiator

**Features:**
1. **Approximate location** — broadcasted location is jittered within 200m blob, deterministic per 30-min window. Real GPS never leaves device.
2. **Ghost mode** (premium) — hide self from map while still browsing.
3. **Heat zones** — semi-transparent map overlay showing density of active singles aggregated to ~250m cells.
4. **Date pin drop** — pick venue on map, propose to match, both confirm → date pin visible only to the two participants for 7 days.
5. **Walk-by detection** — daily job compares location histories, surfaces "you almost met X today" cards.
6. **Travel mode** (premium) — set future location for upcoming trip, candidate query honors it.
7. **Live events** — admin-created event pins with RSVP; tap reveals attendee avatars.

**Done when:** all seven layers wired into MapView with toggles, privacy guarantees verified.

---

## Phase 7 — Voice Intro + Video Bio

**Features:**
1. **15s voice intro** — recorded in-app, plays on swipe card and full profile.
2. **30s video bio** — vertical clip, autoplay muted on profile.
3. **Moderation** — both pass through approval queue same as photos.
4. **Native capture** — on iOS/Android, native bridge handles recording for better quality.

**Done when:** record → upload → moderate → render on cards. One voice + one video per user.

---

## Phase 8 — Connection Flow

**Features:**
1. **Meet-IRL prompt** — when matched users are within 50m for 30s, both get a confirm prompt. Mutual confirm = official meet, awards coins, unlocks photo-share in chat.
2. **Post-date pulse** — 12h after meet, private feedback: spark / no spark / felt unsafe. Never visible to other party.
3. **Unsafe escalation** — 3+ "unsafe" ratings in 30 days → auto-flag for moderator review.
4. **Second-date nudge** — 48h after meet with no DMs → system message in thread "It's been a couple days — say hi 👋".

**Done when:** Meet-IRL prompt fires on proximity, feedback writes a private row, system messages auto-post 48h later.

---

## Phase 9 — Safety

**Features:**
1. **Trusted contacts** — store up to 3 emergency contacts (name + phone).
2. **Date Guardian** — start a session before a date, contact gets a public share-link tracking your live location for N hours.
3. **Panic button** — hold-to-trigger 3s, SMS all trusted contacts with GPS link. On native: also call emergency services.
4. **AI message moderation** — outgoing DMs scanned; severe content blocked, borderline content flagged for moderators.
5. **Women-only mode** — when enabled, only counts pokes from women (Bumble-style first move).
6. **Verified-only filter** — show only verified profiles in candidate feed.

**Dependency flags:** `libphonenumber-js`, `twilio` — confirm with user.

**Done when:** trusted contact gets the share-link SMS, panic button fires SMS, women-only mode enforced in match RPC.

---

## Phase 10 — Premium + Platinum Tiers

**Features:**
1. **Two paid tiers** — Premium ($9.99/mo) and Platinum ($19.99/mo). Stripe wired with monthly + yearly prices.
2. **Webhook tier handling** — `subscriber` role for Premium, `platinum` role for Platinum. Single tier at a time enforced.
3. **`/upgrade` page** — comparison table + checkout buttons, contextual headlines via `?reason=`.
4. **Feature gate hook** — `useGate(feature)` central source of truth for what each tier unlocks.
5. **"Who poked you" surface** — blurred row at top of Discover; unlock = upgrade. Highest-converting CTA.

**Done when:** both tiers checkoutable, webhook grants/revokes correct role, all gated features check via `useGate`.

---

## Phase 11 — Coin Sinks

**Features:**
1. **Boost** (50 coins) — 30-min priority placement at top of nearby stacks.
2. **Super Poke** (25 coins) — pre-highlights you in target's stack, sends notification.
3. **Rewind** (10 coins) — undo last pass.
4. **Rematch** (30 coins) — revive an expired/unmatched match.
5. **Profile Unblur** (100 coins) — see private photos of a non-match for 24h.
6. **Coin packs** — Stripe one-time checkout for 50 / 120 / 300 / 1000 coin packs.

All call shared `spend_coins` RPC with feature-specific reason. Insufficient balance → 402 with upgrade CTA.

**Done when:** every sink debits coins atomically, Stripe top-up flow credits coins on webhook.

---

## Phase 12 — Retention

**Features:**
1. **Daily login streaks** — +5 coins per consecutive day, flame icon in topbar with current streak.
2. **Profile insights** — "X people peeked you this week" (count for Premium, named list for Platinum).
3. **Read receipts toggle** — Premium-only, mutual: if either party off, neither sees receipts.
4. **Pause profile** — hides from map + candidate feed without deleting account.

**Done when:** streak increments, insights show real data, pause hides user.

---

## Phase 13 — QoL

**Features:**
1. **Keyword blocks** — user maintains list (max 30) of words; incoming DMs containing any are auto-hidden.
2. **Mutual friends on profile** — show up to 5 mutual-friend avatars on viewer's profile.

**Done when:** blocked-keyword DMs don't render for recipient, mutual friends row visible.

---

## Phase 14 (Later — Separate Plan)

AI photo coach, AI prompt assistant. Out of scope here. Brainstorm + write its own plan when AI provider chosen.

---

## Cross-Phase Notes

- **Branching:** every phase = `feature/<phase-slug>` off `dev`, one PR.
- **Tests:** TDD per task — vitest already configured, mocks in `test/mocks/`, factories in `test/helpers/factories.ts`.
- **Verification gate per phase:** `npm run build && npm run lint && npm test` all pass.
- **Migrations:** applied via Supabase MCP, no local migrations folder.
- **No new deps without asking** — three flagged in Phases 5/9.
- **First demo-able milestone:** end of Phase 4 (real users can match + chat). Beta test before Phase 5.
- **Doc upkeep:** `project_overview.md` updated in every PR that adds tables/routes/hooks.
