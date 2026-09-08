import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { evalModsAsync, withDefaultBaseMods } from "@expo/config-plugins";
import plist from "@expo/plist";
import { afterEach, describe, expect, it } from "vitest";

const nativeRoot = path.resolve(__dirname, "..");
const loadCommonJs = createRequire(import.meta.url);
const withHardening = loadCommonJs(path.join(nativeRoot, "plugins/with-ios-release-hardening.js"));
const withSceneLifecycle = loadCommonJs(path.join(nativeRoot, "plugins/with-ios-scene-lifecycle.js"));
const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("iOS plist plugin composition", () => {
  it("writes scene and privacy values to Debug while emitting a hardened Release plist", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "peekpoke-ios-plugin-"));
    temporaryRoots.push(root);
    const platformRoot = path.join(root, "ios");
    const appRoot = path.join(platformRoot, "PeekPoke");
    await mkdir(appRoot, { recursive: true });
    const base = {
      CFBundleIdentifier: "com.peekpoke.fixture",
      NSAppTransportSecurity: { NSAllowsLocalNetworking: true },
      NSBonjourServices: ["_expo._tcp"],
      NSLocalNetworkUsageDescription: "Development discovery",
      NSLocationWhenInUseUsageDescription: "Peek & Poke uses your location to find people and plans nearby.",
    };
    await writeFile(path.join(appRoot, "Info.plist"), plist.build(base));
    await writeFile(
      path.join(appRoot, "AppDelegate.swift"),
      "final class AppDelegate {\n  // Linking API\n}\n"
    );
    let config: any = {
      name: "PeekPoke",
      slug: "peekpoke",
      ios: { bundleIdentifier: "com.peekpoke.fixture" },
      _internal: { projectRoot: root },
    };
    config = withHardening(config);
    config = withSceneLifecycle(config);
    // The Xcode build-setting rewrite is covered by the generated-project
    // integration path. This isolated fixture has no pbxproj, so execute the
    // two plist callbacks and their dangerous file setup with Expo providers.
    delete config.mods.ios.xcodeproj;
    // Base providers are added after plugins, as Expo's mod compiler does.
    // This exercises the callbacks against a real temporary Info.plist rather
    // than calling either plugin with a fabricated plist object.
    config = withDefaultBaseMods(config);
    const evaluated = await evalModsAsync(config, {
      projectRoot: root,
      platforms: ["ios"],
      introspect: true,
      assertMissingModProviders: true,
    });
    const debug = plist.parse(await readFile(path.join(appRoot, "Info.plist"), "utf8"));
    const release = evaluated.ios.infoPlist;
    for (const output of [debug, release]) {
      expect(output.UIApplicationSceneManifest.UISceneConfigurations.UIWindowSceneSessionRoleApplication[0].UISceneDelegateClassName).toBe("$(PRODUCT_MODULE_NAME).SceneDelegate");
      expect(output.NSLocationWhenInUseUsageDescription).toBe("Peek & Poke uses your location to find people and plans nearby.");
    }
    expect(debug.NSAppTransportSecurity.NSAllowsLocalNetworking).toBe(true);
    expect(debug.NSBonjourServices).toEqual(["_expo._tcp"]);
    expect(release.NSAppTransportSecurity.NSAllowsLocalNetworking).toBeUndefined();
    expect(release.NSBonjourServices).toBeUndefined();
    expect(release.NSLocalNetworkUsageDescription).toBeUndefined();
  });
});
