const { existsSync } = require("node:fs");
const path = require("node:path");

const localGoogleServicesFile = path.join(__dirname, "google-services.json");
const { assertNativeBuildEnvironment } = require("./scripts/verify-environment");
const PRODUCTION_API_ORIGIN = "https://www.peek-poke.com";
const PRODUCTION_SUPABASE_ORIGIN = "https://ttojvnwpnpuhkyjncwxn.supabase.co";

function configureDevClientPlugin(plugins = []) {
  const addGeneratedScheme = !["preview", "production"].includes(
    process.env.EAS_BUILD_PROFILE
  );

  return plugins.map((plugin) => {
    const name = Array.isArray(plugin) ? plugin[0] : plugin;
    if (name !== "expo-dev-client") return plugin;

    const options = Array.isArray(plugin) ? plugin[1] ?? {} : {};
    return [
      "expo-dev-client",
      {
        ...options,
        addGeneratedScheme,
      },
    ];
  });
}

module.exports = ({ config }) => {
  const googleServicesFile =
    process.env.GOOGLE_SERVICES_JSON ||
    (existsSync(localGoogleServicesFile) ? localGoogleServicesFile : undefined);
  assertNativeBuildEnvironment({
    profile: process.env.EAS_BUILD_PROFILE,
    platform: process.env.EAS_BUILD_PLATFORM,
    googleServicesFile,
    env: process.env,
    productionApiOrigin: PRODUCTION_API_ORIGIN,
    productionSupabaseOrigin: PRODUCTION_SUPABASE_ORIGIN,
  });

  return {
    ...config,
    plugins: configureDevClientPlugin(config.plugins),
    android: {
      ...config.android,
      ...(googleServicesFile ? { googleServicesFile } : {}),
    },
  };
};
