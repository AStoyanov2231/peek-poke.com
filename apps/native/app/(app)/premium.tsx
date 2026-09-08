import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { isPremium } from "@peekpoke/shared";
import { useQuery } from "@tanstack/react-query";
import { colors, fontFamilies, radii, spacing } from "@peekpoke/design";
import {
  BodyBold,
  Button,
  Caption,
  Divider,
  IconGlyph,
  Screen,
  Title,
  type IconName,
} from "@/components/ui";
import { managePremium, refreshEntitlements } from "@/lib/billing";
import { fetchCurrentProfile } from "@/data/api";
import { nativeQueryKeys } from "@/data/query-keys";

const FUTURE_EXTRAS: { icon: IconName; label: string }[] = [
  { icon: "search", label: "A little more control over discovery" },
  { icon: "profile", label: "A few thoughtful profile touches" },
  { icon: "now", label: "Optional ways to highlight a plan" },
];

export default function PremiumScreen() {
  const profileQuery = useQuery({
    queryKey: nativeQueryKeys.profile.current,
    queryFn: fetchCurrentProfile,
  });
  const profile = profileQuery.data;
  const premium = isPremium(profile);
  const [loading, setLoading] = useState<"manage" | null>(null);
  const [status, setStatus] = useState<{ tone: "error" | "success"; message: string } | null>(null);
  useQuery({
    queryKey: nativeQueryKeys.entitlements,
    queryFn: refreshEntitlements,
    staleTime: 30_000,
  });

  async function run(action: "manage") {
    setLoading(action);
    setStatus(null);
    try {
      const outcome = await managePremium();
      if (outcome === "opened") {
        setStatus({ tone: "success", message: "Billing management opened in your browser." });
      }
    } catch (error) {
      setStatus({
        tone: "error",
        message: error instanceof Error ? error.message : "Billing management is unavailable. Try again.",
      });
    } finally {
      setLoading(null);
    }
  }

  return (
    <Screen scroll>
      <View style={styles.header}>
        <Title>Peek+</Title>
        <Caption>{premium ? "Your Peek+ subscription is active." : "Optional extras, when they are ready."}</Caption>
      </View>

      <View style={[styles.card, premium && styles.activeCard]}>
        <View style={styles.cardHeader}>
          <IconGlyph name="premium" color={colors.primary[500]} size={22} />
          <BodyBold style={styles.cardTitle}>Peek+</BodyBold>
          <View style={styles.badge}>
            <Caption style={styles.badgeText}>{premium ? "Active" : "Preview"}</Caption>
          </View>
        </View>

        <View style={styles.essentials}>
          <BodyBold style={styles.essentialsTitle}>The social essentials stay free.</BodyBold>
          <Caption style={styles.essentialsCopy}>Pokes, messages, plans, and meeting up are available to everyone.</Caption>
        </View>

        {premium ? (
          <Button
            fullWidth
            variant="secondary"
            leftIcon="settings"
            loading={loading === "manage"}
            disabled={loading !== null}
            onPress={() => run("manage")}
          >
            Manage billing
          </Button>
        ) : null}

        {status ? (
          <Caption accessibilityLiveRegion="polite" style={status.tone === "error" ? styles.errorStatus : styles.successStatus}>
            {status.message}
          </Caption>
        ) : null}

        <Divider />
        <Caption style={styles.considering}>What we are considering</Caption>
        {FUTURE_EXTRAS.map(({ icon, label }) => (
          <View key={label} style={styles.featureRow}>
            <IconGlyph name={icon} color={colors.primary[500]} size={15} />
            <Caption style={styles.featureText}>{label}</Caption>
          </View>
        ))}
      </View>

      {!premium ? <Caption style={styles.renewal}>New subscriptions are not available yet, and no payment details are collected here.</Caption> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    gap: spacing[2],
  },
  card: {
    borderRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.primary[200],
    backgroundColor: colors.ink[1],
    padding: spacing[5],
    gap: spacing[4],
  },
  activeCard: {
    backgroundColor: colors.primary[50],
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[2],
  },
  cardTitle: {
    color: colors.ink[9],
  },
  badge: {
    marginLeft: "auto",
    borderRadius: radii.pill,
    paddingHorizontal: spacing[2],
    paddingVertical: 3,
    backgroundColor: colors.primary[100],
  },
  badgeText: {
    color: colors.primary[700],
    fontFamily: fontFamilies.bold,
    fontWeight: "700",
  },
  essentials: {
    gap: spacing[1],
  },
  essentialsTitle: {
    color: colors.ink[9],
  },
  essentialsCopy: {
    color: colors.ink[6],
  },
  considering: {
    color: colors.ink[7],
    fontFamily: fontFamilies.semibold,
  },
  successStatus: {
    color: colors.success[600],
    textAlign: "center",
  },
  errorStatus: {
    color: colors.danger[500],
    textAlign: "center",
  },
  featureRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[2],
  },
  featureText: {
    color: colors.ink[7],
  },
  renewal: {
    textAlign: "center",
  },
});
