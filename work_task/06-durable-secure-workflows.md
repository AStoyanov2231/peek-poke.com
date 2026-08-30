# Work task 06 — Make workflows durable and secure

Implement only Delivery Plan point 6 from `ProductionArchitecturePlan.md`, building on the transactional outbox introduced in work task 05. Keep privileged operations behind narrow server-only adapters.

## Implementation

1. **Build the outbox worker**
   - Claim bounded batches safely, record attempts and next-run time, use idempotent handlers, apply exponential backoff, and move exhausted work to a dead-letter state.
   - Add queue-age/failure metrics, alerts, replay tooling, retention, and a documented worker rollback/drain procedure.
   - Move push, email, analytics, storage cleanup, image processing, and cache invalidation from interactive requests one handler at a time.

2. **Make critical workflows recoverable**
   - Make Stripe receipt, event deduplication, entitlement projection, and outbox insertion atomic; add replay and reconciliation.
   - Change account deletion to disable-first, revoke access, enqueue observable cleanup steps, and support safe retries/resume.
   - Use direct scoped uploads where possible, or streaming where required, with atomic quota reservation and server-controlled privacy/moderation approval.

3. **Enforce database invariants**
   - Add reversible constraints, unique indexes, and transaction locks for avatar uniqueness, photo/interest limits, canonical friendship pairs, refund races, device tokens, and webhook/message idempotency.
   - Clean and validate existing data before enabling constraints; do not silently delete conflicting production records.

4. **Narrow privilege and abuse boundaries**
   - Default to caller-scoped RLS/RPCs and isolate service-role access per integration adapter and operation.
   - Layer rate limits by IP, device, account, target resource, and global capacity; financial and destructive writes must fail closed.
   - Add audit records for privileged, billing, moderation, deletion, replay, and dead-letter actions without storing sensitive payloads.

## Verification and completion

- Add failure-injection tests for provider outage, timeout, duplicate delivery, worker crash, race conditions, replay, and dead-letter recovery.
- Prove requests finish without waiting for moved providers and that reconciliation repairs interrupted billing/deletion workflows.
- Run isolated migrations, rollback drills, RLS/security tests, load tests, build, and staging smoke flows before production rollout.

The task is complete when provider failures retry safely, billing/deletion reconcile automatically, invariants hold under concurrency, and privileged access is narrow and auditable.
