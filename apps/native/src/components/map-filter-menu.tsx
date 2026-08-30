import { colors, fontFamilies, radii, shadows, spacing } from "@peekpoke/design";
import { Modal, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { type NativeTouchPlatform } from "@/components/ui-touch-targets";
import {
  mapFilterOptionAccessibility,
  mapFilterOptionMinHeight,
  mapFilterOptions,
  type MapFilter,
} from "@/features/map/filters";

export function MapFilterMenu({
  filter,
  open,
  onChange,
  onOpenChange,
}: {
  filter: MapFilter;
  open: boolean;
  onChange: (filter: MapFilter) => void;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Modal animationType="fade" transparent visible={open} onRequestClose={() => onOpenChange(false)}>
      <View style={styles.overlay}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close map filters"
          style={StyleSheet.absoluteFill}
          onPress={() => onOpenChange(false)}
        />
        <View accessibilityViewIsModal style={styles.sheet}>
          <Text accessibilityRole="header" style={styles.heading}>Show people</Text>
          {mapFilterOptions.map((option) => {
            const accessibility = mapFilterOptionAccessibility(option.value, option.value === filter);
            return (
              <Pressable
                accessibilityLabel={accessibility.label}
                accessibilityRole={accessibility.role}
                accessibilityState={accessibility.state}
                key={option.value}
                onPress={() => {
                  onChange(option.value);
                  onOpenChange(false);
                }}
                style={({ pressed }) => [
                  styles.option,
                  { minHeight: mapFilterOptionMinHeight(Platform.OS as NativeTouchPlatform) },
                  option.value === filter && styles.optionSelected,
                  pressed && styles.optionPressed,
                ]}
              >
                <Text style={[styles.optionText, option.value === filter && styles.optionTextSelected]}>
                  {option.label}
                </Text>
                {option.value === filter ? <Text style={styles.selectedText}>Selected</Text> : null}
              </Pressable>
            );
          })}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "flex-start",
    paddingHorizontal: spacing[3],
    paddingTop: spacing[12],
    backgroundColor: "rgba(16,16,24,0.24)",
  },
  sheet: {
    alignSelf: "flex-end",
    width: 196,
    padding: spacing[2],
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
    ...shadows.e2,
  },
  heading: {
    paddingHorizontal: spacing[2],
    paddingTop: spacing[2],
    paddingBottom: spacing[1],
    color: colors.ink[6],
    fontFamily: fontFamilies.medium,
    fontSize: 13,
    lineHeight: 18,
  },
  option: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing[3],
    borderRadius: radii.md,
  },
  optionSelected: {
    backgroundColor: colors.primary[50],
  },
  optionPressed: {
    opacity: 0.76,
  },
  optionText: {
    color: colors.ink[8],
    fontFamily: fontFamilies.medium,
    fontSize: 15,
    lineHeight: 20,
  },
  optionTextSelected: {
    color: colors.primary[700],
  },
  selectedText: {
    color: colors.primary[600],
    fontFamily: fontFamilies.medium,
    fontSize: 13,
    lineHeight: 18,
  },
});
