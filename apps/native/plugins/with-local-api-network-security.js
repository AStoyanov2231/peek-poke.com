const fs = require("node:fs/promises");
const path = require("node:path");
const {
  AndroidConfig,
  withAndroidManifest,
  withDangerousMod,
  withGradleProperties,
} = require("@expo/config-plugins");

const NETWORK_SECURITY_CONFIG = `<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
  <base-config cleartextTrafficPermitted="false" />
  <domain-config cleartextTrafficPermitted="true">
    <domain includeSubdomains="false">10.0.2.2</domain>
  </domain-config>
  <domain-config cleartextTrafficPermitted="true">
    <domain includeSubdomains="false">127.0.0.1</domain>
  </domain-config>
</network-security-config>
`;

function withLocalApiNetworkSecurity(config) {
  config = withGradleProperties(config, (gradleConfig) => {
    const properties = gradleConfig.modResults;
    const desired = new Map([
      ["org.gradle.caching", "true"],
      // Expo Modules links Worklets' native output across Gradle projects.
      // Parallel project execution can race that producer on a clean build.
      ["org.gradle.parallel", "false"],
      // Expo's generated Gradle files resolve Node packages during configuration,
      // which is incompatible with Gradle's configuration cache.
      ["org.gradle.configuration-cache", "false"],
    ]);

    if (process.env.PEEKPOKE_DEV_ARM64_ONLY === "1") {
      desired.set("reactNativeArchitectures", "arm64-v8a");
    }

    for (const [key, value] of desired) {
      const existing = properties.find((property) => property.key === key);
      if (existing) {
        existing.value = value;
      } else {
        properties.push({ type: "property", key, value });
      }
    }

    return gradleConfig;
  });

  config = withAndroidManifest(config, (manifestConfig) => {
    const application = AndroidConfig.Manifest.getMainApplicationOrThrow(
      manifestConfig.modResults
    );
    application.$["android:networkSecurityConfig"] =
      "@xml/network_security_config";
    return manifestConfig;
  });

  return withDangerousMod(config, [
    "android",
    async (dangerousConfig) => {
      const destination = path.join(
        dangerousConfig.modRequest.platformProjectRoot,
        "app/src/main/res/xml/network_security_config.xml"
      );
      await fs.mkdir(path.dirname(destination), { recursive: true });
      let current = "";
      try {
        current = await fs.readFile(destination, "utf8");
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
      if (current !== NETWORK_SECURITY_CONFIG) {
        await fs.writeFile(destination, NETWORK_SECURITY_CONFIG);
      }
      return dangerousConfig;
    },
  ]);
}

module.exports = withLocalApiNetworkSecurity;
