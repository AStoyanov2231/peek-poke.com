import * as WebBrowser from "expo-web-browser";
import { Alert } from "react-native";
import type { EntitlementsResponse } from "@peekpoke/shared/api";
import type { CurrentProfile } from "@peekpoke/shared";
import { nativeQueryClient } from "@/data/query-client";
import { nativeQueryKeys } from "@/data/query-keys";
import { apiFetch } from "./api";
import {
  mergeAuthoritativeRoles,
  performWebBillingAction,
  resolveWebBillingPolicy,
} from "./billing-policy";
import { env } from "./env";
import { currentNativePlatform } from "./platform";

const USD_FORMATTER = new Intl.NumberFormat(undefined, {
  style: "currency",
  currency: "USD",
});

export async function refreshEntitlements() {
  const entitlements = await apiFetch<EntitlementsResponse>("/api/billing/entitlements");
  nativeQueryClient.setQueryData(nativeQueryKeys.entitlements, entitlements);
  nativeQueryClient.setQueryData<CurrentProfile>(nativeQueryKeys.profile.current, (profile) =>
    profile ? mergeAuthoritativeRoles(profile, entitlements.roles) : profile,
  );
  return entitlements;
}

export async function getPremiumPrice() {
  const price = await apiFetch<{
    amount: number;
    currency: string;
    interval: string | null;
  }>("/api/stripe/price");

  return price.currency.toUpperCase() === "USD"
    ? USD_FORMATTER.format(price.amount / 100)
    : `${price.currency.toUpperCase()} ${(price.amount / 100).toFixed(2)}`;
}

export async function purchasePremium() {
  return openConfiguredBillingPage("Upgrade on the web", "Checkout is completed securely on the Peek & Poke website.");
}

export async function managePremium() {
  return openConfiguredBillingPage("Manage Premium on the web", "Subscription management is available on the Peek & Poke website.");
}

export async function openConfiguredBillingPage(title: string, message: string) {
  const decision = resolveWebBillingPolicy(currentNativePlatform(), env.billing);
  if (!decision.allowed) {
    Alert.alert(
      "Premium account",
      "Purchasing or managing Premium from this app is not available for your current platform, storefront, or region. You can still use any Premium access already linked to your account.",
    );
  }
  return performWebBillingAction(
    decision,
    () => new Promise<boolean>((resolve) => {
      Alert.alert(title, message, [
        { text: "Cancel", style: "cancel", onPress: () => resolve(false) },
        { text: "Continue", onPress: () => resolve(true) },
      ], { cancelable: true, onDismiss: () => resolve(false) });
    }),
    (url) => WebBrowser.openBrowserAsync(url),
  );
}
