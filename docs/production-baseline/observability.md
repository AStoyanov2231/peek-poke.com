# Request observability contract

API handlers emit privacy-safe JSON logs with `request_id`, normalized route, method, status, duration, request/response byte fields, and explicit `null` values for metrics not yet instrumented.
Supabase requests receive the same request ID when available and emit provider latency/status samples.
Logs never include request bodies, tokens, secrets, message content, or profile fields.

Use Vercel Runtime Logs to inspect emitted request and worker records.
The current baseline labels uninstrumented fields as unavailable; do not infer database, RPC, Realtime, or cache metrics from request duration.

Each outbox invocation emits one privacy-safe `outbox_batch` JSON record with `claimed`, `completed`, `retried`, `dead`, `cleaned`, and `queue_age_seconds`.
An external monitor must detect queue age growing across consecutive invocations, non-zero `dead`, worker-route 5xx responses, and missing or failed scheduled runs.
Payloads, message content, device tokens, and provider secrets are never logged.

As of 2026-09-08, [Vercel Alerts](https://vercel.com/docs/alerts) require Pro with Observability Plus or Enterprise.
Hobby deployments need a separate monitoring solution.
Built-in function anomaly alerts are not a substitute for evaluating the worker's structured log fields or checking scheduler execution.
Their activity and baseline thresholds also mean that one low-volume worker failure does not guarantee an alert.

An alert rule, dashboard view, or available log stream alone does not prove notification delivery.
Launch evidence must identify the monitor, approved notification destination and recipient, evaluation thresholds, and a delivered test alert.
Configure those through the selected provider, without including credentials in the repository.
Until that evidence exists, logs and scheduler queries remain manual inspection tools and the alerting launch requirement stays open.
