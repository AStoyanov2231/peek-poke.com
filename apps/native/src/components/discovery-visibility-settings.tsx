import { useEffect, useReducer, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, radii, spacing, typography } from "@peekpoke/design";

export type DiscoveryAudience = "hidden" | "friends" | "friends_of_friends" | "circles" | "everyone";
const labels: Record<DiscoveryAudience, string> = {
  hidden: "Hidden",
  friends: "Friends",
  friends_of_friends: "Friends of friends",
  circles: "Your Circles",
  everyone: "Everyone",
};

type DraftState = { audience: DiscoveryAudience; selected: DiscoveryAudience; isDirty: boolean };
type DraftAction =
  | { type: "select"; audience: DiscoveryAudience; selected: DiscoveryAudience }
  | { type: "server"; audience: DiscoveryAudience };

function reduceDraft(state: DraftState, action: DraftAction): DraftState {
  if (action.type === "select") {
    return { audience: action.audience, selected: action.selected, isDirty: action.selected !== action.audience };
  }
  if (action.audience === state.audience) return state;
  if (!state.isDirty || state.selected === action.audience) {
    return { audience: action.audience, selected: action.audience, isDirty: false };
  }
  return { ...state, audience: action.audience };
}

export function DiscoveryVisibilitySettings({ audience, onSave }: { audience: DiscoveryAudience; onSave: (audience: DiscoveryAudience) => Promise<void> }) {
  const [draft, dispatch] = useReducer(reduceDraft, audience, (initialAudience) => ({
    audience: initialAudience,
    selected: initialAudience,
    isDirty: false,
  }));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selected = draft.selected;

  useEffect(() => {
    dispatch({ type: "server", audience });
  }, [audience]);

  async function save() {
    setPending(true);
    setError(null);
    try {
      await onSave(selected);
    }
    catch { setError("Couldn’t save visibility. Try again."); }
    finally { setPending(false); }
  }

  return <View accessibilityLabel="Discovery visibility" style={styles.container}>
    <Text style={styles.prompt}>Who can discover your approximate location and availability?</Text>
    {(Object.keys(labels) as DiscoveryAudience[]).map((value) => <Pressable
      key={value}
      accessibilityLabel={labels[value]}
      accessibilityRole="radio"
      accessibilityState={{ checked: selected === value, disabled: pending }}
      disabled={pending}
      onPress={() => dispatch({ type: "select", audience, selected: value })}
      style={({ pressed }) => [styles.option, selected === value && styles.optionSelected, pressed && styles.pressed]}
    ><Text style={styles.optionText}>{selected === value ? "● " : "○ "}{labels[value]}</Text></Pressable>)}
    {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
    <Pressable accessibilityRole="button" accessibilityState={{ disabled: pending || !draft.isDirty }} disabled={pending || !draft.isDirty} onPress={() => void save()} style={({ pressed }) => [styles.save, (pending || !draft.isDirty) && styles.disabled, pressed && styles.pressed]}>
      <Text style={styles.saveText}>{pending ? "Saving…" : error ? "Retry save" : "Save visibility"}</Text>
    </Pressable>
  </View>;
}

const styles = StyleSheet.create({
  container: { gap: spacing[2] },
  prompt: { ...typography.body, color: colors.ink[8], marginBottom: spacing[1] },
  option: { minHeight: 44, justifyContent: "center", paddingHorizontal: spacing[3], borderRadius: radii.md, backgroundColor: colors.ink[2] },
  optionSelected: { backgroundColor: colors.primary[100] },
  optionText: { ...typography.body, color: colors.ink[9] },
  error: { ...typography.caption, color: colors.danger[500] },
  save: { minHeight: 44, alignItems: "center", justifyContent: "center", marginTop: spacing[1], borderRadius: radii.pill, backgroundColor: colors.primary[500] },
  saveText: { ...typography.bodyBold, color: colors.surface },
  disabled: { opacity: 0.5 },
  pressed: { opacity: 0.72 },
});
