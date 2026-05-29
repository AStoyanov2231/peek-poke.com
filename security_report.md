# Security Review Report

Date: 2026-05-05

Scope: Static review of the Next.js/Supabase/Stripe codebase, focused on release-blocking bugs, authorization flaws, privacy leaks, unsafe input handling, dependency risk, and verification health. Supabase database policies/functions were not present in this checkout, so RPC/RLS-dependent conclusions should be verified against the live Supabase schema before release.

## Executive Summary

Do not treat this build as public-release ready yet. The most serious issue is live location privacy: exact user coordinates are published to a single global Supabase presence channel and filtered only on the client. There are also destructive DM endpoints that allow either thread participant to clear/delete the shared conversation, broad realtime subscriptions that need RLS confirmation, upload validation gaps, and failing tests around moderation and key UI flows.

## Critical / High Findings

1. **[FIXED] Exact live geolocation is exposed through a global client presence channel**

2. **Any participant can delete/clear the shared DM thread for both users** *(by design)*
   - Evidence: `src/app/api/dm/[threadId]/delete/route.ts:12` only checks thread participation, then `:19-33` marks all messages deleted and hard-deletes the thread. `src/app/api/dm/[threadId]/messages/route.ts:12` also only checks participation, then `:20-37` marks all thread messages deleted and clears the preview.
   - Impact: One user can destroy the other participant's message history and thread record. This is a data-integrity and abuse issue for a public messaging product.
   - Fix before release: Make deletion per-user with a participant-specific hidden/deleted state, or require explicit two-sided deletion. If global deletion is intended for moderation only, move it behind an admin/moderator route.

3. **[FIXED] Broad realtime table subscriptions may leak private rows unless Supabase RLS/realtime policies are airtight**

4. **[FIXED] Moderation authorization/test coverage is failing**

## Medium Findings

5. **[FIXED] Profile photo approval is bypassed on upload**

6. **Image upload validation trusts client-provided MIME type** *(by design)*
   - Evidence: `src/lib/upload.ts:4-7` checks only `file.type`; `src/app/api/upload/route.ts:19-23` and `src/app/api/profile/photos/route.ts:48-56` then store the file under an image extension/content type.
   - Impact: A malicious client can mislabel non-image content. Browser risk is reduced by Supabase content type and size limits, but storage can still hold unexpected payloads and public URLs.
   - Fix: Validate magic bytes and decode/normalize images server-side before upload. Consider stripping metadata and rejecting SVG entirely unless intentionally supported.

7. **[FIXED] Photo update/delete queries rely on prior reads/RLS instead of carrying ownership into the mutation**

8. **[FIXED] Dependency audit reports a PostCSS advisory through Next**

## Verification Results

- `npm run build`: passed.
- `npm run lint`: **now works** (fixed — was broken due to `next lint` removal in Next.js 16). 16 pre-existing code warnings/errors surfaced; these are non-security issues to be addressed separately.
- `npm test`: **all 478 tests pass** (fixed — was 20 failures across 6 files).
- `npm audit --audit-level=high`: top-level PostCSS updated to 8.5.15 (resolves GHSA-qx2v-qp2m-jg93 for the hoisted package). Next.js bundles its own postcss@8.4.31 internally — requires a Next.js upgrade to fully clear. New Next.js advisories (GHSA-8h8q-6873-q5fj and others) surfaced post-review; these require a Next.js upgrade and are tracked separately.

## Release Checklist

- Block release until exact-location presence is redesigned or protected with verified server-side authorization.
- Block release until DM deletion semantics are changed or explicitly accepted as destructive for both users.
- Verify all Supabase RLS policies, RPC security definer settings, storage bucket policies, and Realtime policies outside this repo.
- ~~Repair lint/test commands so CI can fail the release on regressions.~~ *(done)*
- Add real authorization tests for non-participant DMs, non-moderator moderation access, private photos, and unrelated Realtime subscriptions.
