# Environment isolation recovery

## Incident

On 2026-09-08, the environment-isolation change removed fourteen Vercel variable records shared by Production and Preview.
Nine of those records also belonged to Development.
The operation used Vercel CLI 59.10.0 `env rm NAME preview`, relying on help text describing removal from one environment.
The installed implementation instead filters records by that environment and then deletes the complete selected record by its ID.
Batching the commands before checking the first result expanded the impact to all fourteen records.

The existing production deployment continued serving HTTP 200 from its already-built environment.
Further deployment was held until every missing Production variable was restored.
No Supabase schema, application records, or Storage objects were changed by this configuration incident.

## Recovery

Nine values were recovered from the existing ignored local environment file.
The public application origin, Supabase project and anonymous role, and Stripe publishable-key shape were checked before uploading them.
Each restoration targeted Production only and was followed by a metadata read verifying the expected record and preservation of unrelated entries.
Server values were restored as sensitive secrets; the four `NEXT_PUBLIC_` values retained the readable configuration type required by the installed CLI.
Automatic approval review rejected an earlier broader restoration; the narrower operation was run only after its source, scope, and read-only dry run were verified.

The five Redis values were not present in the local file.
The existing Upstash resource, `UpstasDB`, remained available and owned by the same team.
Its project connection was disconnected and immediately recreated for Production only through the supported integration commands.
The database itself was not removed or replaced, and no new resource or paid plan was created.
The integration recreated the five variables as encrypted configuration records.
Type-only PATCH requests then restored their original sensitive protection, verifying each change and preserving values, record IDs, and targets.

Production now contains all twenty-two expected variables, each scoped only to Production.
Preview and Development have no project variables and need isolated service configuration before they can be used.
The existing local environment file was not changed.
The code-verified master commit `d41ea0b312de6eee8cf9d98b8242628dc7a978e6` was rebuilt as deployment `dpl_AFPvN11NF3cPp5w6uLSQYDTPrViJ` in Dublin using the recovered environment.
After the rebuilt deployment reached READY, the deployed age suite passed all four tests and the social suite passed its full flow, including Redis-backed rate limiting.
Counts-only verification at 16:06:14 UTC confirmed 50 profiles, 11 Auth users, 96 Storage objects, 182 migrations, and all 31 outbox events completed.
The scheduled worker's three latest HTTP responses at 16:04, 16:05, and 16:06 UTC were all 200 without timeouts or errors.
This verifies Production recovery; the removed Development scopes remain unconfigured and must not be described as restored.

Metadata-only incident and recovery records are stored privately in `.supabase-backups/deployment-20260908/`.
They include `vercel-preview-isolation-prechange-metadata.json`, `vercel-encrypted-env-recovery.json`, `vercel-upstash-recovery-metadata.json`, and `vercel-protection-restored.json`.
These records contain no credential values and are not replacements for a secure provider-credential backup.

## Future scope changes

Inspect the current record ID, key, type, visibility, branch, and complete target list before any environment mutation.
Do not use `env rm` to subtract one target from a shared record.
Use a supported, verified PATCH of only the target field, preserving every other field and retaining a usable recovery source.
Perform one change and compare the resulting metadata before changing another record.
Use the provider's connection controls for integration-owned values and verify resource and project identities independently.
Do not deploy after a configuration incident until required variables, sensitive protection, target scopes, and runtime behavior are verified.

The [Vercel environment-variable PATCH API](https://vercel.com/docs/rest-api/projects/edit-an-environment-variable) documents optional fields for targeted updates.
The installed CLI implementation is additional evidence because command help alone did not describe the multi-target deletion behavior accurately.
