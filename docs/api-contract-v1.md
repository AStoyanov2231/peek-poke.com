# Shared API contract v1

The contract is defined in `packages/shared/src/contract.ts` and exported from
`@peekpoke/shared`. It contains explicit DTO schemas for bootstrap, profiles,
friends, threads, messages, nearby users, photos, and moderation.

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
