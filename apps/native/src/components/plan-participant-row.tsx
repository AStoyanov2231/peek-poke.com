import { router } from "expo-router";
import ChevronRight from "lucide-react-native/icons/chevron-right";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, fontFamilies, radii, spacing } from "@peekpoke/design";
import type { PlanReadResponse } from "@peekpoke/shared";

export function PlanParticipantRow({ member, viewerId }: {
  member: PlanReadResponse["members"][number];
  viewerId?: string;
}) {
  const name = member.display_name ?? "Plan member";
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`View ${name}'s profile`}
      accessibilityHint={member.user_id === viewerId
        ? "Opens your profile"
        : "Opens their profile and available connection and safety actions"}
      onPress={() => router.push((member.user_id === viewerId
        ? "/(app)/profile"
        : `/(app)/profile/${member.user_id}`) as never)}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <View style={styles.identity}>
        <Text style={styles.name}>{name}</Text>
        <Text style={styles.role}>{member.role === "owner" ? "Host" : "Member"}</Text>
      </View>
      <ChevronRight size={18} color={colors.ink[5]} accessible={false} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[3],
    padding: spacing[3],
    borderRadius: radii.md,
    backgroundColor: colors.surface,
  },
  pressed: { backgroundColor: colors.ink[1] },
  identity: { flex: 1, minWidth: 0 },
  name: { color: colors.ink[8], fontFamily: fontFamilies.medium, fontSize: 15 },
  role: { color: colors.ink[6], fontFamily: fontFamilies.regular, fontSize: 13 },
});
