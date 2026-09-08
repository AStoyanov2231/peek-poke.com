import { router, useLocalSearchParams } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  // react-doctor-disable-next-line rn-prefer-reanimated
  Animated,
  Easing,
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
  MAX_ONBOARDING_INTERESTS,
  MIN_INTERESTS_REQUIRED,
  isTemporaryUsername,
  completeOnboardingFlow,
  onboardingLoadState,
  onboardingRecoveryPolicy,
  type InterestTag,
} from "@peekpoke/shared";
import { AvailabilityEditor } from "@/components/availability-editor";
import { saveAvailability } from "@/data/availability";
import { colors, fontFamilies, radii, shadows, spacing, typography } from "@peekpoke/design";
import { IconGlyph } from "@/components/ui";
import {
  addProfileInterest,
  completeOnboarding,
  deleteProfileInterest,
  fetchCurrentProfile,
  fetchInterestTags,
  fetchProfileInterests,
  updateProfile,
  updateUsername,
} from "@/data/profile/api";
import { removeInterest } from "@/data/profile/cache";
import { nativeQueryKeys } from "@/data/query-keys";
import { onboardingKeyboardBehavior } from "@/lib/onboarding-platform";
import { refreshDeviceLocation } from "@/lib/location";

const MIN_USERNAME_LENGTH = 3;
const MIN_INTERESTS = MIN_INTERESTS_REQUIRED;
const MAX_INTERESTS = MAX_ONBOARDING_INTERESTS;

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
  if (!message) return null;

  return (
    <View
      accessibilityLiveRegion="polite"
      accessibilityRole="alert"
      style={[styles.errorBox, style]}
    >
      <IconGlyph name="alert" color={colors.danger[500]} size={16} />
      <Text style={styles.errorText}>{message}</Text>
    </View>
  );
}

