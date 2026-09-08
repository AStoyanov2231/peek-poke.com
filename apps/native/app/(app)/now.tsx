import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  colors,
  fontFamilies,
  radii,
  shadows,
  spacing,
} from "@peekpoke/design";
import { Avatar, IconGlyph } from "@/components/ui";
import {
  clearAvailability,
  fetchAvailability,
  saveAvailability,
} from "@/data/availability";
import { nativeQueryKeys } from "@/data/query-keys";
import { displayName } from "@/components/ui-helpers";
import { AvailabilityEditor, availabilityActivities } from "@/components/availability-editor";
import { PokeComposer } from "@/components/poke-composer";
import { fetchPlans } from "@/data/plans";
import { sharedGroupsQuery } from "@/data/social/queries";
import { refreshDeviceLocation, useDeviceLocation } from "@/lib/location";
import type { Activity, AvailabilityUpsertRequest } from "@peekpoke/shared";

function labelForActivity(activity: Activity, customLabel: string | null) {
  if (activity === "custom") return customLabel ?? "Something fun";
  return (
    availabilityActivities.find((item) => item.value === activity)?.label ?? "Anything"
  );
}

function remainingTime(expiresAt: string) {
  const minutes = Math.max(
    1,
    Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 60_000),
  );
  return minutes >= 60
    ? `${Math.ceil(minutes / 60)}h left`
    : `${minutes} min left`;
}

