# Native release configuration

Verified on 2026-09-09 against Expo account `andy2231` and project `@andy2231/peek-poke`.
Project ID: `e0631d17-11c0-47e9-a4fe-d577f0e6e06e`.
Both platform identifiers are `com.peekpoke.app`.

## Production environment

These variables were created in the project's production environment, which was empty before this change.
No account-scoped variable was changed.

| Variable | Visibility | Source |
| --- | --- | --- |
| `EXPO_PUBLIC_API_BASE_URL` | Plaintext | `https://www.peek-poke.com` |
| `EXPO_PUBLIC_SUPABASE_URL` | Plaintext | Existing MyaouDB public URL |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Sensitive | Existing public client key, verified to have the `anon` role |
| `EXPO_PUBLIC_MAPBOX_TOKEN` | Sensitive | Existing `pk.` public token |

Sensitive visibility hides values in routine CLI output but does not make client configuration secret once bundled into an app.
No Supabase service-role key, database password, or other server credential was exported.
An `eas env:exec production` verification compared all four values with the approved sources without printing keys and evaluated production iOS configuration successfully.
The Mapbox style API returned HTTP 200 with the configured public token.
Preview and development project environments remain empty and need isolated services before those profiles can build.
The Android configuration guard now parses a supplied Firebase client file and selects the entry matching `android.package`, following the [Firebase client selection contract](https://firebase.google.com/docs/android/google-services-plugin-and-file).
It rejects malformed JSON, server service-account credentials, unrelated packages, missing client keys, and inconsistent project/app identifiers without printing file contents.
The original existence-only guard accepted an unrelated Android package through the actual production Expo config command.
That command now rejects the same fixture and accepts a matching multi-field client configuration.
This validation checks local configuration consistency; live Firebase ownership and push delivery still require provider and device verification.

To return the EAS environment to its previously empty state, run the following from `apps/native` after confirming the linked project and checking for any later replacement values.
These commands remove only the four project-scoped production variables created in this change.

```sh
eas project:info
eas env:list production --scope project --format long
eas env:delete production --scope project --variable-name EXPO_PUBLIC_API_BASE_URL --variable-environment production --non-interactive
eas env:delete production --scope project --variable-name EXPO_PUBLIC_SUPABASE_URL --variable-environment production --non-interactive
eas env:delete production --scope project --variable-name EXPO_PUBLIC_SUPABASE_ANON_KEY --variable-environment production --non-interactive
eas env:delete production --scope project --variable-name EXPO_PUBLIC_MAPBOX_TOKEN --variable-environment production --non-interactive
eas env:list production --scope project --format long
```

Removing these variables prevents new production builds until they are restored.
It does not change configuration already embedded in installed apps and does not change Supabase or Vercel.
The database recovery instructions remain in [SUPABASE_ROLLBACK.md](../SUPABASE_ROLLBACK.md).

## Native icon

The app previously had no `expo.icon` setting, and the existing generated iOS app icon was blank.
`apps/native/assets/brand/app-icon.png` preserves the existing mark in terracotta and ivory and is referenced by `apps/native/app.json`.
The source is an opaque square 1254-pixel PNG.
Expo prebuild generated both platforms successfully in an isolated source copy with synthetic service configuration and no dependency installation.
The resulting iOS icon is opaque, nonblank, and 1024 by 1024 pixels.
Android launcher assets were generated at all five density sizes; the largest legacy launcher icon is opaque and 192 by 192 pixels.
The generated iOS and Android icons were visually inspected.
Generated platform files remain untracked and were not manually edited.
This verifies asset generation, not an installed release or store review.
Expo's [icon guidance](https://docs.expo.dev/develop/user-interface/splash-screen-and-app-icon/) describes the source configuration and platform generation requirements.

## Remaining release gates

- Identify the Apple Developer team and configure iOS distribution credentials.
- Identify the Firebase project, register the matching Android application, and configure `GOOGLE_SERVICES_JSON` plus FCM delivery credentials.
- Configure Android signing and verify the distributed certificate fingerprint against app links.
- Build and test signed binaries on physical iOS and Android devices, including push, calls, permissions, relaunch, and account switching.

Credential inspection reported no credentials configured for either platform.
No cloud build or store submission was started during this setup.
The full release checklist remains in [PRODUCT_LAUNCH_BLOCKERS.md](../PRODUCT_LAUNCH_BLOCKERS.md).
