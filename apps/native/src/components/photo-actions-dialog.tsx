import Lock from "lucide-react-native/icons/lock";
import Star from "lucide-react-native/icons/star";
import Trash2 from "lucide-react-native/icons/trash-2";
import Unlock from "lucide-react-native/icons/lock-open";
import X from "lucide-react-native/icons/x";
import type { LucideIcon } from "lucide-react-native";
import { Alert, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import type { OwnerProfilePhoto } from "@peekpoke/shared";
import { colors, fontFamilies, radii, shadows, spacing, typography } from "@peekpoke/design";
import { Button } from "@/components/ui";

interface PhotoActionsDialogProps {
  photo: OwnerProfilePhoto | null;
  onClose: () => void;
  onDelete: (photo: OwnerProfilePhoto) => void;
  onSetAvatar: (photo: OwnerProfilePhoto) => void;
  onTogglePrivate: (photo: OwnerProfilePhoto) => void;
}

export function PhotoActionsDialog({
  photo,
  onClose,
  onDelete,
  onSetAvatar,
  onTogglePrivate,
}: PhotoActionsDialogProps) {
  const run = (action: (photo: OwnerProfilePhoto) => void) => {
    if (!photo) return;
    onClose();
    action(photo);
  };

  const confirmDelete = () => {
    if (!photo) return;
    Alert.alert(
      "Delete this photo?",
      "This action cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => run(onDelete),
        },
      ]
    );
  };

  return (
    <Modal animationType="fade" onRequestClose={onClose} transparent visible={photo !== null}>
      <View style={styles.backdrop}>
        <Pressable accessibilityLabel="Close photo actions" onPress={onClose} style={StyleSheet.absoluteFill} />
        <View accessibilityViewIsModal style={styles.card}>
          <Pressable
            accessibilityLabel="Close"
            accessibilityRole="button"
            hitSlop={8}
            onPress={onClose}
            style={({ pressed }) => [styles.closeButton, pressed && styles.pressed]}
          >
            <X color={colors.ink[5]} size={16} strokeWidth={2} />
          </Pressable>
          <View style={styles.header}>
            <Text style={styles.title}>Manage photo</Text>
            <Text style={styles.description}>Choose an action for this photo.</Text>
          </View>
          {photo ? (
            <View style={styles.actions}>
              {!photo.is_avatar && photo.approval_status === "approved" ? (
                <PhotoAction icon={Star} label="Set as Avatar" onPress={() => run(onSetAvatar)} />
              ) : null}
              {photo.approval_status === "approved" ? (
                <PhotoAction
                  icon={photo.is_private ? Unlock : Lock}
                  label={photo.is_private ? "Make Public" : "Make Private"}
                  onPress={() => run(onTogglePrivate)}
                />
              ) : null}
              <PhotoAction danger icon={Trash2} label="Delete" onPress={confirmDelete} />
            </View>
          ) : null}
          <Button fullWidth onPress={onClose} size="sm" style={styles.cancelButton} textStyle={styles.cancelText} variant="secondary">
            Cancel
          </Button>
        </View>
      </View>
    </Modal>
  );
}

function PhotoAction({
  danger = false,
  icon: Icon,
  label,
  onPress,
}: {
  danger?: boolean;
  icon: LucideIcon;
  label: string;
  onPress: () => void;
}) {
  const color = danger ? colors.danger[500] : colors.ink[9];
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.action, pressed && styles.actionPressed]}
    >
      <Icon color={color} size={16} strokeWidth={2} />
      <Text style={[styles.actionText, danger && styles.dangerText]}>{label}</Text>
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
  pressed: {
    opacity: 0.72,
  },
  header: {
    gap: 6,
  },
  title: {
    fontFamily: fontFamilies.semibold,
    fontSize: 18,
    lineHeight: 18,
    fontWeight: "600",
    color: colors.ink[9],
  },
  description: {
    ...typography.callout,
    color: colors.ink[5],
  },
  actions: {
    gap: spacing[1],
  },
  action: {
    minHeight: 44,
    borderRadius: radii.sm,
    paddingHorizontal: spacing[3],
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[2],
  },
  actionPressed: {
    backgroundColor: colors.ink[1],
  },
  actionText: {
    fontFamily: fontFamilies.medium,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "500",
    color: colors.ink[9],
  },
  dangerText: {
    color: colors.danger[500],
  },
  cancelButton: {
    minHeight: 36,
  },
  cancelText: {
    fontSize: 14,
    lineHeight: 20,
  },
});
