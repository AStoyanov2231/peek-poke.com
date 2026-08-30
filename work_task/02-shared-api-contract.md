# Work task 02 — Create the shared API contract

Implement only Delivery Plan point 2 from `ProductionArchitecturePlan.md`, after work task 01 is complete. Keep existing endpoints compatible while clients migrate.

## Implementation

1. **Define the versioned contract**
   - Put Zod request/response schemas and inferred types in `packages/shared`; screens must not define duplicate transport types.
   - Add explicit `Bootstrap`, `ProfileCard`, `ProfileView`, `Friend`, `ThreadSummary`, `Message`, `NearbyUser`, and moderation DTOs.
   - Create server-side mappers that select named columns and convert database results to DTOs. Never return table rows or `table.*` JSON.

2. **Standardize protocol behavior**
   - Define one error envelope with stable codes, safe messages, request IDs, and consistent `401`/`403` behavior.
   - Standardize UTC timestamps, opaque versioned cursors, maximum page sizes, and idempotency-key validation for retryable mutations.
   - Use stable `(sort_value, id)` cursor ordering and add required indexes so pagination cannot skip or duplicate records.

3. **Migrate routes incrementally**
   - Add hard limits and cursors to friends, requests, threads, messages, search, photos, and moderation queues.
   - Make each mutation return its final DTO so callers do not issue an immediate follow-up GET.
   - Convert one domain at a time, keeping an additive compatibility adapter until supported web and native clients use the new response.

4. **Share fixtures and clients**
   - Add canonical valid/error/pagination fixtures in `packages/shared`.
   - Validate both web and Expo transports against the same schemas and fixtures; centralize endpoint input/output typing in their API layers.

## Verification and completion

- Add schema, mapper, cursor, authorization, error-envelope, idempotency, and compatibility tests.
- Run lint, web/native type-checks, unit/security tests, and the production build.
- Prove every list has a hard maximum, consecutive cursor pages are stable, mutations need no refetch, and core responses contain no wide database JSON.

The task is complete when web and native contract tests consume identical fixtures and every core endpoint is bounded, explicitly mapped, and backward-compatible during rollout.
