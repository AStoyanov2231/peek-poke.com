# Supabase rollback instructions

The saved pre-redesign Supabase state and rollback for all eighteen deployed migrations are in `.supabase-backups/MyaouDB-deployed-18-migration-rollback-20260908/`.
Open that folder's `README.md` for the complete procedure.
The package belongs to MyaouDB, project `ttojvnwpnpuhkyjncwxn`, and contains the original application records and all 96 saved Storage files.
It also preserves the exact database definitions and permissions from before the adult-admission changes.

The portable archive is `.supabase-backups/MyaouDB-deployed-18-migration-rollback-20260908.tar.gz`.
Keep its `.sha256` sidecar with it and copy both to another secure location you control.
The files are private, excluded from Git, and protected by local permissions, but are not encrypted.

From `.supabase-backups/`, verify the archive before extracting it:

```sh
shasum -a 256 -c MyaouDB-deployed-18-migration-rollback-20260908.tar.gz.sha256
```

After extraction, run `shasum -a 256 -c SHA256SUMS` inside the extracted folder.
Archive SHA-256: `b75393c4e3bd88717041bc520e463ae083093d0627d5b84b077fa653aa523bfa`.
All 130 payload hashes passed after a fresh extraction.

Run the database rollback in this exact order, with application writes, workers, and scheduled jobs stopped:

1. `1-runtime-rollback.sql` restores the six runtime-correction functions and permissions, returning history from 181 to 180 entries.
2. `2-age-rollback.sql` restores 61 functions and their permissions, removes the adult-admission objects and twelve added restrictive policies, and returns history to 179 entries.
3. `sixteen-migrations/rollback-schema.sql` restores the original redesign-affected behavior and returns history to the original 163 entries.

The package README gives the required confirmation settings for each step and explains the default refusal to discard later records or age decisions.
Each script is transactional, uses bounded lock and statement timeouts, and refuses unexpected migration history.
The complete local PostgreSQL rehearsal passed all three steps and restored the captured function definitions, ownership, security settings, and effective privileges.
No production rollback has been performed.

The previous sixteen-migration archive and original predeployment archive remain unchanged.
Use the eighteen-migration package for the currently deployed database, whose latest migration is `20260908135910_adult_social_runtime_corrections`.

This is a migration-specific recovery package, not a complete Supabase disaster-recovery backup or a rewind of later application activity.
Auth credentials, Vault secrets, push device tokens, managed runtime records, and provider settings are excluded.
Saved JSON records support a separately reviewed data restore and are not an automatic full-database restore script.
Account erasure and retention deletion cannot be reversed by restoring schema alone.
