# Shared API contract v1

The contract is defined in `packages/shared/src/contract.ts` and exported from
`@peekpoke/shared`.
It contains explicit DTO schemas for bootstrap, profiles, friends, legacy
direct messages and nearby users, QR rooms, photos, and moderation.

The current client flow uses the QR-room contracts for room listing, room
creation, capability-based joining, bounded text messages, and monotonic read
state.
Room QR payloads are opaque high-entropy capabilities with the
`pp-room-v1.` prefix; clients never use them as room identifiers.
Join scanners do not persist a payload after the join request, while a room
creator may hold the returned payload long enough to render or share it.
The legacy direct-message and location/discovery contracts remain available
for compatibility, but the current web and Expo room flow does not call them.

List responses keep the existing top-level field names during migration and
add a `pagination` object:

```json
{
  "items": [],
  "page": {
    "version": "v1",
    "next_cursor": null,
    "has_more": false,
    "limit": 20
  }
}
```

Legacy array responses, including user search, retain their array body and
carry the next cursor in `x-next-cursor` and `x-has-more` response headers.

All cursors are opaque `v1` values encoding the stable `(sort_value, id)`
tuple. Limits are capped at 100, with search capped at 50. Retryable
mutations validate an optional `Idempotency-Key` header and echo a valid key
for compatibility. Durable replay/deduplication remains part of the
messaging and workflow tasks.

The web helper at `src/lib/typed-api.ts` and Expo's `apiFetch` accept the same
Zod response schemas. Canonical fixtures live in
`packages/shared/src/fixtures.ts` and are exercised by the shared contract
test.

The additive index migration is
`supabase/migrations/20260730120000_shared_api_contract_indexes.sql`.
