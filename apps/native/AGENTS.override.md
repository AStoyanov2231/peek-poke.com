# Expo Native Governance

## Scope and Runtime

These rules govern `apps/native/`, the sole location for Expo and React Native implementation. The app uses Expo Router and a persistent Expo Development Build connected to Metro. Treat the installed dev client, simulator/emulator, Pods, DerivedData, Gradle state, and Metro state as reusable development assets.

## Daily Development Loop

1. Reuse an installed Development Build and an existing device.
2. Start Metro from the repository root with `npm run native:start`.
3. Open the installed app on the chosen simulator/emulator or device.
4. Let Fast Refresh deliver JavaScript, TypeScript, styles, and Metro-served asset changes.

JavaScript-only changes must never trigger Gradle, Xcode, CocoaPods, Expo prebuild, or a native reinstall. Do not run `npm run native:android`, `npm run native:android:dev`, or `npm run native:ios` merely to refresh JavaScript when a compatible Development Build is already installed.

## When a Native Rebuild Is Valid

A platform rebuild is allowed only when the installed binary cannot represent the change, such as native dependency changes, Expo config plugins, `app.json`/`app.config.js` native fields, permissions, entitlements, Podfiles, Gradle files, Swift/Objective-C, Kotlin/Java, or native resources.

| Purpose | Command |
|---|---|
| Metro for persistent dev client | `npm run native:start` |
| Android development install/rebuild | `npm run native:android:dev` |
| iOS development install/rebuild | `npm run native:ios` |
| Explicit native regeneration | `npm run native:prebuild -- --platform <android\|ios>` |
| Native lint | `npm run native:lint` |
| Native typecheck | `npm run native:typecheck` |
| Release-only Android validation | `npm run native:android:release` |

Never use `expo prebuild --clean` routinely. Release builds are not a development-loop substitute.

## Device Efficiency

- Reuse a running emulator/simulator or connected device; do not create a new virtual device for each test.
- Inspect Android AVDs with `emulator -list-avds` and iOS devices with `xcrun simctl list devices` before creating anything.
- Prefer the configured ARM64 Android development path on Apple Silicon. Use all-ABI release output only for explicit release validation.
- Do not erase device content, reset simulators, uninstall a working dev client, switch Xcode installations, or duplicate SDKs as routine troubleshooting.
- Keep Metro alive across JS iterations and use Fast Refresh or an app reload before restarting it.

## Cache Safety

Never delete or clean Gradle caches, `.gradle`, Android build intermediates, Pods, `Podfile.lock`, DerivedData, Metro caches, watchman state, SDKs, or active simulator/emulator data without explicit user approval. Do not add cache-reset flags to normal commands.

Storage maintenance must follow this sequence:

1. Run `PEEKPOKE_MAINTENANCE_DRY_RUN=1 npm run native:maintenance` from the repository root.
2. Review the listed stale disposable artifacts with the user.
3. Run `npm run native:maintenance` only after approval.

The maintenance script is not authorization for broader deletion. Full cache resets are exceptional recovery actions and always require explicit approval.

## Native Code Rules

- Follow Expo Router file-based routing in `app/`; reusable implementation belongs in `src/` within this native app.
- Use function components and hooks, clean up native listeners, and account for foreground/background transitions.
- Use narrow Zustand selectors; never subscribe to a whole store or allocate unstable aggregate selector results.
- Keep secrets out of the bundle. Assume public Expo environment values are readable by users.
- Preserve platform permissions, deep links, authentication callbacks, and error boundaries when editing navigation or app bootstrap code.

For ordinary JS/TS changes, verify with `npm run native:lint` and `npm run native:typecheck`; do not rebuild native binaries as verification.
