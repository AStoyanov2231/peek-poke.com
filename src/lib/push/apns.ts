import apn from "@parse/node-apn";

let providerSingleton: apn.Provider | null = null;

function getKey(): string {
  const raw = process.env.APNS_KEY_P8;
  if (!raw) throw new Error("APNS_KEY_P8 is not set");
  // Allow either the raw .p8 contents or a base64-encoded version (easier in Vercel env UI).
  if (raw.includes("BEGIN PRIVATE KEY")) return raw;
  return Buffer.from(raw, "base64").toString("utf8");
}

export function getApnsProvider(): apn.Provider {
  if (providerSingleton) return providerSingleton;

  const keyId = process.env.APNS_KEY_ID;
  const teamId = process.env.APNS_TEAM_ID;
  if (!keyId || !teamId) {
    throw new Error("APNS_KEY_ID and APNS_TEAM_ID must be set");
  }

  providerSingleton = new apn.Provider({
    token: { key: getKey(), keyId, teamId },
    production: process.env.APNS_PRODUCTION === "true",
  });
  return providerSingleton;
}

export function getBundleId(): string {
  const id = process.env.APNS_BUNDLE_ID;
  if (!id) throw new Error("APNS_BUNDLE_ID is not set");
  return id;
}
