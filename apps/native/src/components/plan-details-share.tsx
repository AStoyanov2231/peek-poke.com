import { useState } from "react";
import * as Clipboard from "expo-clipboard";
import { Modal, Pressable, ScrollView, Share, StyleSheet, Text, View } from "react-native";
import { colors, fontFamilies, radii, spacing } from "@peekpoke/design";
import { planShareDetails, type Plan } from "@peekpoke/shared";

export function PlanDetailsShare({ plan }: { plan: Plan }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const text = open ? planShareDetails(plan) : "";

  async function transfer(copy: boolean) {
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      if (copy) {
        if (!await Clipboard.setStringAsync(text)) throw new Error("Clipboard unavailable");
        setStatus("Details copied. Paste them into a message to someone you trust.");
      } else {
        await Share.share({ title: plan.title ?? plan.activity, message: text });
      }
    } catch {
      setError("Could not share the details. Select and copy the preview, or try again.");
    } finally {
      setBusy(false);
    }
  }

  if (!plan.viewer_is_member || plan.status === "cancelled") return null;
  return (
    <>
      <Action label="Share details" disabled={busy} onPress={() => {
        setStatus(null);
        setError(null);
        setOpen(true);
      }} />
      <Modal transparent animationType="slide" visible={open} onRequestClose={() => setOpen(false)}>
        <View style={styles.modal}>
          <Pressable accessibilityRole="button" accessibilityLabel="Close plan details" onPress={() => setOpen(false)} style={StyleSheet.absoluteFill} />
          <View accessibilityViewIsModal style={styles.sheet}>
            <ScrollView contentContainerStyle={styles.content}>
              <Text accessibilityRole="header" style={styles.title}>Share plan details</Text>
              <Text style={styles.description}>Let someone you trust know when and where you&apos;re meeting.</Text>
              <Text selectable style={styles.preview}>{text}</Text>
              {status ? <Text accessibilityLiveRegion="polite" style={styles.status}>{status}</Text> : null}
              {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
              <Action label="Share" disabled={busy} onPress={() => void transfer(false)} />
              <Action label="Copy details" disabled={busy} onPress={() => void transfer(true)} />
              <Action label="Done" onPress={() => setOpen(false)} />
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  );
}

function Action({ label, onPress, disabled = false }: { label: string; onPress: () => void; disabled?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={onPress}
    style={({ pressed }) => [styles.action, (pressed || disabled) && styles.dimmed]}>
    <Text style={styles.actionText}>{label}</Text>
  </Pressable>;
}

const styles = StyleSheet.create({
  modal: { flex: 1, justifyContent: "center", backgroundColor: "rgba(0,0,0,0.35)", padding: spacing[5] },
  sheet: { maxHeight: "85%", borderRadius: radii.lg, backgroundColor: colors.surface },
  content: { padding: spacing[5], gap: spacing[3] },
  title: { fontFamily: fontFamilies.semibold, fontSize: 24, color: colors.ink[9] },
  description: { fontFamily: fontFamilies.regular, fontSize: 15, lineHeight: 22, color: colors.ink[6] },
  preview: { fontFamily: fontFamilies.regular, fontSize: 16, lineHeight: 25, color: colors.ink[8], paddingVertical: spacing[3] },
  status: { fontFamily: fontFamilies.regular, fontSize: 14, color: colors.success[600] },
  error: { fontFamily: fontFamilies.regular, fontSize: 14, color: colors.danger[500] },
  action: { minHeight: 48, padding: spacing[3], borderRadius: radii.md, backgroundColor: colors.ink[1], alignItems: "center", justifyContent: "center" },
  actionText: { fontFamily: fontFamilies.semibold, fontSize: 15, color: colors.ink[8] },
  dimmed: { opacity: 0.6 },
});
