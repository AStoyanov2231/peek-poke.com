# Product verification workflow

`.github/workflows/verify.yml` runs on pull requests and on pushes to `master` and `product-redesign`.
The production branch name matches the repository's verified default branch.
It uses `npm ci` in every job, read-only repository-content permission, [actions/checkout v7](https://github.com/actions/checkout), and [actions/setup-node v7](https://github.com/actions/setup-node).
Checkout disables persisted Git credentials because verification never writes to Git.
The workflow uses Node 24 because it is the current [Node.js LTS release](https://nodejs.org/en/about/previous-releases), while Node 20 is end of life.
Its concurrency group cancels obsolete runs for the same pull request or branch.

The web job first runs `npm audit --omit=dev --audit-level=high` against the lockfile-resolved production dependency tree.
It fails for high- or critical-severity production dependency advisories and deliberately excludes development-only dependencies.
The gate reports risk only; it never changes dependency manifests or the lockfile automatically.
The latest local production audit reported zero high or critical advisories and 15 moderate advisories.
The web job then runs root linting, browser-independent tests, and a production Next build with loopback fixture values only in `.next-ci-verify`.
The SQL job runs the legacy SQL compatibility fixture and four product PGlite suites covering the complete migration chain, restrictive age policies, filtered group pagination, and service-reader compatibility.
The native job runs the Expo TypeScript, lint, Vitest, and Jest checks.
The browser job installs Chromium with the [Playwright CI installation command](https://playwright.dev/docs/ci) and runs all eleven Playwright journeys with `E2E_FIXTURE=1`.
The fixture launcher overwrites Supabase, Stripe, Redis, TURN, cron, and app-URL settings with loopback or inert values.
Fixture mode opts into software WebGL for its test-owned Map scene, matching the previously passing browser verification.
[Chromium documents this explicit SwiftShader opt-in](https://chromium.googlesource.com/chromium/src/+/main/docs/gpu/swiftshader.md) for headless testing because automatic fallback is deprecated.
The flag is confined to `E2E_FIXTURE=1`; the normal application does not set browser flags.
No workflow job receives a repository secret, contacts a hosted Supabase project, deploys code, publishes artifacts, or applies migrations.
The existing Vercel Git integration is separate from this workflow.
`vercel.json` disables automatic deployment only for `product-redesign` while its hosted verification and release configuration are completed.
This uses Vercel's documented [branch-specific deployment control](https://vercel.com/docs/project-configuration/git-configuration#gitdeploymentenabled); other branches retain their existing behavior.
Remove that branch entry when the target database is migrated and an application deployment is approved.

GitHub Actions must be enabled for the repository and the workflow must be present on the target branch before it can run.
Master now requires all four job names from the GitHub Actions app, requires an up-to-date branch, and enforces the checks for administrators.
Force pushes and branch deletion are disabled.
The prior master branch had no protection; the new policy adds no human-review requirement.
The workflow does not prove hosted authentication, RLS, Storage, Realtime, push delivery, third-party venue behavior, production migration deployment, or physical-device behavior.
Those checks require separately approved environments, credentials, and release procedures.

The workflow-equivalent production build passed locally on Node 24.10.0 with every `.env.local` key overridden and only the workflow fixture values injected.
The latest root production build reported exit 0 in `/tmp/peek-product-final-web-build.log`.
The matching root lint log is `/tmp/peek-product-final-web-lint.log`.
The user approved public publication, and [draft PR #7](https://github.com/AStoyanov2231/peek-poke.com/pull/7) contains the redesign.
The first Linux run exposed a missing `source-map@0.6.1` lockfile entry, which is corrected and verified with CI's Node 24.20 and npm 11.19.
The browser run exposed a timezone mismatch between the UTC runner and the Europe/Sofia browser.
The Plan journey now calculates its future local datetime inside the browser, verifies the successful creation response, and checks that the creation dialog closes.
All four jobs pass for commit `cecc8e17f` in the [PR verification run](https://github.com/AStoyanov2231/peek-poke.com/actions/runs/34222558669) and its matching push run.
The hosted-regression commit `9037c032c` also passes all four jobs in both its [PR run](https://github.com/AStoyanov2231/peek-poke.com/actions/runs/34226760374) and [push run](https://github.com/AStoyanov2231/peek-poke.com/actions/runs/34226755067).
