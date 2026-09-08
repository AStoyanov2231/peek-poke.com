import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
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
import { fetchPlans, joinPlan } from "@/data/plans";
import { nativeQueryKeys } from "@/data/query-keys";
import { PlanComposer } from "@/components/plan-composer";

function formatPlanTime(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

export default function PlansScreen() {
  const client = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(interval);
  }, []);
  const plansQuery = useQuery({
    queryKey: nativeQueryKeys.plans.all,
    queryFn: ({ signal }) => fetchPlans(signal),
  });
  const joinMutation = useMutation({
    mutationFn: (planId: string) => joinPlan(planId),
    onSuccess: () =>
      client.invalidateQueries({ queryKey: nativeQueryKeys.plans.all }),
  });
  const plans = useMemo(
    () => plansQuery.data?.plans ?? [],
    [plansQuery.data?.plans],
  );
  const upcomingPlans = plans.filter(
    (plan) => plan.status === "active" && Date.parse(plan.starts_at) > now,
  );
  const recentPlans = plans.filter((plan) => {
    const startedAt = Date.parse(plan.starts_at);
    return plan.status === "active" && startedAt <= now && startedAt > now - 48 * 60 * 60_000;
  });
  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <View style={styles.headerCopy}>
            <Text style={styles.title}>Plans</Text>
            <Text style={styles.subtitle}>
              Make a real-world plan, then bring the right people in.
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            onPress={() => setCreating(!creating)}
            style={styles.createButton}
          >
            <Text style={styles.createText}>
              {creating ? "Close" : "Create"}
            </Text>
          </Pressable>
        </View>
        <PlanComposer open={creating} onClose={() => setCreating(false)} onCreated={(planId) => router.replace(`/plans/${planId}` as never)} />
        {plansQuery.isPending ? (
          <ActivityIndicator color={colors.primary[500]} />
        ) : null}
        {plansQuery.isError ? (
          <View style={styles.empty}>
            <Text style={styles.sectionTitle}>Plans couldn&apos;t load.</Text>
            <Pressable onPress={() => plansQuery.refetch()}>
              <Text style={styles.link}>Try again</Text>
            </Pressable>
          </View>
        ) : null}
        {!plansQuery.isPending && !plansQuery.isError && upcomingPlans.length === 0 && recentPlans.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.sectionTitle}>Nothing planned yet.</Text>
            <Text style={styles.subtitle}>
              Make the first simple plan for your area.
            </Text>
          </View>
        ) : null}
        {upcomingPlans.length ? <Text style={styles.sectionTitle}>Coming up</Text> : null}
        {upcomingPlans.map((plan) => (
          <Pressable
            key={plan.id}
            accessibilityRole="button"
            onPress={() => router.push(`/plans/${plan.id}` as never)}
            style={styles.plan}
          >
            <View style={styles.planMain}>
              <Text style={styles.planActivity}>
                {plan.title ?? plan.activity}
              </Text>
              <Text style={styles.planMeta}>
                {formatPlanTime(plan.starts_at)} · {plan.place_text}
              </Text>
              <Text style={styles.planMeta}>
                {plan.member_count}/{plan.participant_limit} going ·{" "}
                {plan.visibility}
              </Text>
            </View>
            {plan.viewer_is_member ? (
              <Text style={styles.joined}>Going</Text>
            ) : (
              <Pressable
                accessibilityRole="button"
                disabled={joinMutation.isPending}
                onPress={(event) => {
                  event.stopPropagation();
                  joinMutation.mutate(plan.id);
                }}
                style={styles.join}
              >
                <Text style={styles.joinText}>Join</Text>
              </Pressable>
            )}
          </Pressable>
        ))}
        {recentPlans.length ? <Text style={styles.sectionTitle}>Recent · Open to confirm</Text> : null}
        {recentPlans.map((plan) => (
          <Pressable
            key={plan.id}
            accessibilityRole="button"
            onPress={() => router.push(`/plans/${plan.id}` as never)}
            style={styles.plan}
          >
            <View style={styles.planMain}>
              <Text style={styles.planActivity}>{plan.title ?? plan.activity}</Text>
              <Text style={styles.planMeta}>
                {formatPlanTime(plan.starts_at)} · {plan.place_text}
              </Text>
              <Text style={styles.planMeta}>
                {plan.member_count}/{plan.participant_limit} going · confirm with people who were there
              </Text>
            </View>
            <Text style={styles.recent}>Open</Text>
          </Pressable>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing[4], paddingBottom: 120, gap: spacing[4] },
  header: {
    flexDirection: "row",
    gap: spacing[3],
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingTop: spacing[2],
  },
  headerCopy: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    flexShrink: 1,
    color: colors.ink[9],
    fontFamily: fontFamilies.bold,
    fontSize: 29,
    lineHeight: 35,
  },
  subtitle: {
    marginTop: spacing[1],
    color: colors.ink[5],
    fontFamily: fontFamilies.regular,
    fontSize: 14,
    lineHeight: 20,
  },
  createButton: {
    minHeight: 44,
    paddingHorizontal: spacing[3],
    borderRadius: radii.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.ink[9],
  },
  createText: {
    color: colors.surface,
    fontFamily: fontFamilies.semibold,
    fontSize: 14,
  },
  sectionTitle: {
    color: colors.ink[9],
    fontFamily: fontFamilies.semibold,
    fontSize: 17,
    lineHeight: 23,
  },
  empty: {
    padding: spacing[4],
    borderRadius: radii.lg,
    gap: spacing[2],
    backgroundColor: colors.surface,
    ...shadows.e1,
  },
  link: {
    color: colors.primary[500],
    fontFamily: fontFamilies.semibold,
    fontSize: 14,
  },
  plan: {
    padding: spacing[4],
    borderRadius: radii.lg,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[3],
    backgroundColor: colors.surface,
    ...shadows.e1,
  },
  planMain: { flex: 1, gap: 3 },
  planActivity: {
    color: colors.ink[9],
    fontFamily: fontFamilies.semibold,
    fontSize: 17,
    lineHeight: 22,
  },
  planMeta: {
    color: colors.ink[5],
    fontFamily: fontFamilies.regular,
    fontSize: 13,
    lineHeight: 18,
  },
  join: {
    minHeight: 38,
    paddingHorizontal: spacing[3],
    borderRadius: radii.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.ink[9],
  },
  joinText: {
    color: colors.surface,
    fontFamily: fontFamilies.semibold,
    fontSize: 13,
  },
  joined: {
    color: colors.primary[500],
    fontFamily: fontFamilies.semibold,
    fontSize: 13,
  },
  recent: {
    color: colors.primary[500],
    fontFamily: fontFamilies.semibold,
    fontSize: 13,
  },
});
