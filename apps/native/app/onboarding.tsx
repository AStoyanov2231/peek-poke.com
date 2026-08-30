import { router, useLocalSearchParams } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  // react-doctor-disable-next-line rn-prefer-reanimated
  Animated,
  Easing,
  Image,
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  completeOnboardingFlow,
  onboardingLoadState,
  onboardingRecoveryPolicy,
  type InterestTag,
} from "@peekpoke/shared";
import { colors, fontFamilies, radii, shadows, spacing, typography } from "@peekpoke/design";
import { IconGlyph } from "@/components/ui";
import {
  addProfileInterest,
  completeOnboarding,
  deleteProfileInterest,
  fetchCurrentProfile,
  fetchInterestTags,
  fetchProfileInterests,
  updateUsername,
} from "@/data/profile/api";
import { removeInterest } from "@/data/profile/cache";
import { nativeQueryKeys } from "@/data/query-keys";
import { onboardingKeyboardBehavior } from "@/lib/onboarding-platform";

const MIN_USERNAME_LENGTH = 3;
const MIN_INTERESTS = 5;
const logoSource = require("../../../public/images/logo.png");

const categoryEmojis: Record<string, string> = {
  "Food & Drink": "🍽️",
  Sports: "⚽",
  Music: "🎵",
  Arts: "🎨",
  Outdoors: "🏕️",
  Gaming: "🎮",
  Tech: "💻",
  Wellness: "🧘",
  Travel: "✈️",
  Social: "🎉",
};

function InlineError({ message, style }: { message: string; style?: StyleProp<ViewStyle> }) {
  const [shake] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (!message) return;
    shake.setValue(0);
    Animated.sequence(
      [-10, 8, -6, 4, 0].map((toValue) =>
        Animated.timing(shake, {
          toValue,
          duration: 80,
          useNativeDriver: true,
        })
      )
    ).start();
  }, [message, shake]);

  if (!message) return null;

  return (
    <Animated.View
      accessibilityLiveRegion="polite"
      accessibilityRole="alert"
      style={[styles.errorBox, style, { transform: [{ translateX: shake }] }]}
    >
      <IconGlyph name="alert" color={colors.danger[500]} size={16} />
      <Text style={styles.errorText}>{message}</Text>
    </Animated.View>
  );
}

