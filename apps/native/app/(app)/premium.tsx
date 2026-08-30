import { LinearGradient } from "expo-linear-gradient";
import { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
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
import {
  getPremiumPrice,
  managePremium,
  purchasePremium,
  refreshEntitlements,
} from "@/lib/billing";
import { fetchCurrentProfile } from "@/data/api";
import { nativeQueryKeys } from "@/data/query-keys";

const FEATURES: { icon: IconName; label: string }[] = [
  { icon: "users", label: "Unlimited rooms" },
  { icon: "image", label: "See other people's photos" },
  { icon: "eye", label: "See who viewed your profile" },
];

export default function PremiumScreen() {
  const profileQuery = useQuery({
    queryKey: nativeQueryKeys.profile.current,
    queryFn: fetchCurrentProfile,
  });
  const priceQuery = useQuery({
    queryKey: ["billing", "price"],
    queryFn: getPremiumPrice,
    staleTime: 60 * 60_000,
  });
  const profile = profileQuery.data;
  const premium = isPremium(profile);
  const [loading, setLoading] = useState<"purchase" | "manage" | null>(null);
  const [status, setStatus] = useState<{ tone: "error" | "success"; message: string } | null>(null);
  useQuery({
    queryKey: nativeQueryKeys.entitlements,
    queryFn: refreshEntitlements,
    staleTime: 30_000,
  });

  async function run(action: "purchase" | "manage") {
    setLoading(action);
    setStatus(null);
    try {
      if (action === "manage") {
        const outcome = await managePremium();
        if (outcome === "opened") {
          setStatus({ tone: "success", message: "Premium management opened in your browser." });
        }
      } else {
        const outcome = await purchasePremium();
        if (outcome === "opened") {
          setStatus({ tone: "success", message: "Premium opened in your browser." });
        }
      }
    } catch (error) {
      setStatus({
        tone: "error",
        message: error instanceof Error ? error.message : "Premium is unavailable. Try again.",
      });
    } finally {
      setLoading(null);
    }
  }

  return (
    <Screen scroll>
      <View style={styles.header}>
        <Title>Peek Premium</Title>
        <Caption>
          {premium
            ? "Your premium subscription is active."
            : "Unlock all Premium features."}
        </Caption>
      </View>

      <LinearGradient
        colors={premium ? ["#4a2874", "#21142f"] : ["#3b1778", "#201431"]}
        end={{ x: premium ? 1 : 0.05, y: 1 }}
        start={{ x: premium ? 0 : 0.95, y: 0 }}
        style={styles.card}
      >
        <View style={styles.cardHeader}>
          <IconGlyph name="premium" color="#d8c8ff" size={22} />
          <BodyBold style={styles.cardTitle}>Peek Premium</BodyBold>
          <View style={styles.unlockBadge}>
            <Caption style={styles.unlockText}>{premium ? "Active" : "Unlock everything"}</Caption>
          </View>
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
            Manage Subscription
          </Button>
        ) : (
          <Pressable
            accessibilityLabel="Upgrade to Premium"
            accessibilityRole="button"
            accessibilityState={{ busy: loading === "purchase", disabled: loading !== null }}
            disabled={loading !== null}
            onPress={() => run("purchase")}
            style={({ pressed }) => [styles.purchaseButton, pressed && styles.pressed]}
          >
            <LinearGradient
              colors={["#fbbf24", "#f59e0b"]}
              end={{ x: 1, y: 0 }}
              pointerEvents="none"
              start={{ x: 0, y: 0 }}
              style={styles.purchaseGradient}
            >
              {loading === "purchase" ? (
                <ActivityIndicator color={colors.surface} size="small" />
              ) : (
                <IconGlyph name="crown" color={colors.surface} size={16} />
              )}
              <Text style={styles.purchaseText}>Upgrade to Premium</Text>
            </LinearGradient>
          </Pressable>
        )}

        {status ? (
          <Caption
            accessibilityLiveRegion="polite"
            style={status.tone === "error" ? styles.errorStatus : styles.successStatus}
          >
            {status.message}
          </Caption>
        ) : null}

        <View>
          <Caption style={styles.muted}>From</Caption>
          <Text style={styles.price}>
            {priceQuery.data ?? "Current price"} <Text style={styles.priceUnit}>/ month</Text>
          </Text>
        </View>

        <Divider />

        {FEATURES.map(({ icon, label }) => (
          <View key={label} style={styles.featureRow}>
            <View style={styles.checkCircle}>
              <IconGlyph name="check" color={colors.success[500]} size={11} />
            </View>
            <IconGlyph name={icon} color="#c8aef5" size={14} />
            <Caption style={styles.featureText}>{label}</Caption>
          </View>
        ))}
      </LinearGradient>

      {!premium ? (
        <Caption style={styles.renewal}>Your subscription renews automatically until canceled.</Caption>
      ) : null}
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
    borderColor: "rgba(154,104,245,0.45)",
    padding: spacing[5],
    gap: spacing[4],
    overflow: "hidden",
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[2],
  },
  cardTitle: {
    color: colors.surface,
  },
  unlockBadge: {
    marginLeft: "auto",
    borderRadius: radii.pill,
    paddingHorizontal: spacing[2],
    paddingVertical: 3,
    backgroundColor: colors.primary[100],
  },
  unlockText: {
    color: "#d8c8ff",
    fontFamily: fontFamilies.bold,
    fontWeight: "700",
  },
  purchaseButton: {
    height: 48,
    borderRadius: radii.pill,
    overflow: "hidden",
  },
  purchaseGradient: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing[2],
    paddingHorizontal: spacing[4],
  },
  purchaseText: {
    color: colors.surface,
    fontFamily: fontFamilies.semibold,
    fontSize: 15,
    lineHeight: 22,
    fontWeight: "600",
  },
  pressed: {
    opacity: 0.82,
  },
  successStatus: {
    color: "#8be4ba",
    textAlign: "center",
  },
  errorStatus: {
    color: "#fecaca",
    textAlign: "center",
  },
  muted: {
    color: "rgba(255,255,255,0.58)",
  },
  price: {
    color: colors.surface,
    fontFamily: fontFamilies.bold,
    fontSize: 24,
    lineHeight: 28,
    fontWeight: "800",
  },
  priceUnit: {
    color: "rgba(255,255,255,0.55)",
    fontFamily: fontFamilies.regular,
    fontSize: 14,
    fontWeight: "400",
  },
  featureRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[2],
  },
  checkCircle: {
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#d7f5e7",
  },
  featureText: {
    color: "rgba(255,255,255,0.86)",
  },
  renewal: {
    textAlign: "center",
  },
});
