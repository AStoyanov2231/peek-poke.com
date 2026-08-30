import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, radii, spacing, typography } from "@peekpoke/design";

interface InboxDataRecoveryProps {
  pending: boolean;
  onRetry: () => void;
}

export function InboxDataRecovery({ pending, onRetry }: InboxDataRecoveryProps) {
  return (
    <View style={styles.container}>
      <Text
        accessibilityLiveRegion="assertive"
        accessibilityRole="alert"
        style={styles.message}
      >
        Showing your previous inbox. Unread status may be outdated.
      </Text>
      <Pressable
        accessibilityLabel="Retry inbox sync"
        accessibilityRole="button"
        accessibilityState={{ busy: pending, disabled: pending }}
        disabled={pending}
        onPress={onRetry}
        style={styles.retry}
      >
        <Text style={styles.retryText}>{pending ? "Retrying…" : "Retry"}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    minHeight: 52,
    marginHorizontal: spacing[3],
    marginBottom: spacing[2],
    paddingHorizontal: spacing[3],
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.danger[500],
    backgroundColor: colors.surfaceAlt,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[3],
  },
  message: { ...typography.caption, flex: 1, color: colors.danger[500] },
  retry: { minHeight: 44, minWidth: 44, alignItems: "center", justifyContent: "center" },
  retryText: { ...typography.bodyBold, color: colors.danger[500] },
});
