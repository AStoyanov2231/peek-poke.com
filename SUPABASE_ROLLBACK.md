# Supabase rollback instructions

The saved pre-redesign Supabase state and the rollback for all 16 deployed migrations are in `.supabase-backups/MyaouDB-deployed-16-migration-rollback-20260908/`.
Open that folder's `README.md` for the complete procedure and use its adjacent `rollback-schema.sql`.
The package belongs to MyaouDB, project `ttojvnwpnpuhkyjncwxn`, and preserves the state captured on 2026-09-08 before the first redesign migration.
Its rollback uses the actual deployed versions through `20260908121358` and expects the original 163 migration entries plus exactly those 16 additions.

The portable archive is `.supabase-backups/MyaouDB-deployed-16-migration-rollback-20260908.tar.gz`.
Keep its `.sha256` sidecar with it and copy both to another secure location you control.
The directory and archive are private and excluded from Git because they contain application records and all 96 saved Storage files.
They are protected by local file permissions but are not encrypted.

From `.supabase-backups/`, verify the archive before extracting it:

```sh
shasum -a 256 -c MyaouDB-deployed-16-migration-rollback-20260908.tar.gz.sha256
```

After extraction into a private directory, follow the package's `README.md` and verify its `SHA256SUMS`.
Archive SHA-256: `cc80d92fd5e849a84541318160a8991b56b7b67953bfbbf28ff15b32690b88a2`.
All 114 payload hashes passed verification after a fresh extraction.
The original predeployment archive is also preserved unchanged as `.supabase-backups/MyaouDB-migration-rollback-20260908T103717Z.tar.gz`.
Its older SQL uses planned migration versions, so use the current 16-migration package for a deployed rollback.

The rollback passed a local full-chain rehearsal that restored the 163-entry baseline and all 15 affected original function definitions and permissions.
It removed the introduced objects and preserved pgcrypto.
It refuses partial or later migration history and, by default, refuses to discard rows in the new tables.
Stop application writes, workers, and scheduled jobs before executing it.
No production rollback has been performed.

This is a migration-specific recovery package, not a complete Supabase disaster-recovery backup or a rewind of later application activity.
Auth credentials, Vault secrets, push device tokens, managed runtime records, and provider settings are excluded.
The saved JSON records support a separately reviewed data restore and are not an automatic full-database restore script.
Runtime account erasure and retention deletion cannot be reversed by restoring schema alone.
