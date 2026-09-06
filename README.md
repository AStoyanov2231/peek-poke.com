# Peek & Poke

Peek & Poke is a Next.js web/server app with a separate Expo React Native app that talks to the same Vercel-hosted backend.

## Structure

- `src/`: Next.js web UI, API routes, server logic, stores, hooks, and web-only components.
- `apps/native/`: Expo React Native app using Expo Router and the Next API via Bearer-token requests.
- `packages/shared/`: shared domain types, API contracts, route helpers, constants, and validation.
- `packages/design/`: shared design tokens and component variant contracts for web and native.
- `public/`: static web assets.
- `test/`: Vitest tests.

## Setup

```bash
npm install
```

Pull web/server environment values from Vercel when possible:

```bash
vercel login
vercel link
vercel env pull .env.local
```

Native uses Expo public env vars:

```env
EXPO_PUBLIC_API_BASE_URL=https://www.peek-poke.com
EXPO_PUBLIC_SUPABASE_URL=...
EXPO_PUBLIC_SUPABASE_ANON_KEY=...
EXPO_PUBLIC_MAPBOX_TOKEN=...
```

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start the Next.js dev server |
| `npm run build` | Build the Next.js app |
| `npm run start` | Start the production Next.js app |
| `npm run lint` | Lint the web/server workspace |
| `npm run test` | Run Vitest |
| `npm run native:start` | Start Expo for `apps/native` |
| `npm run native:ios` | Start Expo iOS |
| `npm run native:android` | Start Expo Android |
| `npm run native:typecheck` | Type-check the native app |

## Services

Required services include Supabase, Stripe, Google Places, Mapbox, and Expo push notifications. Keep service-role keys, webhook secrets, and signing assets out of commits.