// This route coordinates onboarding state, animations, and navigation for the screen.
// react-doctor-disable-next-line no-giant-component
export default function OnboardingScreen() {
  const { invite } = useLocalSearchParams<{ invite?: string }>();
  const queryClient = useQueryClient();
  const profileQuery = useQuery({
    queryKey: nativeQueryKeys.profile.current,
    queryFn: fetchCurrentProfile,
  });
  const interestsQuery = useQuery({
    queryKey: nativeQueryKeys.profile.interests,
    queryFn: fetchProfileInterests,
  });
  const tagsQuery = useQuery({
    queryKey: nativeQueryKeys.catalog.interests,
    queryFn: fetchInterestTags,
    staleTime: 60 * 60_000,
  });
  const profile = profileQuery.data ?? null;
  const storeInterests = useMemo(
    () => interestsQuery.data ?? [],
    [interestsQuery.data]
  );
  const allTags = useMemo(() => tagsQuery.data ?? [], [tagsQuery.data]);
  const initializedFromProfile = useRef(false);

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [username, setUsername] = useState("");
  const [usernameError, setUsernameError] = useState("");
  const [usernameFocused, setUsernameFocused] = useState(false);
  const [usernameSaved, setUsernameSaved] = useState(false);
  const [savingUsername, setSavingUsername] = useState(false);
  const [interestLoading, setInterestLoading] = useState<string | null>(null);
  const [interestError, setInterestError] = useState("");
  const [completing, setCompleting] = useState(false);

  const [stepOpacity] = useState(() => new Animated.Value(0));
  const [stepScale] = useState(() => new Animated.Value(0.97));
  const [heroScale] = useState(() => new Animated.Value(0));
  const [savedScale] = useState(() => new Animated.Value(0));
  const [counterScale] = useState(() => new Animated.Value(1));
  const [splashLogo] = useState(() => new Animated.Value(0));
  const [splashTitle] = useState(() => new Animated.Value(0));
  const [splashBody] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (!profile || initializedFromProfile.current) return;
    initializedFromProfile.current = true;
    setUsername(profile.username ?? "");
    setStep(profile.username ? 2 : 1);
  }, [profile]);

  useEffect(() => {
    stepOpacity.setValue(0);
    stepScale.setValue(0.97);
    Animated.parallel([
      Animated.timing(stepOpacity, {
        toValue: 1,
        duration: 300,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }),
      Animated.timing(stepScale, {
        toValue: 1,
        duration: 300,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }),
    ]).start();
  }, [step, stepOpacity, stepScale]);

  useEffect(() => {
    if (step !== 1) return;
    heroScale.setValue(0);
    Animated.spring(heroScale, {
      toValue: 1,
      delay: 100,
      damping: 15,
      stiffness: 200,
      useNativeDriver: true,
    }).start();
  }, [heroScale, step]);

  useEffect(() => {
    if (!usernameSaved) {
      savedScale.setValue(0);
      return;
    }
    Animated.spring(savedScale, {
      toValue: 1,
      damping: 15,
      stiffness: 180,
      useNativeDriver: true,
    }).start();
    const timeout = setTimeout(() => setStep(2), 600);
    return () => clearTimeout(timeout);
  }, [savedScale, usernameSaved]);

  const selectedIds = useMemo(
    () => new Set(storeInterests.map((interest) => interest.tag_id)),
    [storeInterests]
  );

  useEffect(() => {
    counterScale.setValue(1.4);
    Animated.spring(counterScale, {
      toValue: 1,
      damping: 20,
      stiffness: 300,
      useNativeDriver: true,
    }).start();
  }, [counterScale, selectedIds.size]);

  useEffect(() => {
    if (step !== 3) return;
    splashLogo.setValue(0);
    splashTitle.setValue(0);
    splashBody.setValue(0);
    Animated.sequence([
      Animated.delay(200),
      Animated.spring(splashLogo, {
        toValue: 1,
        damping: 12,
        stiffness: 150,
        useNativeDriver: true,
      }),
      Animated.timing(splashTitle, {
        toValue: 1,
        duration: 400,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }),
      Animated.timing(splashBody, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start();
  }, [splashBody, splashLogo, splashTitle, step]);

  useEffect(() => {
    if (step !== 3) return;
    const timeout = setTimeout(
      () => router.replace(invite ? (`/invite/${invite}` as never) : ("/(app)/map" as never)),
      1500
    );
    return () => clearTimeout(timeout);
  }, [invite, step]);

  const groupedTags = useMemo(() => {
    return allTags.reduce<Record<string, InterestTag[]>>((acc, tag) => {
      acc[tag.category] = acc[tag.category] ?? [];
      acc[tag.category].push(tag);
      return acc;
    }, {});
  }, [allTags]);

  const canSubmitUsername = username.length >= MIN_USERNAME_LENGTH && !savingUsername;
  const canFinish = selectedIds.size >= MIN_INTERESTS && !completing;
  const initialLoadState = onboardingLoadState({
    pending: profileQuery.isPending || interestsQuery.isPending,
    failed: profileQuery.isError || interestsQuery.isError,
    scope: "initial",
    reload: [profileQuery.refetch, interestsQuery.refetch],
  });

  async function saveUsername() {
    if (!canSubmitUsername) {
      setUsernameError(`Username must be at least ${MIN_USERNAME_LENGTH} characters`);
      return;
    }

    setSavingUsername(true);
    setUsernameError("");
    try {
      const updatedProfile = await updateUsername(username);
      queryClient.setQueryData(nativeQueryKeys.profile.current, {
        ...profile!,
        ...updatedProfile,
        roles: profile?.roles ?? [],
      });
      setUsernameSaved(true);
    } catch (error) {
      setUsernameError(error instanceof Error ? error.message : "Something went wrong. Please try again.");
    } finally {
      setSavingUsername(false);
    }
  }

  async function toggleInterest(tag: InterestTag) {
    if (interestLoading) return;
    const existing = storeInterests.find((interest) => interest.tag_id === tag.id);
    if (!existing && selectedIds.size >= MIN_INTERESTS) return;

    setInterestLoading(tag.id);
    setInterestError("");
    try {
      if (existing) {
        await deleteProfileInterest(existing.id);
        queryClient.setQueryData(
          nativeQueryKeys.profile.interests,
          removeInterest(storeInterests, existing.id)
        );
      } else {
        const interest = await addProfileInterest(tag.id);
        queryClient.setQueryData(nativeQueryKeys.profile.interests, [...storeInterests, interest]);
      }
    } catch (error) {
      setInterestError(error instanceof Error ? error.message : "Something went wrong. Please try again.");
    } finally {
      setInterestLoading(null);
    }
  }

  async function complete() {
    if (!canFinish) {
      setInterestError(`Please select at least ${MIN_INTERESTS} interests`);
      return;
    }

    setCompleting(true);
    setInterestError("");
    try {
      await completeOnboardingFlow({
        request: completeOnboarding,
        commit: async (completed) => {
          if (profile) {
            queryClient.setQueryData(nativeQueryKeys.profile.current, {
              ...profile,
              ...completed.profile,
            });
          }
          await queryClient.invalidateQueries({ queryKey: nativeQueryKeys.bootstrap });
          setStep(3);
        },
      });
    } catch (error) {
      setInterestError(error instanceof Error ? error.message : "Something went wrong. Please try again.");
      setCompleting(false);
    }
  }

  function changeUsername(next: string) {
    setUsername(next.toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 20));
    setUsernameError("");
    setUsernameSaved(false);
  }

  if (initialLoadState.kind === "loading") {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.tagsLoading}>
          <ActivityIndicator color={colors.primary[500]} size="large" />
        </View>
      </SafeAreaView>
    );
  }

  if (initialLoadState.kind === "error") {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.tagsLoading}>
          <InlineError message={initialLoadState.message} />
          <Pressable
            accessibilityRole="button"
            onPress={() => void initialLoadState.action.run()}
            style={[styles.actionButton, styles.finishButton]}
          >
            <Text style={styles.finishButtonText}>{initialLoadState.action.label}</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  if (step === 2) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <Animated.View style={[styles.fullScreen, { opacity: stepOpacity, transform: [{ scale: stepScale }] }]}>
          <ScrollView
            stickyHeaderIndices={[0]}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.interestScrollContent}
          >
            <View style={styles.interestHeader}>
              <View style={styles.maxWidth}>
                <Text style={styles.interestTitle}>Pick your interests</Text>
                <Text style={styles.interestDescription}>Select at least {MIN_INTERESTS} things you love</Text>
                <View style={styles.counterRow}>
                  <Animated.Text style={[styles.counter, { transform: [{ scale: counterScale }] }]}>
                    {selectedIds.size}
                  </Animated.Text>
                  <Text style={styles.counterMuted}>/</Text>
                  <Text style={styles.counterMuted}>{MIN_INTERESTS}</Text>
                  <View style={styles.dots}>
                    {Array.from({ length: MIN_INTERESTS }).map((_, index) => (
                      <View key={index} style={[styles.dot, index < selectedIds.size && styles.dotActive]} />
                    ))}
                  </View>
                </View>
              </View>
            </View>

            <View style={[styles.maxWidth, styles.categories]}>
              {tagsQuery.isPending ? (
                <View style={styles.tagsLoading}>
                  <ActivityIndicator color={colors.primary[500]} size="large" />
                </View>
              ) : tagsQuery.isError ? (
                <View style={styles.tagsLoading}>
                  <InlineError message={onboardingRecoveryPolicy.interests.message} />
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => void tagsQuery.refetch()}
                    style={[styles.actionButton, styles.finishButton]}
                  >
                    <Text style={styles.finishButtonText}>{onboardingRecoveryPolicy.interests.action}</Text>
                  </Pressable>
                </View>
              ) : (
                Object.entries(groupedTags).map(([category, tags]) => (
                  <View key={category} style={styles.category}>
                    <View style={styles.categoryHeading}>
                      <Text style={styles.categoryEmoji}>{categoryEmojis[category] || "📌"}</Text>
                      <Text style={styles.categoryTitle}>{category}</Text>
                    </View>
                    <View style={styles.tagWrap}>
                      {tags.map((tag) => {
                        const selected = selectedIds.has(tag.id);
                        const loading = interestLoading === tag.id;
                        const disabled = !selected && selectedIds.size >= MIN_INTERESTS;
                        return (
                          <Pressable
                            accessibilityRole="button"
                            accessibilityState={{ selected, disabled: disabled || !!interestLoading }}
                            key={tag.id}
                            disabled={disabled || !!interestLoading}
                            onPress={() => toggleInterest(tag)}
                            style={({ pressed }) => [
                              styles.tag,
                              selected && styles.tagSelected,
                              disabled && styles.tagDisabled,
                              loading && styles.tagLoading,
                              pressed && !disabled && styles.tagPressed,
                            ]}
                          >
                            {loading ? (
                              <ActivityIndicator color={selected ? colors.surface : colors.ink[9]} size={12} />
                            ) : tag.icon ? (
                              <Text style={styles.tagIcon}>{tag.icon}</Text>
                            ) : null}
                            <Text style={[styles.tagText, selected && styles.tagTextSelected]}>{tag.name}</Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>
                ))
              )}
            </View>
          </ScrollView>

          <View style={styles.bottomBar}>
            <View style={styles.maxWidth}>
              <InlineError message={interestError} style={styles.bottomError} />
              <View style={styles.actions}>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => {
                    setInterestError("");
                    setStep(1);
                  }}
                  style={({ pressed }) => [styles.actionButton, styles.backButton, pressed && styles.actionPressed]}
                >
                  <IconGlyph name="arrow-left" color={colors.ink[6]} size={16} />
                  <Text style={styles.backButtonText}>Back</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ disabled: !canFinish }}
                  disabled={!canFinish}
                  onPress={complete}
                  style={({ pressed }) => [
                    styles.actionButton,
                    canFinish ? styles.finishButton : styles.buttonDisabled,
                    pressed && canFinish && styles.actionPressed,
                  ]}
                >
                  {completing ? (
                    <ActivityIndicator color={colors.surface} />
                  ) : (
                    <Text style={[styles.finishButtonText, !canFinish && styles.buttonDisabledText]}>Finish</Text>
                  )}
                </Pressable>
              </View>
            </View>
          </View>
        </Animated.View>
      </SafeAreaView>
    );
  }

  if (step === 3) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <Animated.View style={[styles.splash, { opacity: stepOpacity, transform: [{ scale: stepScale }] }]}>
          <Animated.View style={{ transform: [{ scale: splashLogo }] }}>
            <Image
              accessibilityIgnoresInvertColors
              source={logoSource}
              style={styles.logo}
            />
          </Animated.View>
          <Animated.Text
            style={[
              styles.splashTitle,
              {
                opacity: splashTitle,
                transform: [
                  {
                    translateY: splashTitle.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }),
                  },
                ],
              },
            ]}
          >
            You{`'`}re all set, @{username}
          </Animated.Text>
          <Animated.View style={[styles.splashBody, { opacity: splashBody }]}>
            <Text style={styles.splashDescription}>Taking you to the map...</Text>
            <ActivityIndicator color={colors.primary[500]} size={24} />
          </Animated.View>
        </Animated.View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        behavior={onboardingKeyboardBehavior()}
        style={styles.keyboard}
      >
        <View style={styles.usernameContent}>
          <View style={styles.progressWrap}>
            <View style={styles.progressTrack}>
              <View style={styles.progressFill} />
            </View>
            <View style={styles.progressLabels}>
              <Text style={styles.progressLabel}>Username</Text>
              <Text style={styles.progressLabel}>Interests</Text>
            </View>
          </View>

          <Animated.View style={[styles.usernameCard, { opacity: stepOpacity, transform: [{ scale: stepScale }] }]}>
            <View style={styles.usernameHeader}>
              <Animated.View style={[styles.heroIcon, { transform: [{ scale: heroScale }] }]}>
                <IconGlyph name="at-sign" color={colors.primary[500]} size={32} />
              </Animated.View>
              <Text style={styles.usernameTitle}>Welcome to Peek &amp; Poke!</Text>
              <Text style={styles.usernameDescription}>Choose a username to get started</Text>
            </View>

            <View style={styles.form}>
              <View style={[styles.inputWrap, usernameFocused && styles.inputFocused]}>
                <IconGlyph name="at-sign" color={colors.ink[5]} size={20} />
                <TextInput
                  accessibilityLabel="Username"
                  value={username}
                  onChangeText={changeUsername}
                  onFocus={() => setUsernameFocused(true)}
                  onBlur={() => setUsernameFocused(false)}
                  placeholder="username"
                  placeholderTextColor={colors.ink[4]}
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoFocus
                  maxLength={20}
                  style={styles.input}
                  returnKeyType="next"
                  onSubmitEditing={() => {
                    if (canSubmitUsername) saveUsername();
                  }}
                />
                {usernameSaved ? (
                  <Animated.View style={{ transform: [{ scale: savedScale }] }}>
                    <IconGlyph name="check" color="#34d399" size={20} />
                  </Animated.View>
                ) : null}
              </View>

              <View style={styles.inputMeta}>
                <Text style={styles.metaText}>Letters, numbers, underscores</Text>
                <Text style={[styles.metaText, username.length >= MIN_USERNAME_LENGTH && styles.goodCount]}>
                  {username.length}/20
                </Text>
              </View>

              <InlineError message={usernameError} />

              <Pressable
                accessibilityRole="button"
                accessibilityState={{ disabled: !canSubmitUsername }}
                disabled={!canSubmitUsername}
                onPress={saveUsername}
                style={({ pressed }) => [
                  styles.continueButton,
                  canSubmitUsername ? styles.finishButton : styles.buttonDisabled,
                  pressed && canSubmitUsername && styles.actionPressed,
                ]}
              >
                {savingUsername ? (
                  <ActivityIndicator color={colors.surface} />
                ) : (
                  <>
                    <Text style={[styles.continueText, !canSubmitUsername && styles.buttonDisabledText]}>Continue</Text>
                    <IconGlyph
                      name="arrow-right"
                      color={canSubmitUsername ? colors.surface : colors.ink[4]}
                      size={20}
                    />
                  </>
                )}
              </Pressable>
            </View>
          </Animated.View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.ink[1],
  },
  fullScreen: {
    flex: 1,
  },
  maxWidth: {
    width: "100%",
    maxWidth: 512,
    alignSelf: "center",
  },
  keyboard: {
    flex: 1,
    justifyContent: "center",
  },
  usernameContent: {
    width: "100%",
    maxWidth: 544,
    alignSelf: "center",
    paddingHorizontal: spacing[4],
  },
  progressWrap: {
    width: "100%",
    maxWidth: 320,
    alignSelf: "center",
    marginBottom: spacing[8],
  },
  progressTrack: {
    height: 4,
    overflow: "hidden",
    borderRadius: radii.pill,
    backgroundColor: colors.ink[2],
  },
  progressFill: {
    width: 0,
    height: 4,
    borderRadius: radii.pill,
    backgroundColor: colors.ink[9],
  },
  progressLabels: {
    marginTop: spacing[2],
    flexDirection: "row",
    justifyContent: "space-between",
  },
  progressLabel: {
    color: colors.ink[5],
    fontFamily: fontFamilies.regular,
    fontSize: 12,
    lineHeight: 16,
  },
  usernameCard: {
    width: "100%",
    borderRadius: 24,
    padding: spacing[6],
    backgroundColor: colors.surface,
    ...shadows.e2,
  },
  usernameHeader: {
    alignItems: "center",
    marginBottom: spacing[8],
  },
  heroIcon: {
    width: 64,
    height: 64,
    marginBottom: spacing[4],
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.ink[1],
  },
  usernameTitle: {
    color: colors.ink[9],
    fontFamily: fontFamilies.bold,
    fontSize: 24,
    lineHeight: 29,
    fontWeight: "700",
    letterSpacing: -0.3,
    textAlign: "center",
    marginBottom: spacing[2],
  },
  usernameDescription: {
    ...typography.body,
    color: colors.ink[5],
    textAlign: "center",
  },
  form: {
    gap: spacing[4],
  },
  inputWrap: {
    height: 56,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.ink[3],
    paddingLeft: spacing[4],
    paddingRight: spacing[3],
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[2],
    backgroundColor: colors.surface,
  },
  inputFocused: {
    borderWidth: 2,
    borderColor: colors.primary[500],
  },
  input: {
    flex: 1,
    height: "100%",
    paddingVertical: 0,
    color: colors.ink[9],
    fontFamily: fontFamilies.regular,
    fontSize: 18,
    lineHeight: 24,
  },
  inputMeta: {
    marginTop: -spacing[2],
    paddingHorizontal: spacing[1],
    flexDirection: "row",
    justifyContent: "space-between",
  },
  metaText: {
    color: colors.ink[5],
    fontFamily: fontFamilies.regular,
    fontSize: 12,
    lineHeight: 16,
  },
  goodCount: {
    color: colors.primary[500],
  },
  errorBox: {
    minHeight: 44,
    borderRadius: 12,
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing[2],
    backgroundColor: "#fff4f3",
  },
  errorText: {
    ...typography.callout,
    flex: 1,
    color: colors.danger[500],
  },
  continueButton: {
    width: "100%",
    height: 48,
    borderRadius: radii.pill,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing[2],
  },
  continueText: {
    color: colors.surface,
    fontFamily: fontFamilies.semibold,
    fontSize: 16,
    lineHeight: 20,
    fontWeight: "600",
  },
  interestScrollContent: {
    paddingBottom: 128,
  },
  interestHeader: {
    paddingTop: spacing[6],
    paddingBottom: spacing[4],
    paddingHorizontal: spacing[4],
    backgroundColor: colors.ink[1],
  },
  interestTitle: {
    color: colors.ink[9],
    fontFamily: fontFamilies.bold,
    fontSize: 24,
    lineHeight: 29,
    fontWeight: "700",
    textAlign: "center",
    marginBottom: spacing[1],
  },
  interestDescription: {
    color: colors.ink[5],
    fontFamily: fontFamilies.regular,
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
  },
  counterRow: {
    marginTop: spacing[3],
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing[2],
  },
  counter: {
    color: colors.ink[9],
    fontFamily: fontFamilies.semibold,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "600",
  },
  counterMuted: {
    color: colors.ink[5],
    fontFamily: fontFamilies.regular,
    fontSize: 14,
    lineHeight: 20,
  },
  dots: {
    marginLeft: spacing[1],
    flexDirection: "row",
    gap: spacing[1],
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.ink[3],
  },
  dotActive: {
    backgroundColor: colors.primary[500],
    transform: [{ scale: 1.2 }],
  },
  categories: {
    paddingHorizontal: spacing[4],
    gap: spacing[6],
  },
  tagsLoading: {
    paddingVertical: 64,
    alignItems: "center",
  },
  category: {
    gap: spacing[3],
  },
  categoryHeading: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[2],
  },
  categoryEmoji: {
    fontSize: 15,
    lineHeight: 20,
  },
  categoryTitle: {
    color: colors.ink[5],
    fontFamily: fontFamilies.medium,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "500",
  },
  tagWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing[2],
  },
  tag: {
    minHeight: 36,
    borderRadius: radii.pill,
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[2],
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[1],
    backgroundColor: colors.surface,
    ...shadows.e1,
  },
  tagSelected: {
    backgroundColor: colors.ink[9],
    transform: [{ scale: 1.05 }],
  },
  tagDisabled: {
    opacity: 0.4,
  },
  tagLoading: {
    opacity: 0.5,
  },
  tagPressed: {
    transform: [{ scale: 0.92 }],
  },
  tagIcon: {
    fontSize: 14,
    lineHeight: 20,
  },
  tagText: {
    color: colors.ink[9],
    fontFamily: fontFamilies.regular,
    fontSize: 14,
    lineHeight: 20,
  },
  tagTextSelected: {
    color: colors.surface,
  },
  bottomBar: {
    position: "absolute",
    right: 0,
    bottom: 0,
    left: 0,
    paddingTop: spacing[4],
    paddingHorizontal: spacing[4],
    paddingBottom: spacing[6],
    backgroundColor: colors.ink[1],
  },
  bottomError: {
    marginBottom: spacing[3],
  },
  actions: {
    flexDirection: "row",
    gap: spacing[3],
  },
  actionButton: {
    flex: 1,
    height: 48,
    borderRadius: radii.pill,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing[2],
  },
  backButton: {
    backgroundColor: colors.surface,
    ...shadows.e2,
  },
  backButtonText: {
    color: colors.ink[6],
    fontFamily: fontFamilies.medium,
    fontSize: 16,
    lineHeight: 20,
    fontWeight: "500",
  },
  finishButton: {
    backgroundColor: colors.ink[9],
    ...shadows.e1,
  },
  finishButtonText: {
    color: colors.surface,
    fontFamily: fontFamilies.semibold,
    fontSize: 16,
    lineHeight: 20,
    fontWeight: "600",
  },
  buttonDisabled: {
    backgroundColor: colors.ink[2],
  },
  buttonDisabledText: {
    color: colors.ink[4],
  },
  actionPressed: {
    opacity: 0.82,
    transform: [{ scale: 0.97 }],
  },
  splash: {
    flex: 1,
    paddingHorizontal: spacing[4],
    alignItems: "center",
    justifyContent: "center",
  },
  logo: {
    width: 80,
    height: 80,
    marginBottom: spacing[6],
  },
  splashTitle: {
    color: colors.ink[9],
    fontFamily: fontFamilies.bold,
    fontSize: 30,
    lineHeight: 36,
    fontWeight: "700",
    textAlign: "center",
    marginBottom: spacing[3],
  },
  splashBody: {
    alignItems: "center",
    gap: spacing[8],
  },
  splashDescription: {
    ...typography.body,
    color: colors.ink[5],
    textAlign: "center",
  },
});
