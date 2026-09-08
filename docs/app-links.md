# Public invitation app links

The canonical native-link host is `www.peek-poke.com`.
Profile invitations use `/invite/<token>`, and public Plan previews use `/plan/<token>`.
Opening a Plan link must show its preview and retain the separate, explicit Join action.
Link association does not grant Plan membership or bypass age admission and authorization.

The iOS association route at `src/app/.well-known/apple-app-site-association/route.ts` lists both path families for the app identifier.
The Android intent filters in `apps/native/app.json` recognize the same HTTPS host and path families.
Android's public association endpoint is served at `/.well-known/assetlinks.json` through the existing rewrite to `/api/android-asset-links`.

Apple requires the association file and matching app entitlement on the same fully qualified host, served over HTTPS without redirects.
Its CDN and installed-device caches can delay recognition after deployment, so an HTTP response alone does not prove that a physical device opens the link correctly.
See [Apple's associated-domain documentation](https://developer.apple.com/documentation/xcode/supporting-associated-domains).

Android additionally requires `ANDROID_APP_CERT_SHA256` to contain the actual distributed app's signing-certificate fingerprint.
The endpoint intentionally returns 503 when no valid fingerprint is configured.
When Play App Signing is used, the distributed app certificate can differ from a local upload or development certificate; use the value from Play Console.
See [Android's website-association documentation](https://developer.android.com/training/app-links/configure-assetlinks).

Release verification requires a matching signed native binary, valid association responses, and direct device checks from a different app such as Notes or Messages.
Check both an invitation and a Plan preview, cold and warm app launch, pending admission, and the no-app browser fallback.
Do not treat a custom-scheme Simulator launch or static manifest test as proof of OS-level universal/app-link verification.

`test/public-app-links.test.ts` keeps the iOS response and native Android manifest aligned and narrowly scoped to the intended public link families.
The browser Plan-preview journey separately proves that authentication preserves the invitation and joining remains explicit.

## Local Android release preflight

`apps/native/scripts/run-android-release.sh` now parses the generated source manifest before invoking Gradle or installing an APK.
The manifest must contain exactly the public link records configured in app.json, with verified VIEW filters and BROWSABLE/DEFAULT categories.
Missing Plan paths, broader unintended paths, development-client schemes, enabled backups, or missing blocked-permission removals stop the command.
After a native configuration change, regenerate through Expo with the intended build profile before running the release command.
The preflight checks generated metadata; it does not verify the distributed signing certificate or OS domain association.
The command-level regression suite uses temporary project directories and stubbed build/install executables, separately from actual packaged-app verification.

## Packaged Android routing evidence

The September 9 local release-mode APK check used embedded JavaScript, development signing, and synthetic loopback API/Auth services with Metro stopped.
Cold launches reproduced a public Plan preview being discarded while session hydration temporarily excluded its route.
The public route now remains registered, and bootstrap preserves only the exact valid preview path.
The rebuilt APK showed the same preview in signed-in and signed-out cold launches.
Anonymous Join opened sign-in, successful sign-in returned to the preview, and the fixture recorded zero join requests throughout the tested flow.
These checks used an explicit package-targeted Android VIEW intent, so they verify manifest resolution and application routing without claiming OS website association.
To repeat against the local native fixtures, stop `com.peekpoke.app`, launch `https://www.peek-poke.com/plan/` followed by 43 `a` characters with a VIEW intent targeting that package, and inspect the preview before interacting.
Read `/__test/plan-share-state` on the native fixture API to verify the join counter independently.
Repeat signed out, choose Join, sign in with the fixture account, and verify the preview is retained without automatic membership.
Distributed-certificate and physical-device checks above remain required.
