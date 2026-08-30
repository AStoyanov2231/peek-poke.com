# Package management

This repository is an npm workspace monorepo.

## Ownership

- Root `package.json`: Next.js web/server code, shared tooling, and root scripts.
- `apps/native/package.json`: Expo/React Native code and native-only dependencies.
- `packages/shared/package.json`: shared API contracts, types, and validation.
- `packages/design/package.json`: shared design tokens and variants.

Dependencies may be declared in more than one workspace when both workspaces import them directly. npm may hoist compatible versions into the root `node_modules`; that is an install detail, not a reason to move a dependency to the root manifest.

## Commands

Run commands from the repository root:

```bash
cd /Applications/Coding/peek-poke.com
npm ci
npm run deps:check
```

Add dependencies to the owning workspace:

```bash
npm install <package>                 # web/server root
npm install <package> -w @peekpoke/native
npm install <package> -w @peekpoke/shared
npm install <package> -w @peekpoke/design
```

Use `npm ci` after cloning, after switching branches, or when the install is inconsistent. Use `npm install` only when intentionally changing dependencies; commit the resulting `package-lock.json` together with the manifest change.

Do not manually edit `package-lock.json`, install native packages in the root to work around resolution problems, or commit generated `node_modules`, `.next`, Android build output, or iOS build output.

The native Expo scripts use `apps/native/scripts/run-expo.cjs`. npm may hoist the Expo CLI into the root `node_modules`, while `expo-router` remains owned by the native workspace; the launcher adds the native workspace module directory to Node's resolution path so this layout works consistently on macOS and Windows.
