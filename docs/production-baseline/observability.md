# Request observability contract

API handlers now emit privacy-safe JSON logs with `request_id`, normalized
route, method, status, duration, request/response byte fields, and explicit
`null` values for metrics not yet instrumented. Supabase requests receive the
same request ID when available and emit provider latency/status samples. Logs
never include request bodies, tokens, secrets, message content, or profile
fields.

Use Vercel Runtime Logs to create saved views and alerts for p50/p95/p99
`duration_ms` by route, request and Auth-call counts, payload bytes,
`database_ms` and `rpc_ms`, Realtime connections, cache hit rate, failures,
and queue age.

Each outbox invocation emits one privacy-safe `outbox_batch` JSON record with
`claimed`, `completed`, `retried`, `dead`, `cleaned`, and
`queue_age_seconds`. Alert when queue age grows across consecutive invocations,
when `dead` is non-zero, or when the worker route returns 5xx. Payloads,
message content, device tokens, and provider secrets are never logged.

The current baseline labels uninstrumented fields as unavailable. Do not infer
them from request duration. Vercel dashboard creation and alert thresholds
remain an operator action because dashboard definitions are account/project
state, not repository state.
