# Environment and secret mapping

The mapping is by environment, never by branch name alone:

| Environment | Vercel | Supabase | EAS | Mobile API target |
| --- | --- | --- | --- | --- |
| development | local/dev project | development project | `development` | local API or dev Vercel URL |
| preview/staging | Vercel Preview | isolated preview/staging project | `preview` | preview/staging API |
| production | Vercel Production | `MyaouDB` in `eu-west-1` | `production` | `https://www.peek-poke.com` |

Required public variables are `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_ANON_KEY`, `EXPO_PUBLIC_API_BASE_URL`,
`EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`, and the relevant
public map token. Server-only values include the Supabase service-role key,
Stripe secret/webhook values, Redis credentials, push credentials,
`CRON_SECRET`, and Vercel OIDC/deployment credentials. Values belong only in Vercel,
Supabase, or EAS secret stores.

Native web-billing links default to denied. Each EAS environment must explicitly
configure `EXPO_PUBLIC_IOS_WEB_BILLING_MODE` and
`EXPO_PUBLIC_ANDROID_WEB_BILLING_MODE`, plus the environment's
`EXPO_PUBLIC_BILLING_REGION` and `EXPO_PUBLIC_APP_STOREFRONT`. Optional
comma-separated `EXPO_PUBLIC_WEB_BILLING_ALLOWED_REGIONS` and
`EXPO_PUBLIC_WEB_BILLING_ALLOWED_STOREFRONTS` further restrict eligibility.
`EXPO_PUBLIC_WEB_BILLING_URL` must be the canonical HTTPS Premium page. These
values encode the product owner's current store-policy eligibility decision;
they are not inferred by the client.

`apps/native/app.config.js` now fails preview builds that target the production
API or Supabase origin and fails production builds with missing/incorrect
values. The current repository has no non-production project identifiers, so
preview/staging mapping still needs to be configured in the provider consoles.

An outbox worker invocation of `/api/internal/outbox` must send
`Authorization: Bearer $CRON_SECRET`. This repository does not configure a
Vercel Cron for the route. Configure an independently generated secret in every
environment that invokes the worker. The durable workflow is managed directly
in the production Supabase project; never point a preview worker at the
production Supabase project.
