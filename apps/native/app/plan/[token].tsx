import { useMutation, useQuery } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import {
  ActivityIndicator,
  Pressable,
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
import { fetchPublicPlanPreview, joinSharedPlan } from "@/data/plans";
import { getAccessToken } from "@/lib/api";
import { useAgeAdmission } from "@/components/age-admission-context";
import { publicPlanJoinDestination } from "@/lib/age-admission-navigation";

const shareTokenPattern = /^[A-Za-z0-9_-]{43}$/;

export default function PublicPlanPreviewScreen() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const { admission } = useAgeAdmission();
  const validToken = typeof token === "string" && shareTokenPattern.test(token);
  const previewQuery = useQuery({
    queryKey: ["plans", "share", token],
    queryFn: ({ signal }) => fetchPublicPlanPreview(token, signal),
    enabled: validToken,
  });
  const joinMutation = useMutation({
    mutationFn: async () => {
      const session = await getAccessToken();
      const destination = publicPlanJoinDestination({
        token,
        hasSession: Boolean(session),
        admission,
      });
      if (destination) {
        router.push(destination);
        return null;
      }
      if (!previewQuery.data) throw new Error("Plan preview is unavailable.");
      return joinSharedPlan(previewQuery.data.plan.id, token);
    },
    onSuccess: (response) => {
      if (response) router.replace(`/plans/${response.plan.id}` as never);
    },
  });
  if (!validToken)
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.center}>
          <Text style={styles.title}>This plan link is invalid.</Text>
        </View>
      </SafeAreaView>
    );
  if (previewQuery.isPending)
    return (
      <SafeAreaView style={styles.safeArea}>
        <ActivityIndicator color={colors.primary[500]} style={styles.loader} />
      </SafeAreaView>
    );
  if (previewQuery.isError || !previewQuery.data)
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.center}>
          <Text style={styles.title}>This plan is unavailable.</Text>
          <Pressable onPress={() => previewQuery.refetch()}>
            <Text style={styles.link}>Try again</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  const { plan, can_join: canJoin } = previewQuery.data;
  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.content}>
        <Text style={styles.eyebrow}>PLAN INVITE</Text>
        <Text style={styles.title}>{plan.title ?? plan.activity}</Text>
        <Text style={styles.detail}>
          {new Date(plan.starts_at).toLocaleString()}
        </Text>
        <Text style={styles.detail}>{plan.place_text}</Text>
        <Text style={styles.detail}>
          {plan.member_count}/{plan.participant_limit} people going
        </Text>
        {canJoin ? (
          <Pressable
            accessibilityRole="button"
            disabled={joinMutation.isPending}
            onPress={() => joinMutation.mutate()}
            style={styles.join}
          >
            {joinMutation.isPending ? (
              <ActivityIndicator color={colors.surface} />
            ) : (
              <Text style={styles.joinText}>Join this plan</Text>
            )}
          </Pressable>
        ) : (
          <Text style={styles.detail}>
            This plan can&apos;t accept more people.
          </Text>
        )}
        {joinMutation.isError ? (
          <Text accessibilityRole="alert" style={styles.error}>
            {joinMutation.error instanceof Error
              ? joinMutation.error.message
              : "Could not join this plan."}
          </Text>
        ) : null}
      </View>
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  content: {
    flex: 1,
    padding: spacing[5],
    justifyContent: "center",
    gap: spacing[3],
  },
  center: {
    flex: 1,
    padding: spacing[5],
    justifyContent: "center",
    alignItems: "center",
    gap: spacing[3],
  },
  loader: { flex: 1 },
  eyebrow: {
    color: colors.primary[500],
    fontFamily: fontFamilies.semibold,
    fontSize: 12,
    letterSpacing: 1,
  },
  title: {
    color: colors.ink[9],
    fontFamily: fontFamilies.bold,
    fontSize: 29,
    lineHeight: 36,
  },
  detail: {
    color: colors.ink[6],
    fontFamily: fontFamilies.regular,
    fontSize: 16,
    lineHeight: 23,
  },
  join: {
    minHeight: 52,
    marginTop: spacing[3],
    borderRadius: radii.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.primary[500],
    ...shadows.e1,
  },
  joinText: {
    color: colors.surface,
    fontFamily: fontFamilies.semibold,
    fontSize: 16,
  },
  link: {
    color: colors.primary[500],
    fontFamily: fontFamilies.semibold,
    fontSize: 15,
  },
  error: {
    color: colors.danger[500],
    fontFamily: fontFamilies.regular,
    fontSize: 14,
  },
});
