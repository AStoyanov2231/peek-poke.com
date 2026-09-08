# Production dependency risk notes

The 2026-09-08 production audit passes `npm audit --omit=dev --audit-level=high` with zero high or critical advisories and 15 moderate entries.
Most remaining entries describe packages affected through the two dependency paths analyzed below.
No audit exceptions were configured.

| Package | Verified version |
| --- | --- |
| Next.js and ESLint configuration | 16.3.4 |
| Sharp / bundled libvips | 0.35.4 / 8.18.6 |
| PostCSS | 8.5.28 |
| Expo / Expo Router | 57.0.20 / 57.0.19 |
| React Native / native Jest preset | 0.86.3 |

The upgrade follows the [Next.js 16 migration guide](https://nextjs.org/docs/app/guides/upgrading/version-16) and [Expo's dependency alignment workflow](https://docs.expo.dev/workflow/upgrading-expo-sdk-walkthrough/).
Native companion module versions follow the installed Expo SDK's `bundledNativeModules.json` map.
Sharp's updated libvips addresses the [image-processing advisories inherited by older Sharp versions](https://github.com/advisories/GHSA-f88m-g3jw-g9cj).

## `decode-uri-component` through Expo Router

The installed native dependency path is `expo-router@57.0.19` -> `query-string@7.1.3` -> `decode-uri-component@0.2.2`.

`decode-uri-component` versions through `0.4.2` are affected by [CVE-2026-45822](https://github.com/advisories/GHSA-vcc3-ghjq-m6fr).

The affected decoder can consume excessive CPU while recovering malformed percent-encoded input.

Local reproduction against the installed version used `require("decode-uri-component")("%E0".repeat(500))`.

That single input took about 9.2 seconds of CPU time in Node, while 100 repetitions took about 0.1 seconds.

The test stopped before larger inputs to avoid an unnecessary local denial of service.

The active Expo Router native inbound-link path does not use that decoder.

`expo-router/build/link/linking.js` imports `fork/getStateFromPath`, whose `parseQueryParams` uses `parseUrlUsingCustomBase(path).searchParams` and `URLSearchParams.getAll`.

The installed legacy `react-navigation/core/getStateFromPath.js` still calls `queryString.parse`, but the app does not import that legacy entry point.

Within the active fork, the `query-string` import is used to stringify application navigation state in `getPathFromState`, not to parse inbound URLs.

Application deep links and universal links therefore do not reach the reproduced vulnerable decoder in the current Router implementation.

A URL-length guard in application code would not repair an unexpected future caller of `queryString.parse`, and would change routing behavior without a current reachable sink.

Do not add a dependency override or a routing workaround for this package.

Keep the dependency visible in release review and remove it through an Expo Router update once Expo publishes an SDK-57-compatible Router that no longer depends on the vulnerable decoder.

## `uuid` through Expo prebuild tooling

The installed path is `@expo/config-plugins@57.0.9` -> `xcode@3.0.1` -> `uuid@7.0.3`.

`uuid` versions before `11.1.1` are affected by [GHSA-w5hq-g745-h8pq](https://github.com/advisories/GHSA-w5hq-g745-h8pq) when v3, v5, or v6 receives a caller-supplied buffer.

This path is used by Expo configuration and native prebuild tooling, rather than the shipped application JavaScript bundle.

Expo `57.0.20` still requires `@expo/config-plugins ~57.0.9`, and that release still permits `xcode ^3.0.1`.

The audit has no compatible automatic fix.

Do not force `uuid@11` through an override because `xcode@3` compatibility has not been established.

Run prebuild and native build jobs only with trusted repository configuration and isolated build workers until Expo or `xcode` publishes a compatible fix.

## Compatible remediation already selected

The production lockfile resolves `qs@6.16.0`, `postcss@8.5.28`, `@xmldom/xmldom@0.8.15`, and nested `@xmldom/xmldom@0.9.12`.

Those versions address the corresponding prior `qs`, PostCSS, and XML parser audit findings without an unsafe override.

This document records dependency reachability at the time of the SDK 57.0.20 and Expo Router 57.0.19 alignment.

It is not a claim that the remaining Expo ecosystem advisories are fixed.
