import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { colors, fontFamilies, radii, spacing } from "@peekpoke/design";
import { acknowledgeMeetup, fetchMeetupAcknowledgement } from "@/data/meetups";
import { nativeQueryKeys } from "@/data/query-keys";

type ChatMeetupAcknowledgementProps = {
  peerId: string;
  threadId: string;
  onPlanAgain: () => void;
};

export function ChatMeetupAcknowledgement({
  peerId,
  threadId,
  onPlanAgain,
}: ChatMeetupAcknowledgementProps) {
  const queryClient = useQueryClient();
  const meetupsQuery = useQuery({
    queryKey: nativeQueryKeys.meetups.peer(peerId),
    queryFn: ({ signal }) => fetchMeetupAcknowledgement(peerId, signal),
    refetchInterval: 30_000,
  });
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const meetup = meetupsQuery.data?.meetup ?? null;
  const statusMessage =
    message ??
    (meetup
      ? meetup.status === "confirmed"
        ? "Both of you confirmed. Nice work making it happen."
        : meetup.viewerConfirmed
          ? "Waiting for the other person to confirm."
          : "They said you met. Confirm only if you met too."
      : null);
  const hasConfirmed = meetup?.viewerConfirmed === true;
  const buttonLabel = hasConfirmed
    ? "You confirmed"
    : meetup
      ? "Confirm we met"
      : "We met";

  function confirm() {
    Alert.alert(
      "Did you meet up?",
      "This is your own acknowledgement. It does not use location proof and gives no coins or rewards. The other person confirms separately.",
      [
        { text: "Not now", style: "cancel" },
        { text: "Yes, we met", onPress: () => void submit() },
      ],
    );
  }
  async function submit() {
    setPending(true);
    setMessage(null);
    try {
      const response = await acknowledgeMeetup(peerId, `${threadId}:${peerId}`);
      queryClient.setQueryData(nativeQueryKeys.meetups.peer(peerId), {
        meetup: response.meetup,
      });
      void queryClient.invalidateQueries({
        queryKey: nativeQueryKeys.meetups.peer(peerId),
      });
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Couldn’t save your acknowledgement. Try again.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <View style={styles.wrap}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{
          busy: pending,
          disabled: pending || hasConfirmed,
        }}
        disabled={pending || hasConfirmed}
        onPress={confirm}
        style={styles.button}
      >
        {pending ? (
          <ActivityIndicator color={colors.primary[500]} size="small" />
        ) : (
          <Text style={styles.buttonText}>{buttonLabel}</Text>
        )}
      </Pressable>
      {statusMessage ? (
        <View style={styles.message}>
          <Text accessibilityLiveRegion="polite" style={styles.messageText}>
            {statusMessage}
          </Text>
          {meetup?.status === "confirmed" ? (
            <Pressable accessibilityRole="button" onPress={onPlanAgain}>
              <Text style={styles.planAgain}>Plan again</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
const styles = StyleSheet.create({
  wrap: { gap: spacing[2] },
  button: {
    alignSelf: "flex-start",
    minHeight: 40,
    paddingHorizontal: spacing[3],
    borderRadius: radii.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.ink[2],
  },
  buttonText: {
    color: colors.primary[500],
    fontFamily: fontFamilies.semibold,
    fontSize: 14,
  },
  message: {
    padding: spacing[3],
    borderRadius: radii.md,
    gap: spacing[2],
    backgroundColor: colors.ink[2],
  },
  messageText: {
    color: colors.ink[7],
    fontFamily: fontFamilies.regular,
    fontSize: 13,
    lineHeight: 19,
  },
  planAgain: {
    color: colors.primary[500],
    fontFamily: fontFamilies.semibold,
    fontSize: 13,
  },
});
