# Next.js Web and Server Governance

## Scope

These rules govern `src/`, the sole location for Next.js web and server application code. Do not place Expo or React Native behavior here. Keep routes and route handlers in `app/`, UI in `components/`, reusable client hooks in `hooks/`, server/client utilities in `lib/`, Zustand state in `stores/`, and web types in `types/`.

## App Router Rules

- Use the Next.js App Router only. Do not introduce `pages/`, `getServerSideProps`, `getStaticProps`, `next/router`, `next/head`, or Pages Router API handlers.
- Server Components are the default. Add `"use client"` only at the smallest interactive boundary that needs hooks, browser APIs, event handlers, or client state.
- Keep client-only imports out of Server Components. Pass serializable data across the server/client boundary.
- Use `layout.tsx`, `page.tsx`, `loading.tsx`, `error.tsx`, `not-found.tsx`, and route groups according to App Router conventions.
- Implement HTTP endpoints in `app/**/route.ts` with named `GET`, `POST`, `PUT`, `PATCH`, or `DELETE` exports and Web `Request`/`Response` APIs.
- Use `next/navigation` for navigation. Use metadata exports or `generateMetadata` instead of manually managing document head state.
- Treat `params`, `searchParams`, `cookies()`, and `headers()` as async under the repository's Next.js version.
- Keep secrets and privileged clients server-only. Validate untrusted input, authenticate before authorization, and return deliberate status codes without leaking internals.
- Prefer server data access and Server Components. Client fetching, effects, and duplicated loading state require a concrete interaction or revalidation need.

## React and Hooks

- Use function components and hooks; do not add class components.
- Hooks must start with `use`, remain unconditional, declare complete dependencies, and clean up subscriptions, timers, and listeners.
- Avoid effects for values derivable during render. Stabilize callbacks or memoized values only when identity matters.
- Preserve existing loading, error, accessibility, responsive, and hydration behavior when changing UI.

## Zustand Rules

- Components must subscribe through narrow selectors. Prefer exported domain selectors from `stores/selectors.ts`; add reusable selectors there.
- Never subscribe to an entire store or return fresh aggregate objects/arrays without a stable constant or `useShallow`.
- Select actions separately from state. Use `store.getState()` only in event callbacks, subscriptions, or non-React imperative code where no render subscription is intended.
- Store canonical shared client state only. Keep transient local form and presentation state in the owning component.
- Put state transitions in named store actions; do not scatter direct `setState` mutations through components.
- Preserve immutable updates and stable references for unchanged branches. Do not mirror Server Component data into Zustand without a defined hydration requirement.

## Verification Map

Do not modify native files to fix web behavior. Do not clear `.next` or other caches as a default diagnostic step.
