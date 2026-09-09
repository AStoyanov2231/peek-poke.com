import { randomUUID } from "expo-crypto";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import type { PlanCreateRequest } from "@peekpoke/shared";
import { colors, fontFamilies, radii, spacing } from "@peekpoke/design";
import { createPlan } from "@/data/plans";
import { nativeQueryKeys } from "@/data/query-keys";
import { sharedGroupsQuery } from "@/data/social/queries";
import { refreshDeviceLocation } from "@/lib/location";
import { planDraftDefaults, planRequestFromDraft } from "./plan-composer-data";

type Props = { open: boolean; onClose: () => void; sourceThreadId?: string; initialPlaceText?: string; onCreated: (id: string) => void };

export function PlanComposer(props: Props) {
  return props.open ? <PlanComposerForm {...props} /> : null;
}

function PlanComposerForm({ onClose, sourceThreadId, initialPlaceText, onCreated }: Props) {
  const client = useQueryClient();
  const attempt = useRef<{ key: string; body: PlanCreateRequest } | null>(null);
  const [draft, setDraft] = useState(() => ({ ...planDraftDefaults(), placeText: initialPlaceText ?? "" }));
  const [error, setError] = useState("");
  const [preparing, setPreparing] = useState(false);
  const [hasAttempt, setHasAttempt] = useState(false);
  const [dateChoices] = useState(() => [0, 1].map((offset) => {
    const date = new Date(); date.setDate(date.getDate() + offset);
    return { label: offset === 0 ? "Today" : "Tomorrow", value: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}` };
  }));
  const groups = useQuery(sharedGroupsQuery());
  const mutation = useMutation({
    mutationFn: ({ key, body }: { key: string; body: PlanCreateRequest }) => createPlan(body, { idempotencyKey: key }),
    onSuccess: async ({ plan }) => { await client.invalidateQueries({ queryKey: nativeQueryKeys.plans.all }); onCreated(plan.id); },
  });
  const busy = preparing || mutation.isPending;
  const locked = busy || hasAttempt;
  const close = () => { if (!busy) onClose(); };
  const submit = async () => {
    if (busy) return;
    setError("");
    setPreparing(true);
    try {
      if (!attempt.current) {
        const body = planRequestFromDraft(draft, sourceThreadId);
        if (body.nearby_discovery) await refreshDeviceLocation();
        attempt.current = { key: randomUUID(), body };
        setHasAttempt(true);
      }
      await mutation.mutateAsync(attempt.current);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Couldn’t create this Plan. Please try again.");
    } finally { setPreparing(false); }
  };
  // Android's modal already resizes for the keyboard; a second height adjustment clips its actions.
  return <Modal transparent animationType="slide" visible onRequestClose={close}><KeyboardAvoidingView style={s.root} behavior="padding" enabled={Platform.OS === "ios"} accessibilityViewIsModal>
    <Pressable accessibilityLabel="Close plan composer" onPress={close} disabled={busy} style={s.backdrop} />
    <ScrollView testID="plan-composer-scroll" style={s.scroll} contentContainerStyle={s.sheet} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
      <Text accessibilityRole="header" style={s.title}>Make a plan</Text>
      <Text style={s.help}>{sourceThreadId ? "Give this conversation a clear time and place." : "Choose the details before you invite anyone."}</Text>
      <Field label="Activity" value={draft.activity} onChangeText={(activity) => setDraft({ ...draft, activity })} placeholder="Coffee, walk, dinner" editable={!locked} maxLength={80} />
      <Field label="Title (optional)" value={draft.title} onChangeText={(title) => setDraft({ ...draft, title })} placeholder="After work coffee" editable={!locked} maxLength={100} />
      <View style={s.choices}>{dateChoices.map((choice) => <Pressable key={choice.value} accessibilityRole="button" accessibilityState={{ selected: draft.date === choice.value }} disabled={locked} onPress={() => setDraft({ ...draft, date: choice.value })} style={[s.choice, draft.date === choice.value && s.selected]}><Text style={s.choiceText}>{choice.label}</Text></Pressable>)}</View>
      <View style={s.row}>
        <Field label="Date (YYYY-MM-DD)" value={draft.date} onChangeText={(date) => setDraft({ ...draft, date })} placeholder="YYYY-MM-DD" editable={!locked} keyboardType="numbers-and-punctuation" maxLength={10} />
        <Field label="Time (24-hour)" value={draft.time} onChangeText={(time) => setDraft({ ...draft, time })} placeholder="18:30" editable={!locked} keyboardType="numbers-and-punctuation" maxLength={5} />
      </View>
      <Text style={s.help}>Times use your device’s local time zone.</Text>
      <Field label="Public place or area" value={draft.placeText} onChangeText={(placeText) => setDraft({ ...draft, placeText })} placeholder="A café or neighborhood" editable={!locked} maxLength={200} />
      <Field label="Participant limit (including you)" value={draft.participantLimit} onChangeText={(participantLimit) => setDraft({ ...draft, participantLimit })} placeholder="6" editable={!locked} keyboardType="number-pad" maxLength={2} />
      <Text style={s.label}>Who can see it?</Text>
      <View style={s.choices}>{(["private", "friends", "circle", "open"] as const).map((visibility) => <Pressable key={visibility} accessibilityRole="radio" accessibilityState={{ checked: draft.visibility === visibility }} disabled={locked} onPress={() => setDraft({ ...draft, visibility, circleId: visibility === "circle" ? draft.circleId : null, nearbyDiscovery: visibility === "open" && draft.nearbyDiscovery })} style={[s.choice, draft.visibility === visibility && s.selected]}><Text style={s.choiceText}>{visibility === "open" ? "Open" : visibility === "friends" ? "Friends" : visibility === "circle" ? "Circle" : "Private"}</Text></Pressable>)}</View>
      {draft.visibility === "open" && <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: draft.nearbyDiscovery }} disabled={locked} onPress={() => setDraft({ ...draft, nearbyDiscovery: !draft.nearbyDiscovery })} style={s.opt}><Text style={s.choiceText}>{draft.nearbyDiscovery ? "✓ " : "○ "}Show near my current approximate area</Text><Text style={s.help}>This asks for a fresh location when you create the Plan. Choose it only if the meeting will be near you. Otherwise, people can join through your share link.</Text></Pressable>}
      {draft.visibility === "circle" && <View style={s.circleList}><Text style={s.label}>Choose Circle</Text>{groups.isPending ? <ActivityIndicator color={colors.primary[500]} /> : groups.isError ? <><Text style={s.error}>Couldn’t load your Circles.</Text><Pressable onPress={() => void groups.refetch()}><Text style={s.choiceText}>Try again</Text></Pressable></> : groups.data?.groups.length ? groups.data.groups.map((group) => <Pressable key={group.id} accessibilityRole="radio" accessibilityState={{ checked: draft.circleId === group.id }} disabled={locked} onPress={() => setDraft({ ...draft, circleId: group.id })} style={[s.choice, draft.circleId === group.id && s.selected]}><Text style={s.choiceText}>{group.name} · {group.member_count} members</Text></Pressable>) : <Text style={s.help}>You don’t have a Circle yet. Choose another audience to make this Plan.</Text>}</View>}
      {error && <Text accessibilityRole="alert" style={s.error}>{error}</Text>}
      {error && hasAttempt && <Text style={s.help}>Your request may have reached the server. Retry to recover the same Plan without creating a duplicate.</Text>}
      <Pressable accessibilityRole="button" disabled={busy} onPress={() => void submit()} style={[s.primary, busy && s.disabled]}>{busy ? <ActivityIndicator color={colors.surface} /> : <Text style={s.primaryText}>{hasAttempt ? "Retry creating plan" : "Create plan"}</Text>}</Pressable>
      <Pressable accessibilityRole="button" disabled={busy} onPress={close} style={s.cancel}><Text style={s.choiceText}>Cancel</Text></Pressable>
    </ScrollView>
  </KeyboardAvoidingView></Modal>;
}

function Field({ label, ...props }: { label: string } & React.ComponentProps<typeof TextInput>) {
  return <View style={s.field}><Text style={s.label}>{label}</Text><TextInput accessibilityLabel={label} style={s.input} placeholderTextColor={colors.ink[5]} autoCapitalize="sentences" {...props} /></View>;
}
const s = StyleSheet.create({
  root: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,.35)" },
  backdrop: { ...StyleSheet.absoluteFill }, scroll: { maxHeight: "90%", flexGrow: 0 },
  sheet: { gap: spacing[3], padding: spacing[5], paddingBottom: spacing[8], borderTopLeftRadius: radii.xl, borderTopRightRadius: radii.xl, backgroundColor: colors.surface },
  title: { fontFamily: fontFamilies.bold, fontSize: 24, color: colors.ink[9] }, field: { flex: 1, gap: 4 }, label: { fontFamily: fontFamilies.medium, color: colors.ink[8], fontSize: 13 },
  input: { minHeight: 46, paddingHorizontal: spacing[3], borderRadius: radii.md, backgroundColor: colors.ink[1], color: colors.ink[9] }, row: { flexDirection: "row", gap: spacing[2] },
  choices: { flexDirection: "row", flexWrap: "wrap", gap: spacing[2] }, choice: { minHeight: 44, justifyContent: "center", padding: spacing[3], borderWidth: 1, borderColor: colors.ink[2], borderRadius: radii.pill, backgroundColor: colors.ink[1] },
  choiceText: { color: colors.ink[9], fontFamily: fontFamilies.medium }, selected: { borderColor: colors.primary[500], backgroundColor: colors.primary[100] }, circleList: { gap: spacing[2] },
  opt: { padding: spacing[3], gap: spacing[2], borderRadius: radii.md, backgroundColor: colors.ink[1] }, help: { color: colors.ink[6], fontSize: 12, lineHeight: 18 },
  primary: { minHeight: 50, alignItems: "center", justifyContent: "center", borderRadius: radii.pill, backgroundColor: colors.primary[500] }, primaryText: { color: colors.surface, fontFamily: fontFamilies.semibold },
  error: { color: colors.danger[500] }, disabled: { opacity: 0.6 }, cancel: { alignItems: "center", padding: spacing[3] },
});
