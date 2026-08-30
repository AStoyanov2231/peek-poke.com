import type { NativePlatform } from "./platform";

export type WebBillingMode = "allowed" | "denied";

export type WebBillingPolicyConfig = {
  platformModes: Record<NativePlatform, WebBillingMode>;
  region: string | null;
  storefront: string | null;
  allowedRegions: string[];
  allowedStorefronts: string[];
  billingUrl: string;
};

export type WebBillingDecision =
  | { allowed: true; url: string }
  | { allowed: false; reason: "platform" | "region" | "storefront" | "url" };

function normalized(value: string | null) {
  return value?.trim().toUpperCase() || null;
}

function matchesConfiguredAllowlist(value: string | null, allowedValues: string[]) {
  if (allowedValues.length === 0) return true;
  const candidate = normalized(value);
  return candidate !== null && allowedValues.map((item) => normalized(item)).includes(candidate);
}

export function resolveWebBillingPolicy(
  platform: NativePlatform,
  config: WebBillingPolicyConfig,
): WebBillingDecision {
  if (config.platformModes[platform] !== "allowed") {
    return { allowed: false, reason: "platform" };
  }
  if (!matchesConfiguredAllowlist(config.region, config.allowedRegions)) {
    return { allowed: false, reason: "region" };
  }
  if (!matchesConfiguredAllowlist(config.storefront, config.allowedStorefronts)) {
    return { allowed: false, reason: "storefront" };
  }

  try {
    const url = new URL(config.billingUrl);
    if (url.protocol !== "https:") return { allowed: false, reason: "url" };
    return { allowed: true, url: url.toString() };
  } catch {
    return { allowed: false, reason: "url" };
  }
}

export async function performWebBillingAction(
  decision: WebBillingDecision,
  confirm: () => Promise<boolean>,
  open: (url: string) => Promise<unknown>,
) {
  if (!decision.allowed) return "denied" as const;
  if (!await confirm()) return "cancelled" as const;
  await open(decision.url);
  return "opened" as const;
}

export function mergeAuthoritativeRoles<T extends { roles?: readonly string[] }>(
  profile: T,
  roles: readonly string[],
): T {
  return { ...profile, roles: [...roles] };
}
