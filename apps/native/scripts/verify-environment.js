const { existsSync } = require("node:fs");

function normalizedOrigin(value, variableName) {
  try {
    return new URL(value).origin;
  } catch {
    throw new Error(`${variableName} must be an absolute URL`);
  }
}

function configuredBillingPlatforms(platform, env) {
  const platforms = platform ? [platform] : ["ios", "android"];
  return platforms.filter((candidate) =>
    env[`EXPO_PUBLIC_${candidate.toUpperCase()}_WEB_BILLING_MODE`]?.trim().toLowerCase() === "allowed"
  );
}

function assertProductionBillingEnvironment({ platform, env, productionApiOrigin }) {
  const enabledPlatforms = configuredBillingPlatforms(platform, env);
  if (enabledPlatforms.length === 0) return;

  const region = env.EXPO_PUBLIC_BILLING_REGION?.trim();
  const storefront = env.EXPO_PUBLIC_APP_STOREFRONT?.trim();
  const regions = env.EXPO_PUBLIC_WEB_BILLING_ALLOWED_REGIONS?.split(",").map((value) => value.trim()).filter(Boolean) ?? [];
  const storefronts = env.EXPO_PUBLIC_WEB_BILLING_ALLOWED_STOREFRONTS?.split(",").map((value) => value.trim()).filter(Boolean) ?? [];
  const missing = [];
  if (!region || !regions.includes(region)) missing.push("an allowed EXPO_PUBLIC_BILLING_REGION");
  if (!storefront || !storefronts.includes(storefront)) missing.push("an allowed EXPO_PUBLIC_APP_STOREFRONT");
  if (missing.length > 0) {
    throw new Error(`Production web billing requires ${missing.join(" and ")}`);
  }

  const billingUrl = new URL(env.EXPO_PUBLIC_WEB_BILLING_URL ?? `${productionApiOrigin}/premium`);
  if (billingUrl.protocol !== "https:" || billingUrl.origin !== productionApiOrigin || billingUrl.pathname !== "/premium") {
    throw new Error(`Production EXPO_PUBLIC_WEB_BILLING_URL must use ${productionApiOrigin}/premium`);
  }
}

function assertNativeBuildEnvironment({
  profile,
  platform,
  googleServicesFile,
  env,
  productionApiOrigin,
  productionSupabaseOrigin,
}) {
  if (!profile) return;

  const required = {
    EXPO_PUBLIC_API_BASE_URL: env.EXPO_PUBLIC_API_BASE_URL,
    EXPO_PUBLIC_SUPABASE_URL: env.EXPO_PUBLIC_SUPABASE_URL,
    EXPO_PUBLIC_SUPABASE_ANON_KEY: env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
    EXPO_PUBLIC_MAPBOX_TOKEN: env.EXPO_PUBLIC_MAPBOX_TOKEN,
    ...((["preview", "production"].includes(profile) && (!platform || platform === "android"))
      ? { GOOGLE_SERVICES_JSON: googleServicesFile && existsSync(googleServicesFile) ? googleServicesFile : undefined }
      : {}),
  };
  const missing = Object.entries(required).filter(([, value]) => !value).map(([name]) => name);
  if (missing.length > 0) {
    throw new Error(`${profile} native build is missing: ${missing.join(", ")}`);
  }

  const apiOrigin = normalizedOrigin(env.EXPO_PUBLIC_API_BASE_URL, "EXPO_PUBLIC_API_BASE_URL");
  const supabaseOrigin = normalizedOrigin(env.EXPO_PUBLIC_SUPABASE_URL, "EXPO_PUBLIC_SUPABASE_URL");
  if (profile === "production") {
    if (apiOrigin !== productionApiOrigin) {
      throw new Error(`Production EXPO_PUBLIC_API_BASE_URL must use ${productionApiOrigin}`);
    }
    if (supabaseOrigin !== productionSupabaseOrigin) {
      throw new Error(`Production EXPO_PUBLIC_SUPABASE_URL must use ${productionSupabaseOrigin}`);
    }
    assertProductionBillingEnvironment({ platform, env, productionApiOrigin });
  }
  if (profile === "preview" && (apiOrigin === productionApiOrigin || supabaseOrigin === productionSupabaseOrigin)) {
    throw new Error("Preview native builds must not target production API or Supabase origins");
  }
}

module.exports = { assertNativeBuildEnvironment, assertProductionBillingEnvironment };
