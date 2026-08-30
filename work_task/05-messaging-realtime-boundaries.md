# Work task 05 — Rebuild messaging and Realtime boundaries

Implement only Delivery Plan point 5 from `ProductionArchitecturePlan.md`. Roll out additively so old supported clients continue working until the new path is proven.

## Implementation

1. **Make messaging transactional**
   - Add migrations for per-thread message sequence numbers, client UUID uniqueness, participant read sequences, `thread_members`, and an outbox record.
   - Implement one database transaction/RPC that authorizes membership and blocking state, deduplicates the client UUID, assigns the sequence, creates the complete `MessageDTO`, updates the thread read model, and inserts the outbox event.
   - Replace per-message read writes with monotonic per-participant read-sequence updates.

2. **Build scoped private Realtime**
   - Publish private per-user or per-thread Broadcast events only after transaction commit.
   - Authorize topic membership on connect and recheck it after friendship, block, deletion, or thread membership changes.
   - Keep typing and call signaling on private topics with expiry, rate limits, and no durable message-content dependency.

3. **Make reconnect deterministic**
   - Treat events as cache patches/invalidation hints; cursor APIs remain the source of truth.
   - Track the last received sequence and fetch cursor backfill on reconnect, app resume, sequence gaps, or failed patches.
   - Derive inbox order, unread count, last message, and last-read sequence from `thread_members` using indexed constant-time queries.

4. **Remove broad subscriptions and Presence**
   - Replace global Presence with thread, friend, or geo-cell scope; use `last_seen_at` where live state is unnecessary.
   - Dual-run and compare the scoped path before disabling unfiltered `dm_messages` Postgres Changes and legacy read/presence behavior.

## Verification and completion

- Test concurrent sends, UUID replay, sequence ordering, blocked/non-member access, monotonic reads, topic authorization, reconnect gaps, backfill, expiry, and rate limits.
- Load-test inbox, send/read, and fan-out; compare query time and delivered/unnecessary events with the baseline.
- Run migration rollback rehearsal, contract/security tests, build, and real web/iOS/Android message/call flows.

The task is complete when clients receive only authorized events, reconnect without losing state, duplicate sends are harmless, and send/read costs remain constant as history grows.
