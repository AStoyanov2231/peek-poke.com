# Supabase rollback instructions

The pre-redesign recovery package is stored locally at `.supabase-backups/20260908T103717Z-pre-product-redesign/`.
It belongs to MyaouDB, project `ttojvnwpnpuhkyjncwxn`, and was captured on 2026-09-08 before any redesign migration was applied.
The folder and its contents are excluded from Git because they contain private application data and stored files.
The package's `README.md` contains the recovery procedure, coverage, limits, and verification evidence.
The portable archive is `.supabase-backups/MyaouDB-migration-rollback-20260908T103717Z.tar.gz`.
Keep its `.sha256` sidecar with it, and copy both to another secure location you control.

From `.supabase-backups/`, verify the archive before extracting it:

```sh
shasum -a 256 -c MyaouDB-migration-rollback-20260908T103717Z.tar.gz.sha256
```

After extraction into a private directory, follow `20260908T103717Z-pre-product-redesign/README.md`.
The recovery SQL passed a local rehearsal applying and undoing all 14 migrations, with exact restoration of the 15 affected original functions and their permissions.
This rehearsal does not prove a complete hosted database restoration.

This package is for undoing the exact 14 product-redesign migrations on the existing project.
It is not a complete Supabase disaster-recovery backup and does not rewind all activity that might occur after deployment.
Authentication credentials, Vault secrets, push device tokens, and managed runtime records are excluded.

Do not run the rollback now: none of the 14 migrations is installed.
Do not merge or deploy the application before the database release and recovery requirements are satisfied.
