import { useEffect, useRef, useState } from "react";
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
  accountId: string;
  peerId: string;
  threadId: string;
  onPlanAgain: () => void;
};

export function ChatMeetupAcknowledgement(props: ChatMeetupAcknowledgementProps) {
  return <ChatMeetupAcknowledgementSession key={`${props.accountId}:${props.threadId}:${props.peerId}`} {...props} />;
}

function ChatMeetupAcknowledgementSession({
  accountId,
  peerId,
  threadId,
  onPlanAgain,
}: ChatMeetupAcknowledgementProps) {
  const queryClient = useQueryClient();
  const lifetime = useRef<object | null>(null);
  const pendingRef = useRef(false);
  useEffect(() => {
    lifetime.current = {};
    return () => { lifetime.current = null; };
  }, []);
  const meetupsQuery = useQuery({
    queryKey: nativeQueryKeys.meetups.peer(peerId, accountId),
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
    const owner = lifetime.current;
    Alert.alert(
      "Did you meet up?",
      "This is your own acknowledgement. It does not use location proof and gives no coins or rewards. The other person confirms separately.",
      [
        { text: "Not now", style: "cancel" },
        { text: "Yes, we met", onPress: () => { if (owner && lifetime.current === owner) void submit(); } },
      ],
    );
  }
  async function submit() {
    if (pendingRef.current || !lifetime.current) return;
    const owner = lifetime.current;
    pendingRef.current = true;
    setPending(true);
    setMessage(null);
    try {
      const response = await acknowledgeMeetup(peerId, `${accountId}:${threadId}:${peerId}`);
      if (lifetime.current !== owner) return;
      queryClient.setQueryData(nativeQueryKeys.meetups.peer(peerId, accountId), {
        meetup: response.meetup,
      });
      void queryClient.invalidateQueries({
        queryKey: nativeQueryKeys.meetups.peer(peerId, accountId),
      });
    } catch (error) {
      if (lifetime.current !== owner) return;
      setMessage(
        error instanceof Error
          ? error.message
          : "Couldn’t save your acknowledgement. Try again.",
      );
    } finally {
      if (lifetime.current === owner) {
        pendingRef.current = false;
        setPending(false);
      }
    }
  }

  if (meetupsQuery.isPending) {
    return <Text accessibilityLiveRegion="polite" style={styles.messageText}>Loading meetup confirmation…</Text>;
  }
  if (meetupsQuery.isError) {
    return (
      <View style={styles.message}>
        <Text accessibilityRole="alert" style={styles.messageText}>Meetup confirmation could not be loaded.</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Retry meetup confirmation" accessibilityState={{ disabled: meetupsQuery.isFetching, busy: meetupsQuery.isFetching }} disabled={meetupsQuery.isFetching} onPress={() => void meetupsQuery.refetch()} style={styles.button}>
          <Text style={styles.buttonText}>{meetupsQuery.isFetching ? "Retrying…" : "Try again"}</Text>
        </Pressable>
      </View>
    );
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
            <Pressable accessibilityRole="button" onPress={onPlanAgain} style={styles.button}>
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
    minHeight: 44,
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
