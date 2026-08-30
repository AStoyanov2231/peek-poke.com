import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, spacing, typography } from "@peekpoke/design";

interface ReadReceiptRecoveryProps {
  pending: boolean;
  onRetry: () => void;
}

export function ReadReceiptRecovery({ pending, onRetry }: ReadReceiptRecoveryProps) {
  return (
    <View style={styles.container}>
      <Text
        accessibilityLiveRegion="assertive"
        accessibilityRole="alert"
        style={styles.message}
      >
        Unread status could not sync.
      </Text>
      <Pressable
        accessibilityLabel="Retry unread status sync"
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
    minHeight: 48,
    paddingHorizontal: spacing[4],
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing[3],
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.hairline,
    backgroundColor: colors.surfaceAlt,
  },
  message: { ...typography.caption, flex: 1, color: colors.danger[500] },
  retry: { minHeight: 44, minWidth: 44, alignItems: "center", justifyContent: "center" },
  retryText: { ...typography.bodyBold, color: colors.danger[500] },
});
