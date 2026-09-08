import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import MapPin from "lucide-react-native/icons/map-pin";
import X from "lucide-react-native/icons/x";
import { colors, radii, spacing } from "@peekpoke/design";
import { Body, Caption } from "@/components/ui";

type ChatApproximateProximityHintProps = {
  name: string;
  onPlanAgain: () => void;
  visible: boolean;
};

export function ChatApproximateProximityHint({
  name,
  onPlanAgain,
  visible,
}: ChatApproximateProximityHintProps) {
  const [dismissed, setDismissed] = useState(false);
  if (!visible || dismissed) return null;

  return (
    <View style={styles.banner}>
      <View style={styles.topRow}>
        <MapPin color={colors.primary[500]} size={17} accessibilityElementsHidden />
        <View style={styles.copy}>
          <Body style={styles.title}>
            You&apos;re in the same approximate area as {name}
          </Body>
          <Caption style={styles.detail}>If you meet, each person can mark it in chat.</Caption>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Dismiss approximate-area message"
          hitSlop={8}
          onPress={() => setDismissed(true)}
          style={styles.dismiss}
        >
          <X color={colors.primary[500]} size={16} accessibilityElementsHidden />
        </Pressable>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Make a plan with ${name}`}
        hitSlop={8}
        onPress={onPlanAgain}
        style={styles.planAction}
      >
        <Caption style={styles.planActionText}>Make a plan</Caption>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    alignItems: "stretch",
    backgroundColor: colors.primary[50],
    borderColor: colors.primary[100],
    borderRadius: radii.sm,
    borderWidth: StyleSheet.hairlineWidth,
    marginHorizontal: spacing[4],
    marginTop: spacing[3],
    minHeight: 48,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
  },
  topRow: { alignItems: "flex-start", flexDirection: "row", gap: spacing[2] },
  copy: { flex: 1, minWidth: 0 },
  title: { color: colors.primary[700] },
  detail: { color: colors.ink[6], marginTop: 2 },
  planAction: { alignSelf: "flex-start", minHeight: 44, justifyContent: "center", marginLeft: 25 },
  planActionText: { color: colors.primary[600], fontWeight: "700" },
  dismiss: { alignItems: "center", height: 44, justifyContent: "center", width: 44 },
});
