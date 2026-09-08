import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { colors, fontFamilies, radii, spacing } from "@peekpoke/design";
import type { PlanReadResponse } from "@peekpoke/shared/plans";
import {
  acknowledgePlanMeetup,
  fetchPlanMeetupStatus,
  planMeetupLabel,
  planMeetupPresentation,
  planMeetupShouldShowLoadError,
} from "@/data/plan-meetups";
import { nativeQueryKeys } from "@/data/query-keys";

type PlanMeetupAcknowledgementsProps = {
  accountId: string;
  planId: string;
  members: PlanReadResponse["members"];
  onPlanAgain?: () => void;
};

export function PlanMeetupAcknowledgements({
  accountId,
  planId,
  members,
  onPlanAgain,
}: PlanMeetupAcknowledgementsProps) {
  const queryClient = useQueryClient();
  const [confirmingPeer, setConfirmingPeer] = useState<PlanReadResponse["members"][number] | null>(null);
  const accountRef = useRef<string | null>(accountId);
  const queryKey = nativeQueryKeys.plans.meetups(planId, accountId);
  const status = useQuery({
    queryKey,
    queryFn: ({ signal }) => fetchPlanMeetupStatus(planId, signal),
    enabled: Boolean(planId && accountId),
    staleTime: 30_000,
    refetchInterval: 30_000,
  });
  const mutation = useMutation({
    mutationFn: ({ peerId, requestAccountId }: { peerId: string; requestAccountId: string }) =>
      acknowledgePlanMeetup(planId, peerId, requestAccountId),
    onSuccess: (response, variables) => {
      if (accountRef.current !== variables.requestAccountId) return;
      queryClient.setQueryData(queryKey, response);
      setConfirmingPeer(null);
      void queryClient.invalidateQueries({ queryKey });
    },
  });
  useEffect(() => {
    accountRef.current = accountId;
    return () => {
      accountRef.current = null;
    };
  }, [accountId]);
  const hasPotentialPeer = members.some((member) => member.user_id !== accountId);
  const error = mutation.error instanceof Error ? mutation.error.message : null;
  const presentation = status.data
    ? planMeetupPresentation(status.data, members, accountId)
    : null;
  const retryConfirmation = () => {
    if (!confirmingPeer) return;
    mutation.mutate({ peerId: confirmingPeer.user_id, requestAccountId: accountId });
  };

  if (!hasPotentialPeer || status.isPending) return null;
  if (planMeetupShouldShowLoadError(hasPotentialPeer, status.isError))
    return (
      <View style={styles.wrap}>
        <Text accessibilityRole="alert" style={styles.error}>
          Meetup confirmation could not be loaded.
        </Text>
        <Pressable accessibilityRole="button" onPress={() => void status.refetch()} style={styles.retryButton}>
          <Text style={styles.retry}>Try again</Text>
        </Pressable>
      </View>
    );
  if (!presentation || presentation.kind === "hidden") return null;

  return (
    <View style={styles.wrap}>
      <Text style={styles.heading}>Did you meet up?</Text>
      <Text style={styles.copy}>
        Mark a meetup only if it happened. Each person confirms separately. This does not use location proof or award rewards.
      </Text>
      {presentation.kind === "closed" ? (
        <Text accessibilityRole="alert" style={styles.closed}>
          Meetup confirmation is no longer available for this plan.
        </Text>
      ) : null}
      {presentation.kind === "active" ? presentation.peers.map(({ member: peer, acknowledgement }) => {
        const label = planMeetupLabel(acknowledgement);
        const confirmed = Boolean(acknowledgement?.confirmedAt);
        const viewerConfirmed = Boolean(acknowledgement?.viewerConfirmed);
        return (
          <View key={peer.user_id} style={styles.peer}>
            <View style={styles.peerText}>
              <Text style={styles.peerName}>{peer.display_name ?? "Plan member"}</Text>
              <Text accessibilityLiveRegion="polite" style={styles.peerStatus}>
                {confirmed
                  ? "You both marked this meetup."
                  : viewerConfirmed
                    ? "Waiting for their confirmation."
                    : acknowledgement?.peerConfirmed
                      ? "They marked the meetup. Confirm only if you met."
                      : "Confirm separately after you meet."}
              </Text>
            </View>
            {confirmed ? (
              onPlanAgain ? (
                <Pressable accessibilityRole="button" onPress={onPlanAgain} style={styles.planAgain}>
                  <Text style={styles.planAgainText}>Plan again</Text>
                </Pressable>
              ) : null
            ) : (
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ disabled: !status.data?.canConfirm || viewerConfirmed, busy: mutation.isPending }}
                disabled={!status.data?.canConfirm || viewerConfirmed || mutation.isPending}
                onPress={() => setConfirmingPeer(peer)}
                style={styles.confirm}
              >
                <Text style={styles.confirmText}>{label}</Text>
              </Pressable>
            )}
          </View>
        );
      }) : null}
      <Modal transparent animationType="fade" visible={Boolean(confirmingPeer)} onRequestClose={() => !mutation.isPending && setConfirmingPeer(null)}>
        <View style={styles.modalRoot}>
          <Pressable accessibilityRole="button" accessibilityLabel="Close meetup confirmation" style={styles.backdrop} disabled={mutation.isPending} onPress={() => setConfirmingPeer(null)} />
          <View accessibilityViewIsModal style={styles.modalCard}>
            <Text style={styles.modalTitle}>Mark that you met?</Text>
            <Text style={styles.copy}>{confirmingPeer?.display_name ?? "This person"} will be asked to acknowledge it too. Nothing is sent until you choose Yes, we met.</Text>
            {error ? (
              <View style={styles.errorRow}>
                <Text accessibilityRole="alert" style={styles.error}>{error}</Text>
                <Pressable accessibilityRole="button" disabled={mutation.isPending} onPress={retryConfirmation} style={styles.retryButton}>
                  <Text style={styles.retry}>Try again</Text>
                </Pressable>
              </View>
            ) : null}
            <View style={styles.modalActions}>
              <Pressable accessibilityRole="button" disabled={mutation.isPending} onPress={() => setConfirmingPeer(null)} style={styles.cancel}>
                <Text style={styles.cancelText}>Not yet</Text>
              </Pressable>
              <Pressable accessibilityRole="button" accessibilityState={{ busy: mutation.isPending }} disabled={mutation.isPending} onPress={retryConfirmation} style={styles.yes}>
                {mutation.isPending ? <ActivityIndicator color={colors.surface} /> : <Text style={styles.yesText}>Yes, we met</Text>}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing[3], padding: spacing[4], borderRadius: radii.lg, backgroundColor: colors.ink[1] },
  heading: { color: colors.ink[9], fontFamily: fontFamilies.semibold, fontSize: 17 },
  copy: { color: colors.ink[6], fontFamily: fontFamilies.regular, fontSize: 13, lineHeight: 19 },
  closed: { color: colors.ink[6], fontFamily: fontFamilies.medium, fontSize: 13 },
  peer: { alignItems: "center", flexDirection: "row", gap: spacing[3], paddingTop: spacing[2] },
  peerText: { flex: 1, gap: 2 },
  peerName: { color: colors.ink[8], fontFamily: fontFamilies.semibold, fontSize: 14 },
  peerStatus: { color: colors.ink[6], fontFamily: fontFamilies.regular, fontSize: 12, lineHeight: 17 },
  confirm: { minHeight: 44, justifyContent: "center", paddingHorizontal: spacing[3], borderRadius: radii.pill, backgroundColor: colors.primary[100] },
  confirmText: { color: colors.primary[600], fontFamily: fontFamilies.semibold, fontSize: 13 },
  planAgain: { minHeight: 44, justifyContent: "center", paddingHorizontal: spacing[2] },
  planAgainText: { color: colors.primary[600], fontFamily: fontFamilies.semibold, fontSize: 13 },
  errorRow: { flexDirection: "row", alignItems: "center", gap: spacing[2] },
  error: { flex: 1, color: colors.danger[500], fontFamily: fontFamilies.regular, fontSize: 13 },
  retry: { color: colors.primary[600], fontFamily: fontFamilies.semibold, fontSize: 13 },
  retryButton: { minHeight: 44, justifyContent: "center", paddingHorizontal: spacing[2] },
  modalRoot: { flex: 1, justifyContent: "center", padding: spacing[5], backgroundColor: "rgba(0,0,0,0.35)" },
  backdrop: StyleSheet.absoluteFill,
  modalCard: { gap: spacing[4], padding: spacing[5], borderRadius: radii.xl, backgroundColor: colors.surface },
  modalTitle: { color: colors.ink[9], fontFamily: fontFamilies.bold, fontSize: 22 },
  modalActions: { flexDirection: "row", justifyContent: "flex-end", gap: spacing[2] },
  cancel: { minHeight: 44, justifyContent: "center", paddingHorizontal: spacing[3], borderRadius: radii.md, backgroundColor: colors.ink[1] },
  cancelText: { color: colors.ink[8], fontFamily: fontFamilies.semibold, fontSize: 14 },
  yes: { minWidth: 112, minHeight: 44, alignItems: "center", justifyContent: "center", paddingHorizontal: spacing[3], borderRadius: radii.md, backgroundColor: colors.primary[500] },
  yesText: { color: colors.surface, fontFamily: fontFamilies.semibold, fontSize: 14 },
});
