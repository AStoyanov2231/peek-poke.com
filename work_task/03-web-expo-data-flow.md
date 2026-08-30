# Work task 03 — Simplify web and Expo data flow

Implement only Delivery Plan point 3 from `ProductionArchitecturePlan.md`, using the shared contracts from work task 02. Migrate screen by screen so the app remains releasable.

## Implementation

1. **Replace preload with bootstrap**
   - Reduce bootstrap to identity, onboarding state, roles, feature/config versions, and unread summary.
   - Add bounded query functions for profile, friends, inbox, messages, nearby, photos, and admin data; execute them only when the owning screen opens.

2. **Create one remote-state path**
   - Centralize TanStack Query keys, typed fetch functions, stale times, retries, cancellation, invalidation, and optimistic updates for web and Expo.
   - Collapse duplicate in-flight requests through shared query keys. Retry safe reads only; require idempotency before retrying writes.
   - Make mutations update or invalidate the narrow affected queries instead of refetching bootstrap or entire collections.

3. **Migrate ownership screen by screen**
   - Move each remote entity from Zustand/preload hydration to TanStack Query, verify the screen, then remove only the obsolete mirror and cache glue.
   - Keep Zustand for drafts, active-call state, and transient device/UI state only.
   - Remove the old preload endpoint/provider only after production-supported web and native clients no longer call it.

4. **Harden Expo behavior**
   - Keep bearer tokens in the existing Supabase/SecureStore-backed session path and expose only public build-time configuration.
   - Wire Query focus/online state to app foreground/background and network state; persist only explicitly offline-capable queries.
   - Keep route entries in `apps/native/app` and reusable screens, hooks, API code, and platform adapters in `apps/native/src`.
   - Reuse the development build unless native dependencies, permissions, entitlements, or configuration change.

## Verification and completion

- Add query-key, deduplication, cache-update, cancellation, lifecycle, auth-storage, and screen-loading tests.
- Measure request count and payload bytes for cold start and each main screen before and after migration.
- Run lint, web/native type-checks, unit/security tests, production build, and web/iOS/Android smoke flows.

The task is complete when each screen fetches only its bounded data, duplicate requests coalesce, remote entities have one TanStack Query owner, and all clients use the shared contract.
