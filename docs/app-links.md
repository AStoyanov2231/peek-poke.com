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
