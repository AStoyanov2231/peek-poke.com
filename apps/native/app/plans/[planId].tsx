import * as Clipboard from "expo-clipboard";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import QRCode from "react-native-qrcode-svg";
import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
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
import {
  cancelPlan,
  createPlanShare,
  fetchPlan,
  joinPlan,
  leavePlan,
  revokePlanShares,
  updatePlan,
} from "@/data/plans";
import { fetchCurrentProfile } from "@/data/api";
import { nativeQueryKeys } from "@/data/query-keys";
import { PlanMeetupAcknowledgements } from "@/components/plan-meetup-acknowledgements";
import { env } from "@/lib/env";

type EditDraft = {
  activity: string;
  title: string;
  startsAt: string;
  placeText: string;
  participantLimit: string;
  visibility: "private" | "friends" | "circle" | "open";
};

function publicShareUrl(token: string) {
  return `${new URL(env.apiBaseUrl).origin}/plan/${token}`;
}

export default function PlanDetailScreen() {
  const { planId } = useLocalSearchParams<{ planId: string }>();
  const client = useQueryClient();
  const [editOpen, setEditOpen] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [draft, setDraft] = useState<EditDraft | null>(null);
  const planQuery = useQuery({
    queryKey: nativeQueryKeys.plans.detail(planId),
    queryFn: ({ signal }) => fetchPlan(planId, signal),
    enabled: Boolean(planId),
  });
  const profileQuery = useQuery({
    queryKey: nativeQueryKeys.profile.current,
    queryFn: fetchCurrentProfile,
  });
  const refreshPlans = () =>
    void client.invalidateQueries({ queryKey: nativeQueryKeys.plans.all });
  const replaceDetail = (response: typeof planQuery.data) =>
    client.setQueryData(nativeQueryKeys.plans.detail(planId), response);
  const joinMutation = useMutation({
    mutationFn: () => joinPlan(planId),
    onSuccess: (response) => {
      replaceDetail(
        planQuery.data
          ? { ...planQuery.data, plan: response.plan }
          : planQuery.data,
      );
      refreshPlans();
    },
  });
  const leaveMutation = useMutation({
    mutationFn: () => leavePlan(planId),
    onSuccess: () => {
      refreshPlans();
      router.replace("/(app)/plans" as never);
    },
  });
  const cancelMutation = useMutation({
    mutationFn: () => cancelPlan(planId),
    onSuccess: (response) => {
      replaceDetail(response);
      refreshPlans();
    },
  });
  const updateMutation = useMutation({
    mutationFn: (request: EditDraft) =>
      updatePlan(planId, {
        activity: request.activity.trim(),
        title: request.title.trim() || null,
        starts_at: new Date(request.startsAt).toISOString(),
        place_text: request.placeText.trim(),
        participant_limit: Number(request.participantLimit),
        visibility: request.visibility,
      }),
    onSuccess: (response) => {
      replaceDetail(response);
      setEditOpen(false);
      refreshPlans();
    },
  });
  const shareMutation = useMutation({
    mutationFn: () => createPlanShare(planId),
    onSuccess: (response) => setShareUrl(publicShareUrl(response.token)),
  });
  const revokeMutation = useMutation({
    mutationFn: () => revokePlanShares(planId),
    onSuccess: () => setShareUrl(null),
  });

  if (planQuery.isPending)
    return (
      <SafeAreaView style={styles.safeArea}>
        <ActivityIndicator color={colors.primary[500]} style={styles.loading} />
      </SafeAreaView>
    );
  if (planQuery.isError || !planQuery.data)
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.center}>
          <Text style={styles.title}>Plan unavailable</Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => planQuery.refetch()}
          >
            <Text style={styles.link}>Try again</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  const { plan, members } = planQuery.data;
  const isActive = plan.status === "active";
  const busy =
    joinMutation.isPending ||
    leaveMutation.isPending ||
    cancelMutation.isPending ||
    updateMutation.isPending ||
    shareMutation.isPending ||
    revokeMutation.isPending;
  const openEdit = () => {
    setDraft({
      activity: plan.activity,
      title: plan.title ?? "",
      startsAt: plan.starts_at,
      placeText: plan.place_text,
      participantLimit: String(plan.participant_limit),
      visibility: plan.visibility,
    });
    setEditOpen(true);
  };
  const submitEdit = () => {
    if (!draft) return;
    if (
      !draft.activity.trim() ||
      !draft.placeText.trim() ||
      !Number.isInteger(Number(draft.participantLimit)) ||
      Number(draft.participantLimit) < 2
    ) {
      Alert.alert(
        "Check the plan details",
        "Add an activity, place, and a participant limit of at least 2.",
      );
      return;
    }
    if (
      Number.isNaN(Date.parse(draft.startsAt)) ||
      Date.parse(draft.startsAt) <= Date.now()
    ) {
      Alert.alert(
        "Choose a future time",
        "Use an ISO date and time, for example 2026-09-10T18:30:00.000Z.",
      );
      return;
    }
    updateMutation.mutate(draft);
  };
  const confirmLeave = () =>
    Alert.alert("Leave this plan?", "You can join again if there is space.", [
      { text: "Keep my spot", style: "cancel" },
      {
        text: "Leave",
        style: "destructive",
        onPress: () => leaveMutation.mutate(),
      },
    ]);
  const confirmCancel = () =>
    Alert.alert(
      "Cancel this plan?",
      "Everyone going will see that it was cancelled.",
      [
        { text: "Keep plan", style: "cancel" },
        {
          text: "Cancel plan",
          style: "destructive",
          onPress: () => cancelMutation.mutate(),
        },
      ],
    );
  const confirmRevoke = () =>
    Alert.alert(
      "Revoke all share links?",
      "Anyone with an existing link will no longer be able to open it.",
      [
        { text: "Keep links", style: "cancel" },
        {
          text: "Revoke",
          style: "destructive",
          onPress: () => revokeMutation.mutate(),
        },
      ],
    );
  const actionError = [
    joinMutation.error,
    leaveMutation.error,
    cancelMutation.error,
    updateMutation.error,
    shareMutation.error,
    revokeMutation.error,
  ].find(Boolean);

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <Pressable
          accessibilityLabel="Back"
          accessibilityRole="button"
          onPress={() => {
            if (router.canGoBack()) router.back();
            else router.replace("/(app)/plans" as never);
          }}
          style={styles.backButton}
        >
          <Text style={styles.link}>Back</Text>
        </Pressable>
        <View style={styles.card}>
          <Text style={styles.eyebrow}>
            {plan.status === "cancelled"
              ? "CANCELLED PLAN"
              : `${plan.visibility.toUpperCase()} PLAN`}
          </Text>
          <Text style={styles.title}>{plan.title ?? plan.activity}</Text>
          <Text style={styles.detail}>
            {new Date(plan.starts_at).toLocaleString()}
          </Text>
          <Text style={styles.detail}>{plan.place_text}</Text>
          <Text style={styles.detail}>
            {plan.member_count}/{plan.participant_limit} people going
          </Text>
          {plan.viewer_is_owner && isActive ? (
            <View style={styles.actions}>
              <Action label="Edit" onPress={openEdit} />
              <Action
                label="Share invite"
                onPress={() => shareMutation.mutate()}
                disabled={busy}
              />
              <Action label="Cancel plan" onPress={confirmCancel} destructive />
            </View>
          ) : null}
          {!plan.viewer_is_owner && plan.viewer_is_member && isActive ? (
            <Action
              label="Leave plan"
              onPress={confirmLeave}
              destructive
              disabled={busy}
            />
          ) : null}
          {!plan.viewer_is_owner && !plan.viewer_is_member && isActive ? (
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
          ) : null}
          {plan.viewer_is_member ? (
            <Text style={styles.going}>You&apos;re going</Text>
          ) : null}
          {plan.source_thread_id ? (
            <Action
              label="Open conversation"
              onPress={() =>
                router.push(`/chat/${plan.source_thread_id}` as never)
              }
            />
          ) : null}
          {actionError ? (
            <Text accessibilityRole="alert" style={styles.error}>
              {actionError instanceof Error
                ? actionError.message
                : "Could not update this plan."}
            </Text>
          ) : null}
        </View>
        <Text style={styles.membersTitle}>People going</Text>
        {members.map((member) => (
          <View key={member.user_id} style={styles.member}>
            <View>
              <Text style={styles.memberName}>
                {member.display_name ?? "Plan member"}
              </Text>
              <Text style={styles.memberText}>
                {member.role === "owner" ? "Host" : "Member"}
              </Text>
            </View>
          </View>
        ))}
        {plan.viewer_is_member && profileQuery.data?.id ? (
          <PlanMeetupAcknowledgements
            key={profileQuery.data.id}
            accountId={profileQuery.data.id}
            planId={plan.id}
            members={members}
            onPlanAgain={() => router.push("/(app)/plans" as never)}
          />
        ) : null}
      </ScrollView>
      <Modal
        animationType="slide"
        transparent
        visible={editOpen}
        onRequestClose={() => setEditOpen(false)}
      >
        <View style={styles.modalRoot}>
          <Pressable
            style={styles.backdrop}
            onPress={() => setEditOpen(false)}
          />
          <ScrollView contentContainerStyle={styles.sheet}>
            <Text style={styles.sheetTitle}>Edit plan</Text>
            {draft ? (
              <>
                <Field
                  label="Activity"
                  value={draft.activity}
                  onChangeText={(activity) => setDraft({ ...draft, activity })}
                />
                <Field
                  label="Title (optional)"
                  value={draft.title}
                  onChangeText={(title) => setDraft({ ...draft, title })}
                />
                <Field
                  label="Start time (ISO)"
                  value={draft.startsAt}
                  onChangeText={(startsAt) => setDraft({ ...draft, startsAt })}
                  autoCapitalize="none"
                />
                <Field
                  label="Place"
                  value={draft.placeText}
                  onChangeText={(placeText) =>
                    setDraft({ ...draft, placeText })
                  }
                />
                <Field
                  label="Participant limit"
                  value={draft.participantLimit}
                  onChangeText={(participantLimit) =>
                    setDraft({ ...draft, participantLimit })
                  }
                  keyboardType="number-pad"
                />
                <Text style={styles.fieldLabel}>Visibility</Text>
                <View style={styles.visibility}>
                  {(["private", "friends", "open"] as const).map(
                    (visibility) => (
                      <Pressable
                        key={visibility}
                        onPress={() => setDraft({ ...draft, visibility })}
                        style={[
                          styles.visibilityOption,
                          draft.visibility === visibility &&
                            styles.visibilitySelected,
                        ]}
                      >
                        <Text style={styles.visibilityText}>{visibility}</Text>
                      </Pressable>
                    ),
                  )}
                </View>
              </>
            ) : null}
            <Action
              label={updateMutation.isPending ? "Saving…" : "Save changes"}
              onPress={submitEdit}
              disabled={updateMutation.isPending}
            />
            <Action label="Close" onPress={() => setEditOpen(false)} />
          </ScrollView>
        </View>
      </Modal>
      <Modal
        animationType="slide"
        transparent
        visible={Boolean(shareUrl)}
        onRequestClose={() => setShareUrl(null)}
      >
        <View style={styles.modalRoot}>
          <Pressable
            style={styles.backdrop}
            onPress={() => setShareUrl(null)}
          />
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>Share this plan</Text>
            {shareUrl ? (
              <>
                <View style={styles.qr}>
                  <QRCode
                    backgroundColor="#ffffff"
                    color="#17151d"
                    size={196}
                    value={shareUrl}
                  />
                </View>
                <Text selectable style={styles.shareUrl}>
                  {shareUrl}
                </Text>
                <Action
                  label="Copy link"
                  onPress={() => void Clipboard.setStringAsync(shareUrl)}
                />
                <Action
                  label="Share"
                  onPress={() =>
                    void Share.share({
                      message: shareUrl,
                      url: shareUrl,
                      title: "Plan invite",
                    })
                  }
                />
                <Action
                  label="Revoke all links"
                  onPress={confirmRevoke}
                  destructive
                  disabled={revokeMutation.isPending}
                />
                <Action label="Close" onPress={() => setShareUrl(null)} />
              </>
            ) : null}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function Field({
  label,
  ...props
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  autoCapitalize?: "none";
  keyboardType?: "default" | "number-pad";
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput style={styles.input} {...props} />
    </View>
  );
}
function Action({
  label,
  onPress,
  destructive = false,
  disabled = false,
}: {
  label: string;
  onPress: () => void;
  destructive?: boolean;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.action,
        destructive && styles.actionDestructive,
        disabled && styles.disabled,
      ]}
    >
      <Text
        style={[styles.actionText, destructive && styles.actionTextDestructive]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing[4], paddingBottom: spacing[8], gap: spacing[4] },
  loading: { flex: 1 },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing[3],
  },
  card: {
    padding: spacing[5],
    borderRadius: radii.xl,
    gap: spacing[3],
    backgroundColor: colors.surface,
    ...shadows.e2,
  },
  eyebrow: {
    color: colors.primary[500],
    fontFamily: fontFamilies.semibold,
    fontSize: 12,
    letterSpacing: 1,
  },
  title: {
    color: colors.ink[9],
    fontFamily: fontFamilies.bold,
    fontSize: 28,
    lineHeight: 35,
  },
  detail: {
    color: colors.ink[6],
    fontFamily: fontFamilies.regular,
    fontSize: 15,
    lineHeight: 22,
  },
  link: {
    color: colors.primary[500],
    fontFamily: fontFamilies.semibold,
    fontSize: 15,
  },
  backButton: {
    alignSelf: "flex-start",
    minWidth: 44,
    minHeight: 44,
    justifyContent: "center",
  },
  join: {
    minHeight: 50,
    marginTop: spacing[2],
    borderRadius: radii.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.primary[500],
  },
  joinText: {
    color: colors.surface,
    fontFamily: fontFamilies.semibold,
    fontSize: 16,
  },
  going: {
    color: colors.primary[500],
    fontFamily: fontFamilies.semibold,
    fontSize: 16,
  },
  actions: { gap: spacing[2] },
  action: {
    minHeight: 44,
    borderRadius: radii.md,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.ink[1],
  },
  actionDestructive: { backgroundColor: "rgba(229,72,63,0.10)" },
  actionText: {
    color: colors.ink[8],
    fontFamily: fontFamilies.semibold,
    fontSize: 15,
  },
  actionTextDestructive: { color: colors.danger[500] },
  disabled: { opacity: 0.5 },
  error: {
    color: colors.danger[500],
    fontFamily: fontFamilies.regular,
    fontSize: 14,
  },
  membersTitle: {
    color: colors.ink[9],
    fontFamily: fontFamilies.semibold,
    fontSize: 18,
  },
  member: {
    padding: spacing[3],
    borderRadius: radii.md,
    backgroundColor: colors.surface,
  },
  memberName: {
    color: colors.ink[8],
    fontFamily: fontFamilies.medium,
    fontSize: 15,
  },
  memberText: {
    color: colors.ink[6],
    fontFamily: fontFamilies.regular,
    fontSize: 13,
  },
  modalRoot: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.35)",
  },
  backdrop: { ...StyleSheet.absoluteFill },
  sheet: {
    maxHeight: "88%",
    padding: spacing[5],
    gap: spacing[3],
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    backgroundColor: colors.surface,
  },
  sheetTitle: {
    color: colors.ink[9],
    fontFamily: fontFamilies.bold,
    fontSize: 22,
  },
  field: { gap: spacing[1] },
  fieldLabel: {
    color: colors.ink[7],
    fontFamily: fontFamilies.medium,
    fontSize: 14,
  },
  input: {
    minHeight: 46,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.ink[3],
    borderRadius: radii.md,
    paddingHorizontal: spacing[3],
    color: colors.ink[9],
    fontFamily: fontFamilies.regular,
    fontSize: 16,
  },
  visibility: { flexDirection: "row", flexWrap: "wrap", gap: spacing[2] },
  visibilityOption: {
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
    borderRadius: radii.pill,
    backgroundColor: colors.ink[1],
  },
  visibilitySelected: { backgroundColor: colors.primary[100] },
  visibilityText: {
    color: colors.ink[8],
    fontFamily: fontFamilies.medium,
    fontSize: 14,
  },
  qr: {
    alignItems: "center",
    padding: spacing[3],
    backgroundColor: "#ffffff",
    borderRadius: radii.lg,
  },
  shareUrl: {
    color: colors.ink[6],
    fontFamily: fontFamilies.regular,
    fontSize: 13,
  },
});
