import { router, useLocalSearchParams } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors, fontFamilies, radii, shadows, spacing, typography } from "@peekpoke/design";
import { fetchAgeAdmission, submitAgeAdmission } from "@/data/age-admission";
import { ApiRequestError } from "@/lib/api";
import { supabase } from "@/lib/supabase";
import { useAgeAdmission } from "@/components/age-admission-context";
import { deleteCurrentAccount } from "@/data/account-deletion";
import { nativeQueryClient } from "@/data/query-client";

function birthDateFromParts(year: string, month: string, day: string) {
  if (!/^\d{4}$/.test(year) || !/^\d{1,2}$/.test(month) || !/^\d{1,2}$/.test(day)) return null;
  const normalizedMonth = Number(month);
  const normalizedDay = Number(day);
  const date = new Date(Date.UTC(Number(year), normalizedMonth - 1, normalizedDay));
  if (
    normalizedMonth < 1 || normalizedMonth > 12
    || date.getUTCFullYear() !== Number(year)
    || date.getUTCMonth() !== normalizedMonth - 1
    || date.getUTCDate() !== normalizedDay
  ) return null;
  return `${year}-${String(normalizedMonth).padStart(2, "0")}-${String(normalizedDay).padStart(2, "0")}`;
}

function formattedDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00Z`));
}

function errorMessage(error: unknown) {
  if (!(error instanceof ApiRequestError)) return "We could not save your declaration. Try again.";
  if (error.code === "INVALID_BIRTH_DATE") return "Enter a real date using day, month, and year.";
  if (error.code === "AGE_ADMISSION_UNAVAILABLE") return "Age confirmation is temporarily unavailable. Try again shortly.";
  return "We could not save your declaration. Try again.";
}

export default function AgeAdmissionScreen() {
  const { admission, refreshAdmission } = useAgeAdmission();
  const params = useLocalSearchParams<{ invite?: string; plan_token?: string }>();
  const liveAdmission = useQuery({
    queryKey: ["age-admission"],
    queryFn: ({ signal }) => fetchAgeAdmission(signal),
    enabled: admission === null,
    staleTime: 0,
  });
  const current = admission ?? liveAdmission.data ?? null;
  const [day, setDay] = useState("");
  const [month, setMonth] = useState("");
  const [year, setYear] = useState("");
  const [reviewing, setReviewing] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmingDeletion, setConfirmingDeletion] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const monthInput = useRef<TextInput>(null);
  const yearInput = useRef<TextInput>(null);
  const birthDate = useMemo(() => birthDateFromParts(year, month, day), [day, month, year]);

  const deleteAccount = async () => {
    if (deleting) return;
    setDeleting(true);
    setError("");
    try {
      await deleteCurrentAccount(nativeQueryClient);
    } catch {
      setDeleting(false);
      setError("We could not delete your account. Try again.");
    }
  };

  if (liveAdmission.isPending && !current) {
    return <SafeAreaView style={styles.safeArea}><View style={styles.center}><ActivityIndicator color={colors.primary[500]} /></View></SafeAreaView>;
  }

  if (current?.status === "blocked") {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content}>
          <Text style={styles.eyebrow}>AGE REQUIREMENT</Text>
          <Text accessibilityRole="header" style={styles.title}>Peek &amp; Poke is for people 18 and over.</Text>
          <Text style={styles.body}>You cannot use this account.</Text>
          <AccountExitActions
            confirmingDeletion={confirmingDeletion}
            deleting={deleting}
            error={error}
            onDelete={() => void deleteAccount()}
            onShowDelete={() => setConfirmingDeletion(true)}
            onCancelDelete={() => setConfirmingDeletion(false)}
          />
        </View>
      </SafeAreaView>
    );
  }

  if (current?.status === "adult") {
    router.replace({ pathname: "/(app)/now", params });
    return null;
  }

  const continueToReview = () => {
    setError("");
    if (!birthDate) {
      setError("Enter a real date using day, month, and year.");
      return;
    }
    setReviewing(true);
  };

  const submit = async () => {
    if (!birthDate || saving) return;
    setSaving(true);
    setError("");
    try {
      const result = await submitAgeAdmission(birthDate);
      setDay("");
      setMonth("");
      setYear("");
      setReviewing(false);
      if (result.status === "adult" || result.status === "blocked") {
        await refreshAdmission();
      }
    } catch (submissionError) {
      setError(errorMessage(submissionError));
      setReviewing(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.content}>
        <Text style={styles.eyebrow}>BEFORE YOU CONTINUE</Text>
        <Text accessibilityRole="header" style={styles.title}>Confirm your age</Text>
        <Text style={styles.body}>Peek &amp; Poke is for people 18 and over. Enter your date of birth to continue.</Text>
        {reviewing && birthDate ? (
          <View style={styles.review}>
            <Text style={styles.reviewLabel}>DATE OF BIRTH</Text>
            <Text style={styles.reviewDate}>{formattedDate(birthDate)}</Text>
            <Text style={styles.reviewBody}>Check this carefully. Your age decision cannot be changed after you confirm.</Text>
            <Pressable accessibilityRole="button" disabled={saving} onPress={submit} style={({ pressed }) => [styles.primaryButton, (pressed || saving) && styles.pressed]}>
              {saving ? <ActivityIndicator color={colors.surface} /> : <Text style={styles.primaryText}>Confirm date of birth</Text>}
            </Pressable>
            <Pressable accessibilityRole="button" disabled={saving} onPress={() => setReviewing(false)} style={({ pressed }) => [styles.textButton, pressed && styles.pressed]}>
              <Text style={styles.textButtonLabel}>Edit date</Text>
            </Pressable>
          </View>
        ) : (
          <>
            <View accessibilityLabel="Date of birth" style={styles.dateRow}>
              <TextInput accessibilityLabel="Day of birth" value={day} onChangeText={(value) => setDay(value.replace(/\D/g, "").slice(0, 2))} onSubmitEditing={() => monthInput.current?.focus()} keyboardType="number-pad" returnKeyType="next" placeholder="DD" placeholderTextColor={colors.ink[4]} maxLength={2} style={styles.dateInput} />
              <TextInput ref={monthInput} accessibilityLabel="Month of birth" value={month} onChangeText={(value) => setMonth(value.replace(/\D/g, "").slice(0, 2))} onSubmitEditing={() => yearInput.current?.focus()} keyboardType="number-pad" returnKeyType="next" placeholder="MM" placeholderTextColor={colors.ink[4]} maxLength={2} style={styles.dateInput} />
              <TextInput ref={yearInput} accessibilityLabel="Year of birth" value={year} onChangeText={(value) => setYear(value.replace(/\D/g, "").slice(0, 4))} onSubmitEditing={continueToReview} keyboardType="number-pad" returnKeyType="done" placeholder="YYYY" placeholderTextColor={colors.ink[4]} maxLength={4} style={[styles.dateInput, styles.yearInput]} />
            </View>
            <Text style={styles.hint}>Use day, month, then year.</Text>
            {error ? <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={styles.error}>{error}</Text> : null}
            {liveAdmission.isError ? <Text accessibilityRole="alert" style={styles.error}>We could not check your age confirmation. Try again.</Text> : null}
            <Pressable accessibilityRole="button" onPress={continueToReview} style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}>
              <Text style={styles.primaryText}>Continue</Text>
            </Pressable>
          </>
        )}
        <Text style={styles.privacy}>We use your date of birth only to determine whether you can use Peek &amp; Poke. This is a self-declaration, not age verification.</Text>
        <AccountExitActions
          confirmingDeletion={confirmingDeletion}
          deleting={deleting}
          error={error}
          onDelete={() => void deleteAccount()}
          onShowDelete={() => setConfirmingDeletion(true)}
          onCancelDelete={() => setConfirmingDeletion(false)}
        />
      </View>
    </SafeAreaView>
  );
}

function AccountExitActions({
  confirmingDeletion,
  deleting,
  error,
  onDelete,
  onShowDelete,
  onCancelDelete,
}: {
  confirmingDeletion: boolean;
  deleting: boolean;
  error: string;
  onDelete: () => void;
  onShowDelete: () => void;
  onCancelDelete: () => void;
}) {
  if (confirmingDeletion) {
    return (
      <View style={styles.exitActions}>
        <Text style={styles.deleteCopy}>Delete your account and personal content? This cannot be undone.</Text>
        {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
        <Pressable accessibilityRole="button" disabled={deleting} onPress={onDelete} style={({ pressed }) => [styles.deleteButton, (pressed || deleting) && styles.pressed]}>
          {deleting ? <ActivityIndicator color={colors.surface} /> : <Text style={styles.primaryText}>Delete account</Text>}
        </Pressable>
        <Pressable accessibilityRole="button" disabled={deleting} onPress={onCancelDelete} style={({ pressed }) => [styles.textButton, pressed && styles.pressed]}><Text style={styles.textButtonLabel}>Keep account</Text></Pressable>
      </View>
    );
  }
  return (
    <View style={styles.exitActions}>
      <Pressable accessibilityRole="button" onPress={() => void supabase.auth.signOut()} style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}><Text style={styles.secondaryText}>Sign out</Text></Pressable>
      <Pressable accessibilityRole="button" onPress={onShowDelete} style={({ pressed }) => [styles.deleteLink, pressed && styles.pressed]}><Text style={styles.deleteLinkText}>Delete account</Text></Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  content: { flex: 1, justifyContent: "center", padding: spacing[6], gap: spacing[4] },
  eyebrow: { ...typography.caption, color: colors.primary[500], fontFamily: fontFamilies.medium, letterSpacing: 1.2 },
  title: { ...typography.title1, color: colors.ink[9], fontFamily: fontFamilies.bold },
  body: { ...typography.body, color: colors.ink[6], lineHeight: 24 },
  dateRow: { flexDirection: "row", gap: spacing[2] },
  dateInput: { flex: 1, minHeight: 56, borderRadius: radii.md, borderWidth: 1, borderColor: colors.ink[3], paddingHorizontal: spacing[3], color: colors.ink[9], backgroundColor: colors.surface, fontFamily: fontFamilies.medium, fontSize: 18, textAlign: "center" },
  yearInput: { flex: 1.45 },
  hint: { ...typography.caption, color: colors.ink[5] },
  error: { ...typography.caption, color: colors.danger[500] },
  primaryButton: { minHeight: 52, borderRadius: radii.md, alignItems: "center", justifyContent: "center", backgroundColor: colors.primary[500], ...shadows.e1 },
  primaryText: { ...typography.body, color: colors.surface, fontFamily: fontFamilies.semibold },
  secondaryButton: { minHeight: 52, borderRadius: radii.md, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.ink[3] },
  secondaryText: { ...typography.body, color: colors.ink[8], fontFamily: fontFamilies.semibold },
  textButton: { alignSelf: "center", padding: spacing[2] },
  textButtonLabel: { ...typography.body, color: colors.primary[600], fontFamily: fontFamilies.medium },
  pressed: { opacity: 0.8 },
  review: { gap: spacing[3], borderRadius: radii.lg, padding: spacing[4], backgroundColor: colors.surface, ...shadows.e1 },
  reviewLabel: { ...typography.caption, color: colors.ink[5], fontFamily: fontFamilies.medium, letterSpacing: 1 },
  reviewDate: { ...typography.title2, color: colors.ink[9], fontFamily: fontFamilies.bold },
  reviewBody: { ...typography.body, color: colors.ink[6], lineHeight: 22 },
  privacy: { ...typography.caption, color: colors.ink[5], lineHeight: 18, marginTop: spacing[2] },
  exitActions: { gap: spacing[2] },
  deleteCopy: { ...typography.caption, color: colors.ink[6], lineHeight: 18 },
  deleteButton: { minHeight: 52, borderRadius: radii.md, alignItems: "center", justifyContent: "center", backgroundColor: colors.danger[500] },
  deleteLink: { alignSelf: "center", padding: spacing[2] },
  deleteLinkText: { ...typography.caption, color: colors.danger[500], fontFamily: fontFamilies.medium },
});
