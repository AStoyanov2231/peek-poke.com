# Supabase rollback instructions

## Deployed temporary-conversation layer

Migration `temporary_poke_conversations` was applied as `20260909002222`, taking MyaouDB from 183 to 184 migration entries.
The exact old function definitions, owners, grants, absent-object inventory, and 183-entry history were saved before deployment.
Use `.supabase-backups/temporary-chat-deployed-20260909/README.md` and its guarded `rollback.sql` to reverse this layer first.
The sealed archive is `.supabase-backups/MyaouDB-temporary-chat-deployed-rollback-20260909.tar.gz`, with its `.sha256` sidecar.
SHA-256: `1258b1856acc708c391e995bd920c8079d3bc33e85332d59631730b3903b90a6`.
All twelve payloads are hashed, and twenty-five local rollback assertions pass using the exact hosted `poke_status` enum.
The six deployed function definitions, owners, grants, two triggers, and index match this package's manifest exactly.
The package restores the old call-start and delayed-delivery functions, removes the added conversation objects, and preserves message, call, Poke, and Plan rows.
The exact deployed version and object receipt are included; this is not a full hosted restore.

The earlier candidate archive remains unchanged with SHA-256 `670c46b7f5e61af5873cab7af565dbcaf55718b95a37d57bea92355766bc77c0`.
It is superseded for rollback because its minimal rehearsal used a text status column, making its strict index guard refuse the live enum-backed index.
Use the deployed package above, then the unchanged twenty-migration package below if returning further back.

## Deployed twenty-migration package

The saved Supabase application state and recovery instructions for all twenty deployed migrations are in `.supabase-backups/MyaouDB-deployed-20-migration-rollback-20260908/`.
Start with that folder's `README.md`.
The package belongs to MyaouDB, project `ttojvnwpnpuhkyjncwxn`, and nests the unchanged nineteen-migration archive with the original application records, all 96 original Storage files, exact changed database definitions and permissions, the pre-correction photo records, and scheduler reversal instructions.

The portable archive is `.supabase-backups/MyaouDB-deployed-20-migration-rollback-20260908.tar.gz`.
Keep its `.sha256` sidecar and copy both to another secure location you control.
The files are private, excluded from Git, and protected by local permissions, but are not encrypted.

From `.supabase-backups/`, verify before extracting:

```sh
shasum -a 256 -c MyaouDB-deployed-20-migration-rollback-20260908.tar.gz.sha256
```

After extraction, run `shasum -a 256 -c SHA256SUMS` inside the extracted folder.
Archive SHA-256: `4cff473598c05a098e74f466516de81288d1a8c83e14de97bc6b68ccb3af77ab`.
All 13 top-level payload hashes passed after a fresh extraction, including the unchanged nested nineteen-migration archive whose 153 payload hashes were previously verified.

The newest layer adds only `get_available_people_v2`, preserving the legacy discovery function and all application rows.
First deploy application source that uses the legacy discovery function and wait for in-flight v2 calls to finish.
Follow `discovery-context/README.md`, set the exact deployed version `20260908174342`, and execute `discovery-context/rollback-discovery-context.sql` to return from 183 to 182 migration entries.
Seven local rehearsal cases passed, including refusal on missing confirmation, function or permission drift, unexpected history, and dependent objects, with repeat-run refusal and unrelated-data preservation.
The hosted function hashes and permissions match the rehearsed rollback.
For earlier state, extract the nested nineteen-migration archive and continue below.

Stop application writes, workers, and scheduled jobs before restoring data or schema.
The package's operations scripts validate and remove only newly added jobs 7, 5, and 6, preserving the original weekly cleanup job 2.
Wait for any in-flight HTTP request to finish before reverting the application or removing the new Vault/Vercel credentials.
Its operations notes also cover the added `pg_net` extension.

The remaining database rollback order inside the nineteen-migration archive is:

1. Restore the separately saved photo data and original Storage objects if you choose to reverse completed moderation, then run `photo-buckets/rollback-profile-photo-buckets.sql` to return from 182 to 181 migration entries.
2. Run `eighteen-migrations/1-runtime-rollback.sql` to return to 180 entries.
3. Run `eighteen-migrations/2-age-rollback.sql` to return to 179 entries.
4. Run `eighteen-migrations/sixteen-migrations/rollback-schema.sql` to return to the original 163 entries.

The package README gives every required confirmation setting and the exact deployed photo-bucket migration version, `20260908150805`.
The photo-layer rollback refuses while a photo still uses an approved or quarantine bucket.
Its saved snapshot contains the eleven affected photos and five profiles; all 22 original source/thumbnail objects were verified present in the original Storage archive.
No script blindly overwrites current photo records or later profile edits.

The guarded photo-layer and scheduler rehearsals pass, including drift refusal, preservation of unrelated state, and repeat-run checks where appropriate.
The unchanged nested eighteen-migration package preserves its complete successful 181-to-163 rehearsal.
Each schema script is transactional, uses bounded lock and statement timeouts, and refuses unexpected history or data loss.
No production rollback or full hosted data-restore rehearsal has been performed.
The earlier sealed archives remain unchanged.

This is a migration-specific recovery package, not a complete Supabase disaster-recovery backup or a rewind of later activity.
Auth credentials, Vault secret values, push tokens, managed runtime records, and provider settings are excluded.
Saved JSON records support a separately reviewed data restore; there is no automatic full-database restore script.
Delivered notifications, completed moderation decisions, account erasure, and retention deletion are not reversed by restoring schema alone.