// This route coordinates onboarding state, animations, and navigation for the screen.
// react-doctor-disable-next-line no-giant-component
export default function OnboardingScreen() {
  const { invite, plan_token: planToken } = useLocalSearchParams<{
    invite?: string;
    plan_token?: string;
  }>();
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

  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [usernameError, setUsernameError] = useState("");
  const [usernameFocused, setUsernameFocused] = useState(false);
  const [usernameSaved, setUsernameSaved] = useState(false);
  const [savingUsername, setSavingUsername] = useState(false);
  const [interestLoading, setInterestLoading] = useState<string | null>(null);
  const [interestError, setInterestError] = useState("");
  const [completing, setCompleting] = useState(false);
  const [locationRequesting, setLocationRequesting] = useState(false);
  const [locationError, setLocationError] = useState("");
  const [availabilitySaving, setAvailabilitySaving] = useState(false);
  const [availabilityError, setAvailabilityError] = useState("");

  const [stepOpacity] = useState(() => new Animated.Value(0));
  const [stepScale] = useState(() => new Animated.Value(0.97));
  const [heroScale] = useState(() => new Animated.Value(0));
  const [savedScale] = useState(() => new Animated.Value(0));
  const [counterScale] = useState(() => new Animated.Value(1));

  useEffect(() => {
    if (!profile || initializedFromProfile.current) return;
    initializedFromProfile.current = true;
    setUsername(isTemporaryUsername(profile.username) ? "" : profile.username ?? "");
    setDisplayName(profile.display_name ?? "");
    setStep(profile.username && !isTemporaryUsername(profile.username) && profile.display_name ? 2 : 1);
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

  const groupedTags = useMemo(() => {
    return allTags.reduce<Record<string, InterestTag[]>>((acc, tag) => {
      acc[tag.category] = acc[tag.category] ?? [];
      acc[tag.category].push(tag);
      return acc;
    }, {});
  }, [allTags]);

  const canSubmitUsername = username.length >= MIN_USERNAME_LENGTH && displayName.trim().length > 0 && !savingUsername;
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
      const namedProfile = await updateProfile({ display_name: displayName.trim() });
      queryClient.setQueryData(nativeQueryKeys.profile.current, {
        ...profile!,
        ...updatedProfile,
        ...namedProfile,
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
    if (!existing && selectedIds.size >= MAX_INTERESTS) return;

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

  function continueToNearby() {
    if (!canFinish) {
      setInterestError(`Please select at least ${MIN_INTERESTS} interests`);
      return;
    }
    setLocationError("");
    setStep(4);
  }

  async function finishOnboarding() {
    setCompleting(true);
    setLocationError("");
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
          router.replace(
            invite
              ? (`/invite/${invite}` as never)
              : planToken && /^[A-Za-z0-9_-]{43}$/.test(planToken)
                ? (`/plan/${planToken}` as never)
                : ("/(app)/now" as never),
          );
        },
      });
    } catch (error) {
      setLocationError(error instanceof Error ? error.message : "Something went wrong. Please try again.");
      setCompleting(false);
    }
  }

  async function requestNearbyOpportunities() {
    setLocationRequesting(true);
    setLocationError("");
    try {
      await refreshDeviceLocation();
      await finishOnboarding();
    } catch (error) {
      setLocationError(error instanceof Error ? error.message : "Could not load your location. Try again or continue without it.");
    } finally {
      setLocationRequesting(false);
    }
  }

  async function saveInitialAvailability(request: Parameters<typeof saveAvailability>[0]) {
    if (availabilitySaving) return;
    setAvailabilitySaving(true);
    setAvailabilityError("");
    try {
      await saveAvailability(request);
      setStep(3);
    } catch (error) {
      setAvailabilityError(error instanceof Error ? error.message : "Couldn’t save your availability. Try again.");
    } finally {
      setAvailabilitySaving(false);
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
                <Text style={styles.interestDescription}>Select {MIN_INTERESTS} to {MAX_INTERESTS} things you love</Text>
                <View style={styles.counterRow}>
                  <Animated.Text style={[styles.counter, { transform: [{ scale: counterScale }] }]}>
                    {selectedIds.size}
                  </Animated.Text>
                  <Text style={styles.counterMuted}>/</Text>
                  <Text style={styles.counterMuted}>{MAX_INTERESTS}</Text>
                  <View style={styles.dots}>
                    {Array.from({ length: MAX_INTERESTS }).map((_, index) => (
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
                        const disabled = !selected && selectedIds.size >= MAX_INTERESTS;
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
                  onPress={continueToNearby}
                  style={({ pressed }) => [
                    styles.actionButton,
                    canFinish ? styles.finishButton : styles.buttonDisabled,
                    pressed && canFinish && styles.actionPressed,
                  ]}
                >
                  {completing ? (
                    <ActivityIndicator color={colors.surface} />
                  ) : (
                    <Text style={[styles.finishButtonText, !canFinish && styles.buttonDisabledText]}>Continue</Text>
                  )}
                </Pressable>
              </View>
            </View>
          </View>
        </Animated.View>
      </SafeAreaView>
    );
  }

  if (step === 4) {
    return <SafeAreaView style={styles.safeArea}><ScrollView contentContainerStyle={styles.locationContent}><Text style={styles.locationTitle}>Start with a little intention</Text><Text style={styles.locationDescription}>Share what you are up for when you are ready. You can change this anytime.</Text><AvailabilityEditor pending={availabilitySaving} error={availabilityError} onSave={(request) => void saveInitialAvailability(request)} /><Pressable accessibilityRole="button" disabled={availabilitySaving} onPress={() => setStep(3)} style={styles.notNowButton}><Text style={styles.notNowText}>Not now</Text></Pressable></ScrollView></SafeAreaView>;
  }

  if (step === 3) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <Animated.View style={[styles.locationContent, { opacity: stepOpacity, transform: [{ scale: stepScale }] }]}>
          <View style={styles.locationIcon}><IconGlyph name="map" color={colors.primary[500]} size={32} /></View>
          <Text style={styles.locationTitle}>{"See what's happening nearby"}</Text>
          <Text style={styles.locationDescription}>Use your location to find people and plans around you who are up for the same thing.</Text>
          <View style={styles.locationPrivacy}>
            <IconGlyph name="lock" color={colors.primary[500]} size={20} />
            <Text style={styles.locationPrivacyText}>Your exact location is never shown to strangers. People see approximate distance, not an address or a pin.</Text>
          </View>
          <InlineError message={locationError} />
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: locationRequesting || completing }}
            disabled={locationRequesting || completing}
            onPress={() => void requestNearbyOpportunities()}
            style={({ pressed }) => [styles.finishButton, styles.locationButton, (locationRequesting || completing) && styles.buttonDisabled, pressed && !(locationRequesting || completing) && styles.actionPressed]}
          >
            {locationRequesting || completing ? <ActivityIndicator color={colors.surface} /> : <Text style={styles.finishButtonText}>See nearby opportunities</Text>}
          </Pressable>
          <Pressable accessibilityRole="button" onPress={() => void finishOnboarding()} style={styles.notNowButton}>
            <Text style={styles.notNowText}>Not now</Text>
          </Pressable>
          <Text style={styles.adultNote}>{"Peek & Poke is for adults 18+. Meet in public and look out for each other."}</Text>
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
              <View style={[styles.progressFill, { width: step === 1 ? "33%" : step === 2 ? "66%" : "100%" }]} />
            </View>
            <View style={styles.progressLabels}>
              <Text style={styles.progressLabel}>Username</Text>
              <Text style={styles.progressLabel}>Interests</Text>
              <Text style={styles.progressLabel}>Nearby</Text>
            </View>
          </View>

          <Animated.View style={[styles.usernameCard, { opacity: stepOpacity, transform: [{ scale: stepScale }] }]}>
            <View style={styles.usernameHeader}>
              <Animated.View style={[styles.heroIcon, { transform: [{ scale: heroScale }] }]}>
                <IconGlyph name="at-sign" color={colors.primary[500]} size={32} />
              </Animated.View>
              <Text style={styles.usernameTitle}>Welcome to Peek &amp; Poke!</Text>
              <Text style={styles.usernameDescription}>Add your name and choose a username to get started</Text>
            </View>

            <View style={styles.form}>
              <View style={[styles.inputWrap, usernameFocused && styles.inputFocused]}>
                <IconGlyph name="users" color={colors.ink[5]} size={20} />
                <TextInput accessibilityLabel="Display name" value={displayName} onChangeText={setDisplayName} placeholder="Your name" placeholderTextColor={colors.ink[4]} maxLength={50} style={styles.input} />
              </View>
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
  locationContent: {
    flex: 1,
    paddingHorizontal: spacing[4],
    alignItems: "center",
    justifyContent: "center",
  },
  locationIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    marginBottom: spacing[5],
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.ink[2],
  },
  locationTitle: {
    color: colors.ink[9],
    fontFamily: fontFamilies.bold,
    fontSize: 30,
    lineHeight: 36,
    fontWeight: "700",
    textAlign: "center",
    marginBottom: spacing[3],
  },
  locationDescription: {
    ...typography.body,
    color: colors.ink[5],
    textAlign: "center",
    maxWidth: 340,
  },
  locationPrivacy: {
    marginTop: spacing[6],
    marginBottom: spacing[4],
    width: "100%",
    maxWidth: 400,
    borderRadius: radii.lg,
    padding: spacing[4],
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing[3],
    backgroundColor: colors.ink[2],
  },
  locationPrivacyText: {
    flex: 1,
    color: colors.ink[6],
    fontFamily: fontFamilies.regular,
    fontSize: 14,
    lineHeight: 20,
  },
  locationButton: {
    width: "100%",
    maxWidth: 400,
    height: 52,
    alignItems: "center",
    justifyContent: "center",
  },
  notNowButton: {
    minHeight: 44,
    marginTop: spacing[2],
    paddingHorizontal: spacing[4],
    alignItems: "center",
    justifyContent: "center",
  },
  notNowText: {
    color: colors.ink[6],
    fontFamily: fontFamilies.medium,
    fontSize: 15,
    lineHeight: 20,
  },
  adultNote: {
    marginTop: spacing[6],
    maxWidth: 340,
    color: colors.ink[5],
    fontFamily: fontFamilies.regular,
    fontSize: 12,
    lineHeight: 16,
    textAlign: "center",
  },
});
