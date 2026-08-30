import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { colors, radii, shadows, spacing, typography } from "@peekpoke/design";
import { Button, IconGlyph } from "@/components/ui";

export function NoCoinsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal animationType="fade" transparent visible={open} onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View accessibilityViewIsModal style={styles.card}>
          <DialogClose onPress={onClose} />
          <View style={styles.titleRow}>
            <View style={styles.coinIcon}>
              <Text style={styles.coinLetter}>C</Text>
            </View>
            <Text style={styles.title}>No Coins Left</Text>
          </View>
          <Text style={styles.description}>
            You&apos;ve used all your friend request coins! Meet your existing friends in real life (within 50m) to earn more coins. Each meetup earns +1 coin for both of you.
          </Text>
          <Button fullWidth size="sm" style={styles.dialogButton} textStyle={styles.dialogButtonText} variant="secondary" onPress={onClose}>Got it</Button>
        </View>
      </View>
    </Modal>
  );
}

export function UpgradeDialog({
  message,
  onClose,
  onUpgrade,
}: {
  message: string | null;
  onClose: () => void;
  onUpgrade: () => void;
}) {
  return (
    <Modal animationType="fade" transparent visible={message !== null} onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View accessibilityViewIsModal style={styles.card}>
          <DialogClose onPress={onClose} />
          <View style={styles.titleRow}>
            <IconGlyph name="premium" color={colors.primary[500]} size={20} />
            <Text style={styles.title}>Upgrade to Premium</Text>
          </View>
          <Text style={styles.description}>{message ?? ""}</Text>
          <View style={styles.upgradeActions}>
            <Button
              fullWidth
              leftIcon="premium"
              size="sm"
              style={styles.dialogButton}
              textStyle={styles.dialogButtonText}
              variant="accent"
              onPress={() => {
                onClose();
                onUpgrade();
              }}
            >
              Upgrade Now
            </Button>
            <Button fullWidth size="sm" style={styles.dialogButton} textStyle={styles.dialogButtonText} variant="ghost" onPress={onClose}>Maybe Later</Button>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function DialogClose({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      accessibilityLabel="Close"
      accessibilityRole="button"
      hitSlop={8}
      onPress={onPress}
      style={({ pressed }) => [styles.closeButton, pressed && styles.closeButtonPressed]}
    >
      <IconGlyph name="close" color={colors.ink[5]} size={16} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing[6],
    backgroundColor: colors.scrim,
  },
  card: {
    width: "100%",
    maxWidth: 420,
    borderRadius: radii.lg,
    padding: spacing[6],
    gap: spacing[4],
    backgroundColor: colors.surface,
    ...shadows.e3,
  },
  closeButton: {
    position: "absolute",
    top: spacing[4],
    right: spacing[4],
    zIndex: 1,
    width: 32,
    height: 32,
    borderRadius: radii.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  closeButtonPressed: {
    opacity: 0.72,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[2],
  },
  coinIcon: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: colors.warn[500],
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#faf3d1",
  },
  coinLetter: {
    color: colors.warn[500],
    fontSize: 12,
    lineHeight: 12,
    fontWeight: "700",
  },
  title: {
    ...typography.title3,
    color: colors.ink[9],
  },
  description: {
    ...typography.body,
    color: colors.ink[5],
  },
  upgradeActions: {
    gap: spacing[2],
  },
  dialogButton: {
    minHeight: 36,
  },
  dialogButtonText: {
    fontSize: 14,
    lineHeight: 20,
  },
});
