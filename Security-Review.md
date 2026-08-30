# Security Review: Peek & Poke

## Release decision

**NO-GO for the first public release until the high-severity location finding is fixed and the medium findings are either fixed or explicitly risk-accepted after live verification.**

This Codex Security Deep Scan reviewed the complete repository at revision `4c8a524dc8a3cfa119afb10db69babbfcadaeebb` across the web application/backend and the connected iOS and Android clients. It reviewed 702 files and assessed 37 security candidates.

Validated findings: **8** — 1 high, 4 medium, 3 low. Static coverage is partial because 12 deployment, hosted-service, or device-runtime questions require live evidence.

## Validated vulnerabilities

### 1. High — Client-controlled location enables surveillance and reward fraud

- CWE: CWE-359, CWE-862, CWE-345, CWE-602, CWE-840
- Evidence: `src/app/api/location/route.ts:10-18`, `src/app/api/nearby/route.ts:24-35`, `src/app/api/coins/meeting/route.ts:149-159`, `supabase/migrations/20260807182907_bounded_nearby_discovery.sql:33-90`
- Attack path: any authenticated modified client or direct API caller can submit arbitrary coordinates. The backend stores those coordinates as authoritative, uses them as the nearby-search center, and uses fresh stored coordinates as proof of physical proximity for meeting rewards.
- Impact: arbitrary-area enumeration of dating-app users and fraudulent reward issuance. Radius, freshness, blocking, friendship, idempotency, and rate limits constrain scale but do not prove physical presence.
- Fix: do not treat caller coordinates as proof of presence. Add attested and risk-scored location signals, impossible-travel and automation detection, and independent server-verifiable evidence for meeting rewards.

### 2. Medium — Deployment-wide MCP secret exposes exact nearby-user locations

- CWE: CWE-200, CWE-862, CWE-284, CWE-359
- Evidence: `src/app/api/[transport]/route.ts:302-402`, `src/app/api/[transport]/route.ts:415-430`, `src/lib/supabase/server.ts:62-74`
- Attack path: anyone issued or obtaining `MCP_API_SECRET` can invoke service-role-backed location tools without a product-user identity, viewer-specific block rules, or consent checks. Results include user identities and exact coordinates around a fixed center.
- Impact: broad privacy exposure from a single deployment-wide integration credential.
- Fix: use short-lived scoped credentials, bind every request to a product viewer, enforce block/consent rules inside the RPC, coarsen location, and return only minimum fields.

### 3. Medium — Multipart upload routes buffer bodies before enforcing size limits

- CWE: CWE-400, CWE-770
- Evidence: `src/lib/upload.ts:132-138`, `src/app/api/upload/route.ts:12-20`, `src/app/api/profile/cover/route.ts:14-35`, `src/app/api/profile/photos/route.ts:62-95`
- Attack path: an authenticated caller sends a lengthless or understated multipart body. `validateUploadBodySize` accepts a missing `Content-Length`, and each route calls `request.formData()` before per-file checks, allowing memory and CPU consumption before application limits run.
- Impact: repeatable availability and cost pressure. A Vercel platform cap may reduce impact but was not proven.
- Fix: enforce a trusted byte cap before parsing and use streaming multipart parsing with hard byte and part limits.

### 4. Medium — Stripe webhook buffers unauthenticated bodies before size and signature checks

- CWE: CWE-400, CWE-770
- Evidence: `src/app/api/stripe/webhook/route.ts:14-23`
- Attack path: any internet caller sends a lengthless or understated request. The route calls `req.text()` before checking actual bytes and before Stripe signature verification.
- Impact: unauthenticated availability and cost pressure.
- Fix: apply a trusted pre-handler body cap and bounded raw-body reader, then verify the signature immediately against the exact bounded body.

### 5. Medium — Uploaded images are stored without normalization or decoded-image limits

- CWE: CWE-400, CWE-434, CWE-770, CWE-20, CWE-409, CWE-200
- Evidence: `src/lib/upload.ts:39-58`, `src/lib/upload.ts:78-130`, `src/lib/upload.ts:174-200`, `src/app/api/upload/route.ts:18-91`, `src/app/api/profile/cover/route.ts:31-45`, `src/app/api/profile/photos/route.ts:81-128`, `src/server/outbox/profile-media.ts:267-274`
- Attack path: DM, cover, and profile-photo flows check declared MIME, compressed size, and short magic bytes, then store the original bytes. The bounded `normalizeImageFile` helper has no call sites. Approved profile images are copied byte-for-byte to public storage.
- Impact: retained EXIF GPS/device metadata can become public; pathological decoded images can create downstream resource pressure.
- Fix: normalize every image before storage, enforce pixel/dimension/frame/memory limits, strip metadata, re-encode to an allowlisted format, and promote only normalized bytes.

