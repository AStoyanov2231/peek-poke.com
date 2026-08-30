import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { colors, spacing, typography } from "@peekpoke/design";
import { Button } from "@/components/ui";
import { supabase } from "@/lib/supabase";

export default function AuthCallbackScreen() {
  const params = useLocalSearchParams<{
    code?: string | string[];
    error?: string | string[];
    error_description?: string | string[];
    invite?: string | string[];
  }>();
  const started = useRef(false);
  const callbackError = first(params.error_description) ?? first(params.error);
  const code = first(params.code);
  const invalidCallback = Boolean(callbackError || !code);
  const [exchangeFailed, setExchangeFailed] = useState(false);

  useEffect(() => {
    if (started.current || invalidCallback || !code) return;
    started.current = true;

    void supabase.auth.exchangeCodeForSession(code).then(({ error: exchangeError }) => {
      if (exchangeError) {
        setExchangeFailed(true);
      }
      // SIGNED_IN is handled by the root layout, which preserves the invite
      // query and routes through onboarding before accepting it.
    });
  }, [code, invalidCallback]);

  const error = invalidCallback || exchangeFailed
    ? "This confirmation link is invalid or has expired."
    : null;

  return (
    <View style={styles.root}>
      {error ? (
        <>
          <Text accessibilityRole="alert" style={styles.title}>Couldn&apos;t confirm email</Text>
          <Text style={styles.body}>{error}</Text>
          <Button onPress={() => router.replace("/(auth)/login")}>Back to Sign In</Button>
        </>
      ) : (
        <>
          <ActivityIndicator color={colors.primary[500]} size="large" />
          <Text style={styles.title}>Confirming your email</Text>
          <Text style={styles.body}>Securely finishing sign-up…</Text>
        </>
      )}
    </View>
  );
}

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: "center",
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
});
