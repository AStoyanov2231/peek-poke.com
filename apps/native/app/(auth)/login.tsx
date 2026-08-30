import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { useLocalSearchParams } from "expo-router";
import { APP_NAME, isValidEmailFormat, validateEmail } from "@peekpoke/shared";
import { colors, fontFamilies, radii, shadows, spacing, typography } from "@peekpoke/design";
import { useEffect, useLayoutEffect, useState } from "react";
import {
  ActivityIndicator,
  // react-doctor-disable-next-line rn-prefer-reanimated
  Animated,
  Easing,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from "react-native";
import Svg, { Path } from "react-native-svg";
import { Button, IconGlyph, Screen } from "@/components/ui";
import { supabase } from "@/lib/supabase";

WebBrowser.maybeCompleteAuthSession();

type AuthMode = "signin" | "signup";
type OAuthProvider = "apple" | "google";

const MIN_PASSWORD_LENGTH = 8;
const AUTH_TAP_SCALE = 0.97;
const AUTH_BUTTON_TAP_SCALE = AUTH_TAP_SCALE * 0.98;

// This route coordinates authentication state and navigation for the screen.
// react-doctor-disable-next-line no-giant-component
export default function LoginScreen() {
  const { invite } = useLocalSearchParams<{ invite?: string }>();
  const [mode, setMode] = useState<AuthMode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [suggestion, setSuggestion] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [oauthLoading, setOauthLoading] = useState<OAuthProvider | null>(null);
  const [emailSent, setEmailSent] = useState(false);
  const [resettingPassword, setResettingPassword] = useState(false);
  const [passwordResetStatus, setPasswordResetStatus] = useState<string | null>(null);
  const authSurface = emailSent ? "sent" : "form";

  const [cardProgress] = useState(() => new Animated.Value(0));
  const [titleProgress] = useState(() => new Animated.Value(0));
  const [errorShake] = useState(() => new Animated.Value(0));
  const [appleOpacity] = useState(() => new Animated.Value(0));
  const [appleTranslateY] = useState(() => new Animated.Value(10));
  const [googleOpacity] = useState(() => new Animated.Value(0));
  const [googleTranslateY] = useState(() => new Animated.Value(10));

  useLayoutEffect(() => {
    cardProgress.stopAnimation();
    cardProgress.setValue(0);
    const animation = Animated.spring(cardProgress, {
      toValue: 1,
      damping: 25,
      stiffness: 200,
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [authSurface, cardProgress]);

  useLayoutEffect(() => {
    titleProgress.stopAnimation();
    titleProgress.setValue(0);
    const animation = Animated.timing(titleProgress, {
      toValue: 1,
      duration: 250,
      easing: Easing.out(Easing.ease),
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [mode, titleProgress]);

  useLayoutEffect(() => {
    if (authSurface !== "form") return;

    appleOpacity.setValue(0);
    appleTranslateY.setValue(10);
    googleOpacity.setValue(0);
    googleTranslateY.setValue(10);

    const itemAnimation = (opacity: Animated.Value, translateY: Animated.Value) =>
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 300,
          easing: Easing.bezier(0.25, 0.1, 0.35, 1),
          useNativeDriver: true,
        }),
        Animated.spring(translateY, {
          toValue: 0,
          damping: 25,
          stiffness: 500,
          restSpeedThreshold: 10,
          useNativeDriver: true,
        }),
      ]);

    const animation = Animated.stagger(100, [
      itemAnimation(appleOpacity, appleTranslateY),
      itemAnimation(googleOpacity, googleTranslateY),
    ]);
    animation.start();
    return () => animation.stop();
  }, [appleOpacity, appleTranslateY, authSurface, googleOpacity, googleTranslateY]);

  useEffect(() => {
    if (!error) return;
    errorShake.setValue(0);
    Animated.sequence(
      [-10, 8, -6, 4, 0].map((toValue) =>
        Animated.timing(errorShake, {
          toValue,
          duration: 80,
          useNativeDriver: true,
        })
      )
    ).start();
  }, [error, errorShake]);

  function clearError() {
    setError("");
    setSuggestion(null);
  }

  function toggleMode() {
    setMode((current) => (current === "signin" ? "signup" : "signin"));
    clearError();
  }

  function validateCredentials() {
    const normalizedEmail = email.trim().toLowerCase();

    if (mode === "signin") {
      if (!normalizedEmail || !password) {
        return { error: "Email and password are required." };
      }
      if (!isValidEmailFormat(normalizedEmail)) {
        return { error: "Please enter a valid email address." };
      }
      return { email: normalizedEmail };
    }

    if (!normalizedEmail) return { error: "Email is required." };
    if (!password) return { error: "Password is required." };
    if (password.length < MIN_PASSWORD_LENGTH) {
      return { error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` };
    }

    const emailValidation = validateEmail(normalizedEmail);
    if (!emailValidation.isValid) {
      return {
        error: emailValidation.error || "Please enter a valid email address.",
        suggestion: emailValidation.suggestion,
      };
    }

    return { email: normalizedEmail };
  }

  async function submit() {
    clearError();
    const validation = validateCredentials();
    if (validation.error || !validation.email) {
      setError(validation.error || "Please enter your details.");
      setSuggestion(validation.suggestion || null);
      return;
    }

    setLoading(true);
    try {
      const confirmationRedirect = Linking.createURL("auth/callback", {
        queryParams: invite ? { invite } : undefined,
      });
      const result =
        mode === "signin"
          ? await supabase.auth.signInWithPassword({ email: validation.email, password })
          : await supabase.auth.signUp({
              email: validation.email,
              password,
              options: { emailRedirectTo: confirmationRedirect },
            });

      if (result.error) {
        if (mode === "signin") {
          setError("Invalid email or password");
          return;
        }
        setEmailSent(true);
        return;
      }

      if (mode === "signup" && !result.data.user) {
        setError("Signup failed. Please try again.");
        return;
      }

      if (mode === "signup" && !result.data.session) {
        setEmailSent(true);
      }
    } catch {
      setError(mode === "signin" ? "Invalid email or password" : "Could not create account");
    } finally {
      setLoading(false);
    }
  }

  async function signInWithOAuth(provider: OAuthProvider) {
    clearError();
    setOauthLoading(provider);
    const redirectTo = Linking.createURL("auth/callback", {
      queryParams: invite ? { invite } : undefined,
    });

    try {
      const options = {
        redirectTo,
        skipBrowserRedirect: true,
        ...(provider === "google" ? { queryParams: { prompt: "select_account" } } : {}),
      };
      const { data, error: oauthError } = await supabase.auth.signInWithOAuth({ provider, options });
      if (oauthError) throw oauthError;
      if (!data.url) throw new Error("The provider did not return a sign-in URL.");

      const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
      if (result.type !== "success") return;

      const callbackUrl = new URL(result.url);
      const hashParams = new URLSearchParams(callbackUrl.hash.replace(/^#/, ""));
      const callbackError = callbackUrl.searchParams.get("error_description") || hashParams.get("error_description");
      if (callbackError) throw new Error(callbackError);

      const code = callbackUrl.searchParams.get("code");
      if (code) {
        const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
        if (exchangeError) throw exchangeError;
        return;
      }
      throw new Error("The provider did not return a valid authorization code.");
    } catch {
      const providerName = provider === "apple" ? "Apple" : "Google";
      setError(`Could not sign in with ${providerName}. Please try again.`);
    } finally {
      setOauthLoading(null);
    }
  }

  async function requestPasswordRecovery() {
    if (resettingPassword) return;
    const normalizedEmail = email.trim().toLowerCase();
    if (!isValidEmailFormat(normalizedEmail)) {
      setPasswordResetStatus("Enter a valid email address first.");
      return;
    }

    setResettingPassword(true);
    setPasswordResetStatus(null);
    try {
      const redirectTo = Linking.createURL("auth/reset-password");
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(normalizedEmail, {
        redirectTo,
      });
      setPasswordResetStatus(
        resetError
          ? "We could not send a reset link yet. Please wait a moment and try again."
          : "If an account exists for that email, a password-reset link has been sent."
      );
    } catch {
      setPasswordResetStatus("We could not send a reset link yet. Please wait a moment and try again.");
    } finally {
      setResettingPassword(false);
    }
  }

  const cardAnimation = {
    opacity: cardProgress,
    transform: [
      {
        translateY: cardProgress.interpolate({
          inputRange: [0, 1],
          outputRange: [30, 0],
        }),
      },
    ],
  };

  return (
    <Screen contentStyle={styles.screen}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.keyboard}>
        <View style={styles.wordmark}>
          <Text style={styles.wordmarkText}>{APP_NAME}</Text>
        </View>

        {emailSent ? (
          <Animated.View style={[styles.messageCard, cardAnimation]}>
            <AuthMessage
              tone="primary"
              title="Check your email"
              description="We sent a confirmation link to your email. Click it to complete signup."
              action="Back to Sign In"
              onPress={() => {
                setEmailSent(false);
                setMode("signin");
              }}
            />
          </Animated.View>
        ) : (
          <Animated.View style={[styles.card, cardAnimation]}>
            <Animated.Text
              style={[
                styles.title,
                {
                  opacity: titleProgress,
                  transform: [
                    {
                      translateY: titleProgress.interpolate({
                        inputRange: [0, 1],
                        outputRange: [10, 0],
                      }),
                    },
                  ],
                },
              ]}
            >
              {mode === "signin" ? "Sign in" : "Welcome"}
            </Animated.Text>

            <View style={styles.form}>
              <InputWithIcon
                icon="at-sign"
                accessibilityLabel="Email"
                autoCapitalize="none"
                autoComplete="email"
                keyboardType="email-address"
                placeholder="Email"
                returnKeyType="next"
                value={email}
                onChangeText={setEmail}
              />
              <InputWithIcon
                icon="lock"
                accessibilityLabel="Password"
                autoCapitalize="none"
                autoComplete={mode === "signin" ? "current-password" : "new-password"}
                placeholder="Password"
                returnKeyType="done"
                secureTextEntry
                value={password}
                onChangeText={setPassword}
                onSubmitEditing={submit}
              />

              {mode === "signin" ? (
                <Pressable
                  accessibilityRole="button"
                  disabled={resettingPassword}
                  onPress={requestPasswordRecovery}
                  style={({ pressed }) => [styles.forgotButton, pressed && { opacity: 0.7 }]}
                >
                  <Text style={styles.forgotButtonText}>
                    {resettingPassword ? "Sending…" : "Forgot password?"}
                  </Text>
                </Pressable>
              ) : null}

              {passwordResetStatus ? (
                <Text accessibilityLiveRegion="polite" style={styles.resetStatus}>
                  {passwordResetStatus}
                </Text>
              ) : null}

              {error ? (
                <Animated.View
                  accessibilityLiveRegion="polite"
                  style={[styles.alert, { transform: [{ translateX: errorShake }] }]}
                >
                  <IconGlyph name="alert" color={colors.danger[500]} size={16} />
                  <Text style={styles.alertText}>
                    {error}
                    {suggestion ? (
                      <Text
                        accessibilityRole="button"
                        onPress={() => {
                          setEmail(suggestion);
                          clearError();
                        }}
                        style={styles.suggestion}
                      >
                        {" "}Use this email
                      </Text>
                    ) : null}
                  </Text>
                </Animated.View>
              ) : null}

              <Button
                fullWidth
                loading={loading}
                disabled={loading || oauthLoading !== null}
                onPress={submit}
                pressedScale={AUTH_BUTTON_TAP_SCALE}
                style={styles.primaryButton}
                textStyle={styles.primaryButtonText}
              >
                {mode === "signin" ? "Sign In" : "Create Account"}
              </Button>
            </View>

            <Button
              fullWidth
              size="md"
              variant="secondary"
              disabled={loading || oauthLoading !== null}
              onPress={toggleMode}
              pressedScale={AUTH_TAP_SCALE}
              style={styles.secondaryButton}
              textStyle={styles.secondaryButtonText}
            >
              {mode === "signin" ? "Create Account" : "Sign In Instead"}
            </Button>

            <View style={styles.dividerRow}>
              <View style={styles.divider} />
              <Text style={styles.dividerText}>or continue with</Text>
              <View style={styles.divider} />
            </View>

            <View style={styles.oauthRow}>
              <Animated.View
                style={[styles.oauthItem, { opacity: appleOpacity, transform: [{ translateY: appleTranslateY }] }]}
              >
                <OAuthButton
                  provider="apple"
                  loading={oauthLoading === "apple"}
                  disabled={loading || oauthLoading !== null}
                  onPress={() => signInWithOAuth("apple")}
                />
              </Animated.View>
              <Animated.View
                style={[styles.oauthItem, { opacity: googleOpacity, transform: [{ translateY: googleTranslateY }] }]}
              >
                <OAuthButton
                  provider="google"
                  loading={oauthLoading === "google"}
                  disabled={loading || oauthLoading !== null}
                  onPress={() => signInWithOAuth("google")}
                />
              </Animated.View>
            </View>
          </Animated.View>
        )}
      </KeyboardAvoidingView>
    </Screen>
  );
}

function AuthMessage({
  tone,
  title,
  description,
  action,
  loading,
  onPress,
  secondaryAction,
  onSecondaryPress,
}: {
  tone: "warning" | "primary";
  title: string;
  description: string;
  action: string;
  loading?: boolean;
  onPress: () => void;
  secondaryAction?: string;
  onSecondaryPress?: () => void;
}) {
  const warning = tone === "warning";
  return (
    <View style={styles.messageContent}>
      <View style={[styles.messageIcon, warning ? styles.messageIconWarning : styles.messageIconPrimary]}>
        <IconGlyph name="inbox" color={warning ? colors.warn[500] : colors.primary[500]} size={32} />
      </View>
      <Text style={styles.messageTitle}>{title}</Text>
      <Text style={styles.messageDescription}>{description}</Text>
      <Button disabled={loading} loading={loading} onPress={onPress} pressedScale={AUTH_TAP_SCALE} style={styles.messageButton}>
        {action}
      </Button>
      {secondaryAction && onSecondaryPress ? (
        <Button onPress={onSecondaryPress} size="md" variant="ghost">
          {secondaryAction}
        </Button>
      ) : null}
    </View>
  );
}

function InputWithIcon(props: TextInputProps & { icon: "at-sign" | "lock" }) {
  const { icon, onBlur, onFocus, style, ...inputProps } = props;
  const [focused, setFocused] = useState(false);
  return (
    <View style={[styles.inputWrap, focused && styles.inputWrapFocused]}>
      <IconGlyph name={icon} color={colors.ink[5]} size={20} />
      <TextInput
        placeholderTextColor={colors.ink[5]}
        {...inputProps}
        onBlur={(event) => {
          setFocused(false);
          onBlur?.(event);
        }}
        onFocus={(event) => {
          setFocused(true);
          onFocus?.(event);
        }}
        style={[styles.input, style]}
      />
    </View>
  );
}

function OAuthButton({
  provider,
  loading,
  disabled,
  onPress,
}: {
  provider: OAuthProvider;
  loading: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  const label = provider === "apple" ? "Apple" : "Google";
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Continue with ${label}`}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.oauthButton,
        disabled && styles.buttonDisabled,
        pressed && !disabled && styles.oauthButtonPressed,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={colors.ink[8]} />
      ) : (
        <>
          {provider === "apple" ? <AppleLogo /> : <GoogleLogo />}
          <Text style={styles.oauthButtonText}>{label}</Text>
        </>
      )}
    </Pressable>
  );
}

function AppleLogo() {
  return (
    <Svg accessible={false} width={16} height={16} viewBox="0 0 24 24" fill={colors.ink[9]}>
      <Path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09l.01-.01zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
    </Svg>
  );
}

function GoogleLogo() {
  return (
    <Svg accessible={false} width={16} height={16} viewBox="0 0 24 24" fill="none">
      <Path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
      <Path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
      <Path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
      <Path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
    </Svg>
  );
}

const styles = StyleSheet.create({
  screen: {
    justifyContent: "center",
    paddingBottom: spacing[4],
    backgroundColor: colors.ink[1],
  },
  keyboard: {
    flex: 1,
    justifyContent: "center",
  },
  wordmark: {
    alignItems: "center",
    marginBottom: spacing[8],
  },
  wordmarkText: {
    color: colors.ink[9],
    fontFamily: fontFamilies.bold,
    fontSize: 24,
    lineHeight: 32,
    fontWeight: "700",
    letterSpacing: -0.4,
  },
  card: {
    width: "100%",
    borderRadius: radii.lg,
    padding: spacing[6],
    backgroundColor: colors.background,
    ...shadows.e2,
  },
  title: {
    color: colors.ink[9],
    fontFamily: fontFamilies.bold,
    fontSize: 24,
    lineHeight: 32,
    fontWeight: "700",
    letterSpacing: -0.3,
    textAlign: "center",
    marginBottom: spacing[4],
  },
  form: {
    gap: spacing[3],
  },
  inputWrap: {
    height: 40,
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.hairline,
    paddingHorizontal: spacing[3],
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[2],
    backgroundColor: colors.surface,
  },
  inputWrapFocused: {
    borderWidth: 2,
    borderColor: colors.primary[400],
  },
  input: {
    flex: 1,
    height: "100%",
    paddingVertical: 0,
    color: colors.ink[8],
    fontFamily: fontFamilies.regular,
    fontSize: 16,
    lineHeight: 22,
  },
  forgotButton: {
    alignSelf: "flex-end",
    paddingVertical: spacing[1],
  },
  forgotButtonText: {
    ...typography.caption,
    color: colors.primary[500],
    fontFamily: fontFamilies.medium,
  },
  resetStatus: {
    ...typography.caption,
    color: colors.ink[5],
    textAlign: "center",
  },
  alert: {
    minHeight: 48,
    borderRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(229,72,63,0.3)",
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing[3],
    backgroundColor: colors.background,
  },
  alertText: {
    ...typography.callout,
    flex: 1,
    color: colors.danger[500],
  },
  suggestion: {
    color: colors.primary[500],
    textDecorationLine: "underline",
  },
  primaryButton: {
    height: 48,
    borderRadius: radii.pill,
  },
  primaryButtonText: {
    fontSize: 16,
    lineHeight: 24,
    textTransform: "uppercase",
  },
  secondaryButton: {
    height: 44,
    marginTop: spacing[2],
    borderRadius: radii.pill,
  },
  secondaryButtonText: {
    color: colors.primary[500],
    fontSize: 14,
    lineHeight: 20,
  },
  dividerRow: {
    marginVertical: spacing[4],
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[4],
  },
  divider: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.hairline,
  },
  dividerText: {
    color: colors.ink[5],
    fontFamily: fontFamilies.regular,
    fontSize: 14,
    lineHeight: 20,
  },
  oauthRow: {
    flexDirection: "row",
    gap: spacing[3],
  },
  oauthItem: {
    flex: 1,
  },
  oauthButton: {
    width: "100%",
    height: 48,
    borderRadius: radii.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.hairline,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing[2],
    backgroundColor: colors.surface,
    ...shadows.e1,
  },
  oauthButtonPressed: {
    opacity: 0.82,
    transform: [{ scale: AUTH_BUTTON_TAP_SCALE }],
  },
  oauthButtonText: {
    color: colors.ink[8],
    fontFamily: fontFamilies.medium,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "500",
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  messageCard: {
    width: "100%",
    borderRadius: radii.lg,
    padding: spacing[8],
    backgroundColor: colors.background,
    ...shadows.e2,
  },
  messageContent: {
    alignItems: "center",
  },
  messageIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing[4],
  },
  messageIconWarning: {
    backgroundColor: "#fef3c7",
  },
  messageIconPrimary: {
    backgroundColor: colors.primary[50],
  },
  messageTitle: {
    color: colors.ink[9],
    fontFamily: fontFamilies.bold,
    fontSize: 24,
    lineHeight: 32,
    fontWeight: "700",
    textAlign: "center",
    marginBottom: spacing[2],
  },
  messageDescription: {
    ...typography.body,
    color: colors.ink[5],
    textAlign: "center",
    marginBottom: spacing[6],
  },
  messageButton: {
    minWidth: 132,
    borderRadius: radii.pill,
    paddingHorizontal: spacing[6],
  },
});
