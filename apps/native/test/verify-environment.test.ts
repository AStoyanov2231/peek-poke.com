import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { assertNativeBuildEnvironment } = require("../scripts/verify-environment.js") as {
  assertNativeBuildEnvironment: (options: Record<string, unknown>) => void;
};

const productionApiOrigin = "https://www.peek-poke.com";
const productionSupabaseOrigin = "https://project.supabase.co";
const googleServicesFile = fileURLToPath(import.meta.url);

function productionEnv(overrides: Record<string, string> = {}) {
  return {
    EXPO_PUBLIC_API_BASE_URL: productionApiOrigin,
    EXPO_PUBLIC_SUPABASE_URL: productionSupabaseOrigin,
    EXPO_PUBLIC_SUPABASE_ANON_KEY: "public-anon-key",
    EXPO_PUBLIC_MAPBOX_TOKEN: "public-map-token",
    ...overrides,
  };
}

function verify(platform: "ios" | "android", env = productionEnv()) {
  assertNativeBuildEnvironment({
    profile: "production",
    platform,
    googleServicesFile: platform === "android" ? googleServicesFile : undefined,
    env,
    productionApiOrigin,
    productionSupabaseOrigin,
  });
}

describe("native release environment", () => {
  it.each(["ios", "android"] as const)("accepts a safe %s production environment", (platform) => {
    expect(() => verify(platform)).not.toThrow();
  });

  it("requires Google services for Android preview builds", () => {
    expect(() => assertNativeBuildEnvironment({
      profile: "preview",
      platform: "android",
      env: {
        ...productionEnv(),
        EXPO_PUBLIC_API_BASE_URL: "https://preview.peek-poke.com",
        EXPO_PUBLIC_SUPABASE_URL: "https://preview.supabase.co",
      },
      productionApiOrigin,
      productionSupabaseOrigin,
    })).toThrow("GOOGLE_SERVICES_JSON");
  });

  it("rejects production origins that do not match the canonical services", () => {
    expect(() => verify("ios", productionEnv({ EXPO_PUBLIC_API_BASE_URL: "https://example.com" })))
      .toThrow(`must use ${productionApiOrigin}`);
  });

  it("rejects an enabled billing link without an eligible region and storefront", () => {
    expect(() => verify("ios", productionEnv({ EXPO_PUBLIC_IOS_WEB_BILLING_MODE: "allowed" })))
      .toThrow("Production web billing requires");
  });

  it("accepts an enabled billing link only for the canonical HTTPS page and allowlisted market", () => {
    const eligible = productionEnv({
      EXPO_PUBLIC_IOS_WEB_BILLING_MODE: "allowed",
      EXPO_PUBLIC_BILLING_REGION: "BG",
      EXPO_PUBLIC_APP_STOREFRONT: "BGR",
      EXPO_PUBLIC_WEB_BILLING_ALLOWED_REGIONS: "BG",
      EXPO_PUBLIC_WEB_BILLING_ALLOWED_STOREFRONTS: "BGR",
      EXPO_PUBLIC_WEB_BILLING_URL: `${productionApiOrigin}/premium`,
    });
    expect(() => verify("ios", eligible)).not.toThrow();
    expect(() => verify("ios", {
      ...eligible,
      EXPO_PUBLIC_WEB_BILLING_URL: "http://www.peek-poke.com/premium",
    })).toThrow(`must use ${productionApiOrigin}/premium`);
  });
});
