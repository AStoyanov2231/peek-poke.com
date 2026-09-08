import { useMemo, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { availabilityDurationForEnd, type Activity, type AvailabilityUpsertRequest } from "@peekpoke/shared";
import { colors, fontFamilies, radii, spacing } from "@peekpoke/design";

export const availabilityActivities: readonly { value: Activity; label: string; emoji: string }[] = [
  { value: "coffee", label: "Coffee", emoji: "☕" }, { value: "food", label: "Food", emoji: "🍜" },
  { value: "walk", label: "Walk", emoji: "🚶" }, { value: "gym", label: "Gym", emoji: "🏋️" },
  { value: "study", label: "Study", emoji: "📚" }, { value: "drinks", label: "Drinks", emoji: "🍸" },
  { value: "gaming", label: "Gaming", emoji: "🎮" }, { value: "explore", label: "Explore", emoji: "🗺️" },
  { value: "anything", label: "Anything", emoji: "✨" }, { value: "custom", label: "Custom", emoji: "✎" },
];

function localDateInput(date: Date) {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}
function localEnd(value: string) {
  const normalized = value.trim().replace(" ", "T");
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function AvailabilityEditor({ pending, error, onSave }: { pending: boolean; error?: string; onSave: (request: AvailabilityUpsertRequest) => void }) {
  const [activity, setActivity] = useState<Activity>("coffee");
  const [duration, setDuration] = useState("60");
  const [customLabel, setCustomLabel] = useState("");
  const [customEnd, setCustomEnd] = useState(() => localDateInput(new Date(Date.now() + 3_600_000)));
  const [validation, setValidation] = useState("");
  const now = new Date();
  const afternoon = useMemo(() => { const date = new Date(); date.setHours(18, 0, 0, 0); return date; }, []);
  const tonight = useMemo(() => { const date = new Date(); date.setHours(23, 0, 0, 0); return date; }, []);
  const submit = () => {
    const end = duration === "afternoon" ? afternoon : duration === "tonight" ? tonight : localEnd(customEnd);
    const durationMinutes = /^\d+$/.test(duration) ? Number(duration) : end ? availabilityDurationForEnd(end, now) : null;
    if (durationMinutes === null) return setValidation("Choose an end between 15 minutes and 12 hours from now.");
    if (activity === "custom" && !customLabel.trim()) return setValidation("Name your activity first.");
    setValidation("");
    onSave({ activity, customLabel: activity === "custom" ? customLabel.trim() : null, durationMinutes });
  };
  const options = ["30", "60", "120", "240", "afternoon", "tonight", "custom"] as const;
  const label = (option: typeof options[number]) => option === "afternoon" ? "Until 6 pm" : option === "tonight" ? "Until 11 pm" : option === "custom" ? "Choose end" : option === "60" ? "1 hour" : option === "120" ? "2 hours" : option === "240" ? "4 hours" : "30 min";
  return <View style={styles.card}><Text style={styles.title}>What are you up for?</Text><View style={styles.grid}>{availabilityActivities.map((item) => <Pressable key={item.value} accessibilityRole="button" accessibilityState={{ selected: activity === item.value }} onPress={() => setActivity(item.value)} style={[styles.chip, activity === item.value && styles.chipSelected]}><Text>{item.emoji}</Text><Text style={[styles.chipText, activity === item.value && styles.chipTextSelected]}>{item.label}</Text></Pressable>)}</View>{activity === "custom" ? <TextInput accessibilityLabel="Custom activity" value={customLabel} onChangeText={setCustomLabel} maxLength={48} placeholder="e.g. Gallery visit" style={styles.input} /> : null}<Text style={styles.title}>When does it end?</Text><View style={styles.grid}>{options.map((option) => <Pressable key={option} accessibilityRole="button" accessibilityState={{ selected: duration === option }} onPress={() => setDuration(option)} style={[styles.chip, duration === option && styles.chipSelected]}><Text style={[styles.chipText, duration === option && styles.chipTextSelected]}>{label(option)}</Text></Pressable>)}</View>{duration === "custom" ? <TextInput accessibilityLabel="Available until" value={customEnd} onChangeText={setCustomEnd} placeholder="YYYY-MM-DDTHH:mm" style={styles.input} autoCapitalize="none" /> : null}{validation || error ? <Text accessibilityRole="alert" style={styles.error}>{validation || error}</Text> : null}<Pressable accessibilityRole="button" disabled={pending} onPress={submit} style={styles.primary}>{pending ? <ActivityIndicator color={colors.surface} /> : <Text style={styles.primaryText}>I’m up for it</Text>}</Pressable><Text style={styles.note}>Your availability ends automatically. Exact location stays private.</Text></View>;
}
const styles = StyleSheet.create({ card: { padding: spacing[4], gap: spacing[3], borderRadius: radii.xl, backgroundColor: colors.surface }, title: { color: colors.ink[9], fontFamily: fontFamilies.semibold, fontSize: 16 }, grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing[2] }, chip: { minHeight: 38, paddingHorizontal: spacing[3], borderRadius: radii.pill, flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: colors.ink[2] }, chipSelected: { backgroundColor: colors.primary[500] }, chipText: { color: colors.ink[8], fontFamily: fontFamilies.medium, fontSize: 13 }, chipTextSelected: { color: colors.surface }, input: { minHeight: 46, paddingHorizontal: spacing[3], borderRadius: radii.md, color: colors.ink[9], backgroundColor: colors.ink[2] }, error: { color: colors.danger[500], fontFamily: fontFamilies.regular }, primary: { minHeight: 48, borderRadius: radii.pill, alignItems: "center", justifyContent: "center", backgroundColor: colors.primary[500] }, primaryText: { color: colors.surface, fontFamily: fontFamilies.semibold }, note: { color: colors.ink[5], fontFamily: fontFamilies.regular, fontSize: 12 } });