export default function NowScreen() {
  const queryClient = useQueryClient();
  const [pokePerson, setPokePerson] = useState<{ id: string; name: string; activity: Activity; customLabel: string | null } | null>(null);
  const [locationPrimerVisible, setLocationPrimerVisible] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(interval);
  }, []);
  const deviceLocation = useDeviceLocation();
  const availabilityQuery = useQuery({
    queryKey: nativeQueryKeys.availability,
    queryFn: ({ signal }) => fetchAvailability(signal),
    staleTime: 20_000,
  });
  const availability = availabilityQuery.data?.availability ?? null;
  const people = availabilityQuery.data?.people ?? [];
  const plansQuery = useQuery({ queryKey: nativeQueryKeys.plans.all, queryFn: ({ signal }) => fetchPlans(signal), staleTime: 30_000 });
  const circlesQuery = useQuery(sharedGroupsQuery());
  const joinablePlans = (plansQuery.data?.plans ?? [])
    .filter((plan) => plan.status === "active" && Date.parse(plan.starts_at) > now)
    .slice(0, 3);
  const circles = (circlesQuery.data?.groups ?? []).slice(0, 3);
  const mutation = useMutation<Awaited<ReturnType<typeof saveAvailability>>, Error, AvailabilityUpsertRequest>({
    mutationFn: (request) => saveAvailability(request),
    onSuccess: (result) =>
      queryClient.setQueryData(
        nativeQueryKeys.availability,
        (current: typeof availabilityQuery.data) => ({
          availability: result.availability,
          people: current?.people ?? [],
        }),
      ),
  });
  const clearMutation = useMutation({
    mutationFn: () => clearAvailability(),
    onSuccess: () =>
      queryClient.setQueryData(
        nativeQueryKeys.availability,
        (current: typeof availabilityQuery.data) => ({
          availability: null,
          people: current?.people ?? [],
        }),
      ),
  });

  async function enableNearby() {
    setLocationPrimerVisible(false);
    try {
      await refreshDeviceLocation();
      await availabilityQuery.refetch();
    } catch (error) {
      Alert.alert(
        "Location unavailable",
        error instanceof Error
          ? error.message
          : "Try again from device settings.",
      );
    }
  }


  return (
    <SafeAreaView style={styles.safeArea} edges={["top"]}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.heading}>
          <Text style={styles.eyebrow}>RIGHT NOW</Text>
          <Text style={styles.title}>What are you up for?</Text>
          <Text style={styles.subtitle}>
            Share a short-lived intent, then find someone to make it happen
            with.
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push("/(app)/plans" as never)}
            style={styles.plansLink}
          >
            <Text style={styles.plansLinkText}>Browse or create a plan</Text>
            <IconGlyph
              name="arrow-right"
              color={colors.primary[500]}
              size={16}
            />
          </Pressable>
        </View>

        {availability ? (
          <View style={styles.liveCard}>
            <View style={styles.liveCopy}>
              <Text style={styles.liveLabel}>{"YOU'RE AVAILABLE"}</Text>
              <Text style={styles.liveTitle}>
                {labelForActivity(
                  availability.activity,
                  availability.customLabel,
                )}
              </Text>
              <Text style={styles.liveMeta}>
                {remainingTime(availability.expiresAt)} · Your exact location
                stays private
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              onPress={() => clearMutation.mutate()}
              style={styles.endButton}
            >
              {clearMutation.isPending ? (
                <ActivityIndicator color={colors.ink[6]} size="small" />
              ) : (
                <Text style={styles.endButtonText}>End</Text>
              )}
            </Pressable>
          </View>
        ) : (
          <AvailabilityEditor
            pending={mutation.isPending}
            error={mutation.isError ? "Couldn’t update your availability. Try again." : undefined}
            onSave={(request) => mutation.mutate(request)}
          />
        )}

        <View style={styles.sectionHeader}>
          <View>
            <Text style={styles.sectionTitle}>People active now</Text>
            <Text style={styles.sectionHint}>
              Match by intent, not an exact pin.
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.navigate("/(app)/map" as never)}
          >
            <Text style={styles.mapLink}>Map</Text>
          </Pressable>
        </View>
        {deviceLocation.status !== "granted" ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => setLocationPrimerVisible(true)}
            style={styles.locationPrompt}
          >
            <IconGlyph name="map" color={colors.primary[500]} size={18} />
            <Text style={styles.locationPromptText}>
              Turn on location to see nearby matches
            </Text>
            <IconGlyph
              name="arrow-right"
              color={colors.primary[500]}
              size={18}
            />
          </Pressable>
        ) : null}
        {availabilityQuery.isPending ? (
          <ActivityIndicator
            color={colors.primary[500]}
            style={styles.loading}
          />
        ) : null}
        {availabilityQuery.isError ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>
              {"We couldn't load nearby activity."}
            </Text>
            <Pressable onPress={() => availabilityQuery.refetch()}>
              <Text style={styles.mapLink}>Try again</Text>
            </Pressable>
          </View>
        ) : null}
        {!availabilityQuery.isPending &&
        !availabilityQuery.isError &&
        people.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>No one is active nearby yet.</Text>
            <Text style={styles.emptyText}>
              Set your intent so friends and new people can find a reason to
              reach out.
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.navigate("/(app)/map" as never)}
            >
              <Text style={styles.mapLink}>Explore the map</Text>
            </Pressable>
          </View>
        ) : null}
        {people.map((person) => (
          <View
            key={person.profile.id}
            style={styles.personCard}
          >
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`View ${displayName(person.profile)}'s profile`}
              onPress={() =>
                router.push(`/(app)/profile/${person.profile.id}` as never)
              }
              style={styles.personProfileButton}
            >
              <Avatar
                uri={person.profile.avatar_url}
                name={displayName(person.profile)}
                size={48}
                ringColor={colors.primary[500]}
              />
              <View style={styles.personCopy}>
                <Text style={styles.personIntent}>
                  {labelForActivity(
                    person.availability.activity,
                    person.availability.customLabel,
                  )}
                </Text>
                <Text style={styles.personName}>
                  {displayName(person.profile)} ·{" "}
                  {person.distanceKm < 1
                    ? `${Math.round(person.distanceKm * 1000)}m`
                    : `${person.distanceKm.toFixed(1)}km`}
                </Text>
                <Text numberOfLines={1} style={styles.personMeta}>
                  {remainingTime(person.availability.expiresAt)}
                  {person.sharedInterestNames.length
                    ? ` · ${person.sharedInterestNames.slice(0, 2).join(" · ")}`
                    : ""}
                </Text>
              </View>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Poke ${displayName(person.profile)}`}
              onPress={(event) => {
                event.stopPropagation();
                setPokePerson({ id: person.profile.id, name: displayName(person.profile), activity: person.availability.activity, customLabel: person.availability.customLabel });
              }}
              style={styles.pokeButton}
            >
              <Text style={styles.pokeButtonText}>Poke</Text>
            </Pressable>
          </View>
        ))}
        <View style={styles.emptyCard}>
          <Text style={styles.sectionTitle}>Plans</Text>
          <Text style={styles.emptyText}>These are available through your current Plan feed. Location is not inferred here.</Text>
          {joinablePlans.map((plan) => <Pressable key={plan.id} accessibilityRole="button" onPress={() => router.push(`/plans/${plan.id}` as never)} style={styles.nowRow}><Text style={styles.nowRowTitle}>{plan.title ?? plan.activity}</Text><Text style={styles.nowRowMeta}>{plan.place_text} · {plan.member_count}/{plan.participant_limit} going</Text></Pressable>)}
          {!plansQuery.isPending && joinablePlans.length === 0 ? <Text style={styles.emptyText}>No plans are available in your feed yet. Start a simple one.</Text> : null}
          <Pressable accessibilityRole="button" onPress={() => router.push("/(app)/plans" as never)}><Text style={styles.mapLink}>Browse or create a plan</Text></Pressable>
        </View>
        <View style={styles.emptyCard}>
          <Text style={styles.sectionTitle}>Your Circles</Text>
          {circles.map((circle) => <Pressable key={circle.id} accessibilityRole="button" onPress={() => router.push(`/group/${circle.id}` as never)} style={styles.nowRow}><Text style={styles.nowRowTitle}>{circle.name === "Shared group" ? "Your Circle" : circle.name}</Text><Text style={styles.nowRowMeta}>{circle.member_count} members · {circle.last_message_preview ?? "Start something together"}</Text></Pressable>)}
          {!circlesQuery.isPending && circles.length === 0 ? <Text style={styles.emptyText}>No Circles yet. Scan a Circle code when you meet people.</Text> : null}
          <Pressable accessibilityRole="button" onPress={() => router.push("/(app)/inbox" as never)}><Text style={styles.mapLink}>Open Circles in Inbox</Text></Pressable>
        </View>
      </ScrollView>
      {pokePerson ? <PokeComposer recipientId={pokePerson.id} name={pokePerson.name} defaultActivity={pokePerson.activity} defaultCustomLabel={pokePerson.customLabel} onClose={() => setPokePerson(null)} onSent={() => Alert.alert("Poke sent", "They can accept, reply later, or decline. It expires automatically.")} /> : null}
      <Modal
        transparent
        animationType="fade"
        visible={locationPrimerVisible}
        onRequestClose={() => setLocationPrimerVisible(false)}
      >
        <View style={styles.modalScrim}>
          <View style={styles.primerCard}>
            <View style={styles.primerIcon}>
              <IconGlyph name="map" color={colors.primary[500]} size={26} />
            </View>
            <Text style={styles.primerTitle}>
              Find people who are up for it nearby
            </Text>
            <Text style={styles.primerBody}>
              {
                "Peek & Poke uses your location to match you with nearby activity. Strangers see approximate distance, never your exact pin or address."
              }
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => void enableNearby()}
              style={styles.primaryButton}
            >
              <Text style={styles.primaryButtonText}>Continue</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => setLocationPrimerVisible(false)}
              style={styles.dismissButton}
            >
              <Text style={styles.dismissText}>Not now</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing[4], paddingBottom: 132, gap: spacing[5] },
  heading: { paddingTop: spacing[3], gap: spacing[2] },
  eyebrow: {
    color: colors.primary[500],
    fontFamily: fontFamilies.semibold,
    fontSize: 12,
    letterSpacing: 1.1,
  },
  title: {
    color: colors.ink[9],
    fontFamily: fontFamilies.bold,
    fontSize: 32,
    lineHeight: 38,
    letterSpacing: -0.7,
  },
  subtitle: {
    color: colors.ink[5],
    fontFamily: fontFamilies.regular,
    fontSize: 16,
    lineHeight: 23,
    maxWidth: 390,
  },
  plansLink: {
    alignSelf: "flex-start",
    minHeight: 36,
    paddingHorizontal: spacing[3],
    borderRadius: radii.pill,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[1],
    backgroundColor: colors.ink[2],
  },
  plansLinkText: {
    color: colors.primary[500],
    fontFamily: fontFamilies.semibold,
    fontSize: 13,
  },
  nowRow: { paddingTop: spacing[2] },
  nowRowTitle: { color: colors.ink[8], fontFamily: fontFamilies.semibold, fontSize: 14 },
  nowRowMeta: { color: colors.ink[5], fontFamily: fontFamilies.regular, fontSize: 12, marginTop: 2 },
  intentCard: {
    borderRadius: radii.xl,
    padding: spacing[4],
    backgroundColor: colors.surface,
    ...shadows.e2,
  },
  sectionTitle: {
    color: colors.ink[9],
    fontFamily: fontFamilies.semibold,
    fontSize: 18,
    lineHeight: 24,
  },
  activityGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing[2],
    marginTop: spacing[3],
  },
  activity: {
    minWidth: "30%",
    flexGrow: 1,
    height: 66,
    borderRadius: radii.lg,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    backgroundColor: colors.ink[2],
  },
  activitySelected: { backgroundColor: colors.ink[9] },
  activityEmoji: { fontSize: 19 },
  activityText: {
    color: colors.ink[7],
    fontFamily: fontFamilies.medium,
    fontSize: 13,
  },
  activityTextSelected: { color: colors.surface },
  durationTitle: { marginTop: spacing[5] },
  durationRow: { flexDirection: "row", gap: spacing[2], marginTop: spacing[3] },
  duration: {
    flex: 1,
    minHeight: 42,
    borderRadius: radii.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.ink[2],
  },
  durationSelected: { backgroundColor: colors.primary[500] },
  durationText: {
    color: colors.ink[7],
    fontFamily: fontFamilies.medium,
    fontSize: 13,
  },
  durationTextSelected: { color: colors.surface },
  error: {
    marginTop: spacing[3],
    color: colors.danger[500],
    fontFamily: fontFamilies.regular,
    fontSize: 13,
  },
  primaryButton: {
    minHeight: 52,
    marginTop: spacing[4],
    borderRadius: radii.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.primary[500],
  },
  primaryButtonDisabled: { opacity: 0.6 },
  primaryButtonText: {
    color: colors.surface,
    fontFamily: fontFamilies.semibold,
    fontSize: 16,
  },
  liveCard: {
    minHeight: 112,
    padding: spacing[4],
    borderRadius: radii.xl,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[3],
    backgroundColor: colors.primary[500],
    ...shadows.e2,
  },
  liveCopy: { flex: 1, gap: 3 },
  liveLabel: {
    color: "rgba(255,255,255,0.78)",
    fontFamily: fontFamilies.semibold,
    fontSize: 11,
    letterSpacing: 0.8,
  },
  liveTitle: {
    color: colors.surface,
    fontFamily: fontFamilies.bold,
    fontSize: 22,
    lineHeight: 27,
  },
  liveMeta: {
    color: "rgba(255,255,255,0.84)",
    fontFamily: fontFamilies.regular,
    fontSize: 13,
    lineHeight: 18,
  },
  endButton: {
    minWidth: 52,
    minHeight: 40,
    paddingHorizontal: spacing[3],
    borderRadius: radii.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.18)",
  },
  endButtonText: {
    color: colors.surface,
    fontFamily: fontFamilies.semibold,
    fontSize: 14,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: spacing[3],
  },
  sectionHint: {
    marginTop: 2,
    color: colors.ink[5],
    fontFamily: fontFamilies.regular,
    fontSize: 13,
    lineHeight: 18,
  },
  mapLink: {
    color: colors.primary[500],
    fontFamily: fontFamilies.semibold,
    fontSize: 14,
  },
  loading: { marginVertical: spacing[5] },
  emptyCard: {
    padding: spacing[4],
    borderRadius: radii.lg,
    gap: spacing[2],
    backgroundColor: colors.surface,
    ...shadows.e1,
  },
  emptyTitle: {
    color: colors.ink[8],
    fontFamily: fontFamilies.semibold,
    fontSize: 16,
    lineHeight: 22,
  },
  emptyText: {
    color: colors.ink[5],
    fontFamily: fontFamilies.regular,
    fontSize: 14,
    lineHeight: 20,
  },
  personCard: {
    padding: spacing[3],
    borderRadius: radii.lg,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[3],
    backgroundColor: colors.surface,
    ...shadows.e1,
  },
  personProfileButton: {
    minHeight: 44,
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[3],
  },
  personCopy: { flex: 1, gap: 2 },
  personIntent: {
    color: colors.primary[500],
    fontFamily: fontFamilies.semibold,
    fontSize: 14,
    lineHeight: 19,
  },
  personName: {
    color: colors.ink[8],
    fontFamily: fontFamilies.medium,
    fontSize: 14,
    lineHeight: 19,
  },
  personMeta: {
    color: colors.ink[5],
    fontFamily: fontFamilies.regular,
    fontSize: 12,
    lineHeight: 17,
  },
  pokeButton: {
    minHeight: 44,
    paddingHorizontal: spacing[3],
    borderRadius: radii.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.ink[9],
  },
  pokeButtonText: {
    color: colors.surface,
    fontFamily: fontFamilies.semibold,
    fontSize: 13,
  },
  locationPrompt: {
    minHeight: 48,
    paddingHorizontal: spacing[3],
    borderRadius: radii.lg,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[2],
    backgroundColor: colors.ink[2],
  },
  locationPromptText: {
    flex: 1,
    color: colors.ink[7],
    fontFamily: fontFamilies.medium,
    fontSize: 14,
  },
  modalScrim: {
    flex: 1,
    padding: spacing[4],
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.scrim,
  },
  primerCard: {
    width: "100%",
    maxWidth: 420,
    borderRadius: radii.xl,
    padding: spacing[5],
    backgroundColor: colors.surface,
    ...shadows.e2,
  },
  primerIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.ink[2],
  },
  primerTitle: {
    marginTop: spacing[4],
    color: colors.ink[9],
    fontFamily: fontFamilies.bold,
    fontSize: 24,
    lineHeight: 30,
  },
  primerBody: {
    marginTop: spacing[3],
    color: colors.ink[6],
    fontFamily: fontFamilies.regular,
    fontSize: 15,
    lineHeight: 22,
  },
  dismissButton: {
    minHeight: 44,
    marginTop: spacing[2],
    alignItems: "center",
    justifyContent: "center",
  },
  dismissText: {
    color: colors.ink[6],
    fontFamily: fontFamilies.medium,
    fontSize: 15,
  },
});