### 6. Low — Authentication responses disclose account state

- CWE: CWE-204
- Evidence: `apps/native/app/(auth)/login.tsx:197-210`, `src/features/auth/actions.ts:41-45`, `src/features/auth/actions.ts:115-123`, `src/features/auth/actions.ts:168-176`
- Attack path: public sign-in and signup flows map provider errors to distinct messages for unconfirmed and already-registered accounts.
- Impact: account and confirmation-state enumeration that can aid phishing or credential attacks. Hosted Supabase normalization may narrow the oracle and must be tested.
- Fix: return generic, timing-comparable responses for all account states; log details only server-side and add authentication abuse controls.

### 7. Low — Service-role bot listing endpoint lacks rate limiting

- CWE: CWE-770
- Evidence: `src/app/api/bots/route.ts:14-33`, `apps/native/src/data/discovery/api.ts:64-69`
- Attack path: any authenticated user can repeatedly invoke `GET /api/bots`, which calls the service-role-backed `list_admin_coins_for_user` RPC without the limiter used by the sibling mutation route.
- Impact: database work and cost amplification of presently unmeasured magnitude.
- Fix: add a durable per-user limiter and bound or paginate the RPC.

### 8. Low — Concurrent DM media uploads can exceed quotas

- CWE: CWE-367, CWE-770
- Evidence: `src/lib/upload.ts:140-171`, `src/app/api/upload/route.ts:12-44`, `src/app/api/upload/route.ts:64-102`
- Attack path: parallel requests can observe the same list-and-sum storage snapshot, all pass admission, and then upload distinct objects because the quota check and write are not atomic.
- Impact: per-user byte and object quota overrun and added storage cost.
- Fix: atomically reserve bytes and object count before upload, commit on success, release on failure, and reconcile storage/accounting drift.

## Required live follow-up before release

These candidates remain unresolved because their decisive controls exist outside the checked-in source or require release-runtime evidence:

1. Confirm that nearby discovery precision and audience have explicit user consent and an opt-out.
2. Verify the production edge strips and reconstructs forwarding headers used by the MCP rate limiter.
3. Verify current Supabase leaked-password protection.
4. Verify current Supabase Auth rate limits, CAPTCHA, bot detection, and credential-abuse controls.
5. Verify canonical `Host`/forwarded-host behavior for OAuth callbacks.
6. Exercise iOS and Android deep-link decoding for profile-report route parameters.
7. Exercise iOS and Android deep-link decoding for DM edit/delete identifiers and prove no cross-endpoint rewrite.
8. Inspect private-storage migration backups for live signed URLs, grants, retention, and expiry.
9. Decide and document DM read-receipt behavior after blocking or peer deletion.
10. Reconcile production Supabase migrations, functions, grants, policies, and advisors against this revision.
11. Inspect the deployed MCP Apps iframe sandbox/origin before accepting the map-widget message/XSS boundary.
12. Verify canonical host handling in authentication middleware redirects.

Also verify the production Vercel request-body cap, the actual audience and network reachability of the MCP transport, and release-build native API base URLs and deep-link restrictions.

## Reviewed candidates not reported as vulnerabilities

The scan also reviewed and rejected or marked not applicable: invite deep-link interpolation; current CSP looseness without an injection primitive; automatic signed-invite acceptance; arbitrary avatar URLs defeated by the database trigger; Stripe-returned redirect URLs without an attacker-controlled source; Android loopback cleartext exceptions without a remote production path; RLS-enabled `user_locations` with no policy because default behavior is deny; operator-only private-storage migration paths; DM cursor filter manipulation limited to an authorized thread; unvalidated ICE configuration requiring a stronger backend compromise; service-only DM media origins without an external caller; `npx react-doctor@latest` as a developer-only supply-chain risk; stale call insertion races with bounded downstream effects; operator-configured live-smoke credential destination; self-only push-token revocation without material availability impact; account-deletion storage and profile-erasure races whose demonstrated impact remains self-only; and authenticated call-state races constrained by later authorization and delivery checks.

## Verification boundary

This review is a static, source-backed assessment of the checked-out revision. It does not establish that the same revision and migrations are deployed, that hosted Supabase/Vercel controls are correctly configured, or that iOS and Android release builds behave securely on physical devices. Those live checks are release gates, not substitutes for the code fixes above.

Canonical sealed scan artifacts, including SARIF and the full deterministic report, are retained in the Codex Security scan workspace for scan `8d963759-a70d-45be-b10d-16d43a8e891e`.
