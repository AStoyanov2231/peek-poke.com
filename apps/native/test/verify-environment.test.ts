import { createRequire } from "node:module";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { assertNativeBuildEnvironment } = require("../scripts/verify-environment.js") as {
  assertNativeBuildEnvironment: (options: Record<string, unknown>) => void;
};

const productionApiOrigin = "https://www.peek-poke.com";
const productionSupabaseOrigin = "https://project.supabase.co";
const fixtureDirectory = mkdtempSync(path.join(tmpdir(), "peek-firebase-config-"));
const androidPackage = "com.peekpoke.app";
const firebaseConfig = {
  project_info: { project_id: "fixture-only", project_number: "123456789" },
  client: [{
    client_info: {
      mobilesdk_app_id: "1:123456789:android:abcdef",
      android_client_info: { package_name: androidPackage },
    },
    api_key: [{ current_key: "fixture-only-key" }],
  }],
};
let fixtureIndex = 0;
function writeFirebaseFixture(config: unknown, raw = false) {
  const file = path.join(fixtureDirectory, `firebase-${fixtureIndex++}.json`);
  writeFileSync(file, raw ? String(config) : JSON.stringify(config));
  return file;
}
const googleServicesFile = writeFirebaseFixture(firebaseConfig);
afterAll(() => rmSync(fixtureDirectory, { recursive: true, force: true }));

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
    androidPackage,
    env,
    productionApiOrigin,
    productionSupabaseOrigin,
  });
}

describe("native release environment", () => {
  function verifyFirebase(file: string, platform?: "ios" | "android", profile = "production") {
    assertNativeBuildEnvironment({
      profile,
      platform,
      googleServicesFile: file,
      androidPackage,
      env: profile === "production" ? productionEnv() : productionEnv({
        EXPO_PUBLIC_API_BASE_URL: "https://preview.example.test",
        EXPO_PUBLIC_SUPABASE_URL: "https://preview.supabase.co",
      }),
      productionApiOrigin,
      productionSupabaseOrigin,
    });
  }

  it.each(["production", "preview"])("rejects a Firebase file for another Android app in %s", (profile) => {
    const config = structuredClone(firebaseConfig);
    config.client[0].client_info.android_client_info.package_name = "com.unrelated.app";
    expect(() => verifyFirebase(writeFirebaseFixture(config), "android", profile))
      .toThrow(`has no Android client for ${androidPackage}`);
  });

  it("selects the matching client from a Firebase project with several Android apps", () => {
    const config = structuredClone(firebaseConfig);
    const unrelated = structuredClone(config.client[0]);
    unrelated.client_info.android_client_info.package_name = "com.unrelated.app";
    config.client.unshift(unrelated);
    expect(() => verifyFirebase(writeFirebaseFixture(config))).not.toThrow();
  });

  it("rejects malformed JSON without leaking its contents", () => {
    const file = writeFirebaseFixture('{"private_key": "PRIVATE-FIXTURE-TEXT"', true);
    expect(() => verifyFirebase(file, "android"))
      .toThrow(/^GOOGLE_SERVICES_JSON must be a readable Firebase Android client JSON file$/);
  });

  it("rejects service-account credentials in place of client configuration", () => {
    expect(() => verifyFirebase(writeFirebaseFixture({ type: "service_account", private_key: "fixture" })))
      .toThrow("not server credentials");
  });

  it.each(["project", "app", "key"])("rejects incomplete or inconsistent Firebase %s configuration", (field) => {
    const config = structuredClone(firebaseConfig);
    if (field === "project") config.project_info.project_number = "";
    if (field === "app") config.client[0].client_info.mobilesdk_app_id = "1:987654321:android:abcdef";
    if (field === "key") config.client[0].api_key = [];
    expect(() => verifyFirebase(writeFirebaseFixture(config), "android"))
      .toThrow("missing consistent Firebase");
  });

  it("does not require Android Firebase configuration for an iOS build", () => {
    expect(() => verifyFirebase("/missing/android-only-file.json", "ios")).not.toThrow();
  });

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

  it.each(["development", "preview"])("rejects either production dependency in %s", (profile) => {
    for (const overrides of [
      { EXPO_PUBLIC_API_BASE_URL: productionApiOrigin },
      { EXPO_PUBLIC_SUPABASE_URL: productionSupabaseOrigin },
    ]) {
      expect(() => assertNativeBuildEnvironment({
        profile,
        platform: "ios",
        env: {
          ...productionEnv(),
          EXPO_PUBLIC_API_BASE_URL: "https://staging.example.test",
          EXPO_PUBLIC_SUPABASE_URL: "https://staging.supabase.co",
          ...overrides,
        },
        productionApiOrigin,
        productionSupabaseOrigin,
      })).toThrow("must not target production API or Supabase origins");
    }
  });

  it.each(["development", "preview"])("accepts isolated %s services", (profile) => {
    expect(() => assertNativeBuildEnvironment({
      profile,
      platform: "ios",
      env: productionEnv({
        EXPO_PUBLIC_API_BASE_URL: "https://staging.example.test",
        EXPO_PUBLIC_SUPABASE_URL: "https://staging.supabase.co",
      }),
      productionApiOrigin,
      productionSupabaseOrigin,
    })).not.toThrow();
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
