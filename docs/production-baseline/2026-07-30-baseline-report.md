# Production baseline report — 2026-07-30

## Evidence captured

- Supabase project metadata: region `eu-west-1`, healthy status, PostgreSQL 17.
- Hosted schema metadata: 23 public tables, 77 public indexes, 29 public policies, 6 public triggers, one public Realtime table, one active cron job, and five Storage buckets.
- Security advisor: leaked-password protection disabled; `user_locations` lacks an RLS policy.
- Vercel project metadata: Next.js project with production and preview deployments; function region is now declared as `dub1` in `vercel.json` but requires deployment verification.
- Request tracing: implemented in API auth/public/webhook boundaries and Supabase client calls; dashboard samples are unavailable until the change is deployed.

## Metric baseline

| Metric | Result |
| --- | --- |
| p50/p95/p99 API latency | unavailable before traced deployment |
| request count | unavailable in repository-only evidence |
| Auth-call count | unavailable |
| request/response payload size | request captured when supplied; response unavailable when runtime omits `Content-Length` |
| database/RPC time | unavailable before query spans |
| Realtime connections | unavailable |
| cache hit rate | unavailable |
| failures | unavailable as a dated dashboard sample |
| queue age | repository instrumentation added; unavailable until the migration, worker, and alerts are deployed |
| native runtime flow | unavailable in this run; lint/typecheck are static checks only |

The report deliberately does not estimate missing metrics. Deploy the tracing
change to preview/staging, exercise representative web and Expo flows, export
Vercel/Supabase samples, then append the measured p50/p95/p99 and payload data.
