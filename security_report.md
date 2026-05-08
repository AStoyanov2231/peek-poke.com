# Security Review Report

Date: 2026-05-05

Scope: Static review of the Next.js/Supabase/Stripe codebase, focused on release-blocking bugs, authorization flaws, privacy leaks, unsafe input handling, dependency risk, and verification health. Supabase database policies/functions were not present in this checkout, so RPC/RLS-dependent conclusions should be verified against the live Supabase schema before release.

## Executive Summary

Do not treat this build as public-release ready yet. The most serious issue is live location privacy: exact user coordinates are published to a single global Supabase presence channel and filtered only on the client. There are also destructive DM endpoints that allow either thread participant to clear/delete the shared conversation, broad realtime subscriptions that need RLS confirmation, upload validation gaps, and failing tests around moderation and key UI flows.

## Critical / High Findings

1. **Exact live geolocation is exposed through a global client presence channel**
   - Evidence: `src/hooks/useNearbyPresence.ts:49` joins `user-locations`; `src/hooks/useNearbyPresence.ts:80-87` publishes `userId`, profile fields, exact `lat`, and exact `lng`; `src/hooks/useNearbyPresence.ts:57-67` reads the full channel presence state and filters distance locally.
   - Impact: Any authenticated user or modified client can join the same channel, read every active user's exact coordinates, spoof their own location/profile payload, or enumerate users by moving their reported location.
   - Fix before release: Move proximity matching server-side. Do not broadcast exact coordinates globally. Use authenticated server/RPC matching, coarse geohashes or region channels, strict Realtime authorization, short TTLs, and never trust client-reported proximity for rewards or privacy decisions.

2. **Any participant can delete/clear the shared DM thread for both users**
   - Evidence: `src/app/api/dm/[threadId]/delete/route.ts:12` only checks thread participation, then `:19-33` marks all messages deleted and hard-deletes the thread. `src/app/api/dm/[threadId]/messages/route.ts:12` also only checks participation, then `:20-37` marks all thread messages deleted and clears the preview.
   - Impact: One user can destroy the other participant's message history and thread record. This is a data-integrity and abuse issue for a public messaging product.
   - Fix before release: Make deletion per-user with a participant-specific hidden/deleted state, or require explicit two-sided deletion. If global deletion is intended for moderation only, move it behind an admin/moderator route.

3. **Broad realtime table subscriptions may leak private rows unless Supabase RLS/realtime policies are airtight**
   - Evidence: `src/hooks/useRealtimeDM.ts:113-121` subscribes to all `dm_messages` inserts and `:157-162` all updates. `src/hooks/useRealtimeProfiles.ts:24-32` subscribes to all profile updates. `src/hooks/useRealtimeFriendships.ts:71-79` subscribes to all friendship changes.
   - Impact: If Realtime publication/RLS is permissive or misconfigured, clients can receive private messages, profile updates, and friendship events for unrelated users. The app code itself does not scope these subscriptions by user/thread.
   - Fix before release: Verify Supabase Realtime RLS with a non-participant account. Prefer private, per-user or per-thread channels, or filters that include only authorized rows. Add integration tests that prove unrelated users do not receive events.

4. **Moderation authorization/test coverage is failing**
   - Evidence: `npm test` failed with `src/app/api/__tests__/moderation.test.ts`: the "returns 403 for non-moderator" test expected 403 but got 200.
   - Impact: This may be a stale mock, but for release review it means the moderator gate is not currently covered by a trustworthy green test. If real, non-moderators can list photos awaiting moderation.
   - Fix before release: Repair the test/mocks and verify `/api/moderation/photos` and `/api/moderation/photos/:id` with real non-moderator, moderator, and admin users.

## Medium Findings

5. **Profile photo approval is bypassed on upload**
   - Evidence: `src/app/api/profile/photos/route.ts:79-90` inserts new profile photos with `approval_status: "approved"`.
   - Impact: User-uploaded photos become immediately approved, making the moderation queue ineffective for newly uploaded content.
   - Fix: Default uploads to `pending` unless this is a deliberate post-moderation flow.

6. **Image upload validation trusts client-provided MIME type**
   - Evidence: `src/lib/upload.ts:4-7` checks only `file.type`; `src/app/api/upload/route.ts:19-23` and `src/app/api/profile/photos/route.ts:48-56` then store the file under an image extension/content type.
   - Impact: A malicious client can mislabel non-image content. Browser risk is reduced by Supabase content type and size limits, but storage can still hold unexpected payloads and public URLs.
   - Fix: Validate magic bytes and decode/normalize images server-side before upload. Consider stripping metadata and rejecting SVG entirely unless intentionally supported.

7. **Photo update/delete queries rely on prior reads/RLS instead of carrying ownership into the mutation**
   - Evidence: `src/app/api/profile/photos/[photoId]/route.ts:115-120` verifies ownership, but `:127-130` deletes by `id` only; `:92-97` updates by `id` only after an ownership read.
   - Impact: If RLS is ever weakened, a race or logic bug could mutate another user's photo. This is easy to harden.
   - Fix: Add `.eq("user_id", user.id)` to photo update/delete mutations too.

8. **Dependency audit reports a PostCSS advisory through Next**
   - Evidence: `npm audit --audit-level=high` returned 2 moderate vulnerabilities: PostCSS `<8.5.10`, via Next, advisory `GHSA-qx2v-qp2m-jg93`.
   - Impact: Moderate XSS advisory in CSS stringify output. `npm audit` did not report high/critical issues.
   - Fix: Track a Next/PostCSS upgrade path. Do not run `npm audit fix --force` blindly because npm suggests a breaking downgrade path.

## Verification Results

- `npm run build`: passed.
- `npm run lint`: failed because `next lint` is no longer valid in the installed Next version; the script reports `Invalid project directory provided ... /lint`.
- `npm test`: failed. Result: 50 test files passed, 6 failed; 620 tests passed, 20 failed.
- `npm audit --audit-level=high`: completed after registry access approval; no high/critical advisories, 2 moderate PostCSS advisories.

## Release Checklist

- Block release until exact-location presence is redesigned or protected with verified server-side authorization.
- Block release until DM deletion semantics are changed or explicitly accepted as destructive for both users.
- Verify all Supabase RLS policies, RPC security definer settings, storage bucket policies, and Realtime policies outside this repo.
- Repair lint/test commands so CI can fail the release on regressions.
- Add real authorization tests for non-participant DMs, non-moderator moderation access, private photos, and unrelated Realtime subscriptions.
