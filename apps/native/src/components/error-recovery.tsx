import type { ErrorBoundaryProps } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { colors, radii, shadows, spacing, typography } from "@peekpoke/design";
import { Button } from "@/components/ui";
import { getRecoveryAction, getRecoveryContent } from "@/components/recovery-copy";
import { recoverUnauthorizedSession } from "@/lib/session-recovery";

export function ErrorRecovery({
  error,
  onRetry,
  title = "Something went wrong",
  fill = true,
}: {
  error: unknown;
  onRetry: () => void;
  title?: string;
  fill?: boolean;
}) {
  const content = getRecoveryContent(error, title);
  const action = getRecoveryAction(error);

  return (
    <View
      accessibilityLiveRegion="assertive"
      accessibilityRole="alert"
      style={[styles.root, fill && styles.fill]}
    >
      <View style={styles.card}>
        <Text style={styles.title}>{content.title}</Text>
        <Text style={styles.message}>{content.message}</Text>
        <Button
          onPress={action.kind === "reauthenticate"
            ? () => { void recoverUnauthorizedSession(); }
            : onRetry}
          size="md"
          variant="secondary"
        >
          {action.label}
        </Button>
      </View>
    </View>
  );
}

export function RouteErrorRecovery({
  error,
  retry,
  title,
}: ErrorBoundaryProps & { title?: string }) {
  return <ErrorRecovery error={error} onRetry={retry} title={title} />;
}

const styles = StyleSheet.create({
  root: {
    alignItems: "center",
    justifyContent: "center",
    padding: spacing[4],
    backgroundColor: colors.ink[1],
  },
  fill: {
    flex: 1,
  },
  card: {
    width: "100%",
    maxWidth: 384,
    borderRadius: radii.lg,
    padding: spacing[6],
    alignItems: "center",
    gap: spacing[3],
    backgroundColor: colors.background,
    ...shadows.e1,
  },
  title: {
    ...typography.title2,
    color: colors.ink[9],
    textAlign: "center",
  },
  message: {
    ...typography.body,
    color: colors.ink[5],
    textAlign: "center",
  },
});
