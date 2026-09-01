# Shared API contract v1

The contract is defined in `packages/shared/src/contract.ts` and exported from
`@peekpoke/shared`.
It contains explicit DTO schemas for bootstrap, profiles, friends, direct
messages and nearby users, QR rooms, photos, and moderation.

The additive Rooms client uses the QR-room contracts for room listing, room
creation, capability-based joining, bounded text messages, and monotonic read
state.
Physical table QR payloads are stable opaque identifiers with the
`pp-table-v1.` prefix.
The first valid table-code join creates its associated room, and later joins
resolve the same room without persisting the raw code.
Generated `pp-room-v1.` share payloads remain supported as a secondary invitation
option.
The restored map, direct-message, friendship, invite, call, and
location/discovery clients use their shared contracts.
Foreground location uses legacy client GPS rather than device attestation.
The server stores those locations with `verification_method = 'legacy_gps'` and
`verified_at = null`; nearby discovery uses recent rows, while
verified-location-only actions remain gated until an authorized
attestation/device-proof contract is promoted.

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
