const fs = require("node:fs/promises");
const path = require("node:path");
const plist = require("@expo/plist").default;
const {
  withDangerousMod,
  withInfoPlist,
  withXcodeProject,
} = require("@expo/config-plugins");

const RELEASE_PLIST_RELATIVE_PATH = "PeekPoke/Info-Release.plist";

function withIosReleaseHardening(config) {
  // Seed the file before Expo resolves the plist linked by the Xcode project.
  config = withDangerousMod(config, [
    "ios",
    async (dangerousConfig) => {
      const projectRoot = dangerousConfig.modRequest.platformProjectRoot;
      const debugPlistPath = path.join(projectRoot, "PeekPoke/Info.plist");
      const releasePlistPath = path.join(
        projectRoot,
        RELEASE_PLIST_RELATIVE_PATH
      );
      await fs.copyFile(debugPlistPath, releasePlistPath);
      return dangerousConfig;
    },
  ]);

  config = withXcodeProject(config, (xcodeConfig) => {
    const configurations =
      xcodeConfig.modResults.pbxXCBuildConfigurationSection();
    let updatedReleaseConfiguration = false;

    for (const [key, configuration] of Object.entries(configurations)) {
      if (key.endsWith("_comment") || configuration.name !== "Release") {
        continue;
      }

      const buildSettings = configuration.buildSettings;
      if (!buildSettings?.PRODUCT_BUNDLE_IDENTIFIER) continue;

      buildSettings.INFOPLIST_FILE = RELEASE_PLIST_RELATIVE_PATH;
      updatedReleaseConfiguration = true;
    }

    if (!updatedReleaseConfiguration) {
      throw new Error(
        "[PeekPoke] Could not find the iOS app Release configuration"
      );
    }

    return xcodeConfig;
  });

  return withInfoPlist(config, async (infoConfig) => {
    const debugPlistPath = path.join(
      infoConfig.modRequest.platformProjectRoot,
      "PeekPoke/Info.plist"
    );
    const configuredPlist = infoConfig.modResults;

    // This plugin is registered before other plist plugins, so its callback
    // receives their complete result. Preserve that result for Development
    // Builds, then return a hardened copy for the Release plist provider.
    await fs.writeFile(debugPlistPath, plist.build(configuredPlist));
    const releasePlist = structuredClone(configuredPlist);

    // Expo Dev Launcher needs local-network discovery in Debug only. The
    // production app communicates exclusively with HTTPS backend endpoints.
    if (releasePlist.NSAppTransportSecurity) {
      delete releasePlist.NSAppTransportSecurity.NSAllowsLocalNetworking;
    }
    delete releasePlist.NSBonjourServices;
    delete releasePlist.NSLocalNetworkUsageDescription;

    infoConfig.modResults = releasePlist;
    return infoConfig;
  });
}

module.exports = withIosReleaseHardening;
