import { StyleSheet, Text, TextInput, View } from "react-native";
import { displayNameLength, MAX_DISPLAY_NAME_LENGTH } from "@peekpoke/shared";
import { colors, fontFamilies, radii, spacing, typography } from "@peekpoke/design";
import { Button, Caption } from "@/components/ui";

export function OwnerDisplayNameEditor({
  error,
  onCancel,
  onChange,
  onSave,
  saving,
  value,
}: {
  error: string | null;
  onCancel: () => void;
  onChange: (value: string) => void;
  onSave: () => void;
  saving: boolean;
  value: string;
}) {
  return (
    <View style={styles.editor}>
      <Caption style={styles.label}>Display name</Caption>
      <TextInput
        accessibilityLabel="Display name"
        autoCapitalize="words"
        autoComplete="name"
        onChangeText={(next) => onChange(Array.from(next).slice(0, MAX_DISPLAY_NAME_LENGTH).join(""))}
        placeholder="Your display name"
        placeholderTextColor={colors.ink[5]}
        style={styles.input}
        value={value}
      />
      <View style={styles.actions}>
        <Caption>{displayNameLength(value)}/{MAX_DISPLAY_NAME_LENGTH}</Caption>
        <View style={styles.buttons}>
          <Button disabled={saving} size="sm" variant="secondary" onPress={onCancel}>
            Cancel
          </Button>
          <Button loading={saving} size="sm" onPress={onSave}>
            Save
          </Button>
        </View>
      </View>
      {error ? (
        <Text accessibilityLiveRegion="polite" style={styles.error}>{error}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  editor: {
    marginTop: spacing[2],
    gap: spacing[2],
  },
  label: {
    color: colors.ink[8],
    fontFamily: fontFamilies.semibold,
  },
  input: {
    minHeight: 48,
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.hairline,
    backgroundColor: colors.ink[1],
    paddingHorizontal: spacing[3],
    color: colors.ink[8],
    ...typography.body,
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  buttons: {
    flexDirection: "row",
    gap: spacing[2],
  },
  error: {
    color: colors.danger[500],
    ...typography.caption,
  },
});
