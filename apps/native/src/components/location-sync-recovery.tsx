import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { colors, fontFamilies, radii, shadows, spacing } from "@peekpoke/design";
import { minimumTouchTarget, type NativeTouchPlatform } from "@/components/ui-touch-targets";

const minimumSize = minimumTouchTarget(Platform.OS as NativeTouchPlatform);

export function LocationSyncRecovery({
  bottom,
  pending,
  onRetry,
}: {
  bottom: number;
  pending: boolean;
  onRetry: () => void;
}) {
  return (
    <View
      accessibilityLiveRegion="assertive"
      accessibilityRole="alert"
      style={[styles.root, { bottom }]}
      testID="location-sync-recovery"
    >
      <Text style={styles.message}>Your location is stale. Nearby and meeting features are paused.</Text>
      <Pressable
        accessibilityHint="Retries location recovery to refresh nearby people"
        accessibilityLabel="Retry location sync"
        accessibilityRole="button"
        accessibilityState={{ busy: pending, disabled: pending }}
        disabled={pending}
        onPress={onRetry}
        style={styles.retry}
      >
        <Text style={styles.retryText}>{pending ? "Retrying…" : "Try again"}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    position: "absolute",
    left: spacing[4],
    right: spacing[4],
    zIndex: 55,
    minHeight: minimumSize,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing[3],
    borderRadius: radii.md,
    paddingLeft: spacing[4],
    backgroundColor: colors.ink[9],
    ...shadows.e2,
  },
  message: {
    flex: 1,
    color: colors.surface,
    fontFamily: fontFamilies.medium,
    fontSize: 12,
    lineHeight: 16,
  },
  retry: {
    minWidth: minimumSize,
    minHeight: minimumSize,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing[4],
  },
  retryText: {
    color: colors.surface,
    fontFamily: fontFamilies.semibold,
    fontSize: 13,
  },
});
