import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, StyleSheet, Text, TextInput, View } from "react-native";
import { colors, radii, spacing, typography } from "@peekpoke/design";
import { Button } from "@/components/ui";
import { supabase } from "@/lib/supabase";

const MIN_PASSWORD_LENGTH = 8;

export default function ResetPasswordScreen() {
  const params = useLocalSearchParams<{ code?: string | string[] }>();
  const code = first(params.code);
  const started = useRef(false);
  const [exchangeState, setExchangeState] = useState<"pending" | "ready" | "error">("pending");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!code || started.current) return;
    started.current = true;
    void supabase.auth.exchangeCodeForSession(code).then(({ error: exchangeError }) => {
      setExchangeState(exchangeError ? "error" : "ready");
    });
  }, [code]);

  async function updatePassword() {
    setError("");
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }
    if (password !== confirmation) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) {
        setError("This recovery session is invalid or has expired. Request a new link.");
        return;
      }
      await supabase.auth.signOut();
      Alert.alert("Password updated", "Sign in with your new password.");
      router.replace("/(auth)/login");
    } catch {
      setError("We could not update your password. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  const invalid = !code || exchangeState === "error";
  if (exchangeState === "pending" && code) {
    return (
      <View style={styles.root}>
        <ActivityIndicator color={colors.primary[500]} size="large" />
        <Text style={styles.title}>Opening secure recovery</Text>
      </View>
    );
  }

  if (invalid) {
    return (
      <View style={styles.root}>
        <Text accessibilityRole="alert" style={styles.title}>Recovery link expired</Text>
        <Text style={styles.body}>Request a new password-reset link from the sign-in screen.</Text>
        <Button onPress={() => router.replace("/(auth)/login")}>Back to Sign In</Button>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <Text style={styles.title}>Set a new password</Text>
      <Text style={styles.body}>Use at least {MIN_PASSWORD_LENGTH} characters.</Text>
      <TextInput
        autoCapitalize="none"
        autoComplete="new-password"
        onChangeText={setPassword}
        placeholder="New password"
        placeholderTextColor={colors.ink[5]}
        secureTextEntry
        style={styles.input}
        value={password}
      />
      <TextInput
        autoCapitalize="none"
        autoComplete="new-password"
        onChangeText={setConfirmation}
        placeholder="Confirm new password"
        placeholderTextColor={colors.ink[5]}
        secureTextEntry
        style={styles.input}
        value={confirmation}
      />
      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
      <Button disabled={loading} fullWidth loading={loading} onPress={updatePassword}>
        Update Password
      </Button>
    </View>
  );
}

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: "center",
    gap: spacing[3],
    padding: spacing[6],
    backgroundColor: colors.ink[1],
  },
  title: {
    ...typography.title2,
    color: colors.ink[9],
    textAlign: "center",
  },
  body: {
    ...typography.body,
    color: colors.ink[5],
    textAlign: "center",
  },
  input: {
    minHeight: 52,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: radii.md,
    paddingHorizontal: spacing[4],
    color: colors.ink[9],
    backgroundColor: colors.surface,
  },
  error: {
    ...typography.caption,
    color: colors.danger[500],
    textAlign: "center",
  },
});
