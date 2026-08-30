# Work task 07 — Prove production readiness

Implement only Delivery Plan point 7 from `ProductionArchitecturePlan.md`, after work tasks 01–06 pass their exit criteria. This task proves and releases the architecture; it must not add speculative infrastructure.

## Implementation

1. **Complete the production test matrix**
   - Cover DTO schemas, authorization/RLS, cursor stability, idempotency, database concurrency invariants, Realtime authorization/reconnect/backfill, and outbox retry/dead-letter behavior.
   - Run shared end-to-end contract journeys against the web, iOS, and Android clients using isolated production-like data.

2. **Load-test measured hot paths**
   - Model the agreed 100k-DAU traffic shape, including realistic concurrency, payloads, reads/writes, reconnects, and provider latency.
   - Test Auth, profile, nearby, inbox, message send/read, Realtime fan-out, and worker backlog separately and together.
   - Record environment, dataset, scripts, thresholds, results, bottlenecks, and cost assumptions so tests are repeatable.

3. **Set operational gates**
   - Define SLOs and alerts for latency, availability/error rate, saturation, database/RPC time, queue age, Realtime delivery/reconnects, cache hit rate, and cost per active user.
   - Create concise runbooks with owners, diagnosis queries, safe mitigations, escalation, and rollback for each alert.

4. **Release without a big bang**
   - Ship additive contracts and migrations first, canary web/API, then promote EAS development to preview/internal testing and production.
   - Validate iOS through TestFlight and Android through internal/closed tracks before store rollout.
   - Remove legacy endpoints only when logs prove no supported client uses them and rollback has been rehearsed.
   - Allow OTA only when the bundle matches the installed native runtime; native module, entitlement, permission, or config changes require a new binary.

5. **Use evidence for future scaling**
   - Define measured capacity triggers for partitioning, read replicas, regional topology, or a separate event plane.
   - Do not introduce those systems unless load and production telemetry show the current primary is the bottleneck.

## Verification and completion

- Pass the full automated suite, production build, security checks, load thresholds, and real-device critical journeys on both platforms.
- Rehearse application, migration, worker, and mobile rollback; retain evidence and owners for any accepted exception.
- Observe the canary through the agreed window with SLOs green before wider rollout.

The task is complete when SLOs pass under the agreed load model, web/iOS/Android contract and device flows pass, rollback is proven, and release requires no coordinated big-bang migration.
