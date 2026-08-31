import { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import { colors, fontFamilies, spacing, typography } from "@peekpoke/design";
import { ApiTransportError } from "@peekpoke/shared";
import {
  discardMeetingAttempt,
  recordMeeting,
  unsubscribeMeetingAttempt,
} from "@/data/api";
import { nativeQueryKeys } from "@/data/query-keys";
import { markDeviceLocationStale } from "@/lib/location";

type MeetingState = "idle" | "pending" | "success" | "error";

export function ChatMeetingAction({
  accountId,
  friendId,
  meetingEligible,
  threadId,
}: {
  accountId: string;
  friendId: string;
  meetingEligible: boolean;
  threadId: string;
}) {
  const queryClient = useQueryClient();
  const [state, setState] = useState<MeetingState>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const ownerIdentity = `${accountId}:${threadId}:${friendId}`;
  const consumerId = `native-chat-meeting:${ownerIdentity}`;
  const ownerRef = useRef(ownerIdentity);

  useEffect(() => {
    ownerRef.current = ownerIdentity;
    return () => {
      ownerRef.current = "";
      unsubscribeMeetingAttempt(accountId, friendId, consumerId);
    };
  }, [accountId, consumerId, friendId, ownerIdentity]);

  if (!meetingEligible) return null;

  const record = () => {
    if (state === "pending") return;
    const submissionOwner = ownerIdentity;
    setState("pending");
    setMessage(null);
    void recordMeeting(accountId, friendId, undefined, (result) => {
      if (ownerRef.current !== submissionOwner || result.already_met) return;
      queryClient.setQueryData(nativeQueryKeys.coins, { balance: result.balance });
    }, consumerId).then((result) => {
      if (ownerRef.current !== submissionOwner) return;
      setState("success");
      setMessage(result.already_met
        ? "Meeting already recorded"
        : result.awarded ? "Coin earned" : "Meeting recorded");
    }).catch((error: unknown) => {
      if (ownerRef.current !== submissionOwner) return;
      if (error instanceof Error && error.name === "AbortError") {
        setState("idle");
        setMessage(null);
        return;
      }
      if (error instanceof ApiTransportError && error.code === "LOCATION_STALE") {
        markDeviceLocationStale(accountId, "Location needs to be refreshed.");
        setState("idle");
        setMessage(null);
        return;
      }
      setState("error");
      setMessage(error instanceof Error ? error.message : "Could not record meeting");
    });
  };

  if (state === "success") {
    return <Text accessibilityLiveRegion="polite" style={styles.message}>{message}</Text>;
  }

  return (
    <View style={styles.row}>
      <Pressable
        accessibilityLabel={state === "error" ? "Retry Meet and earn" : "Meet and earn"}
        accessibilityRole="button"
        accessibilityState={{ busy: state === "pending", disabled: state === "pending" }}
        disabled={state === "pending"}
        hitSlop={4}
        onPress={record}
        style={styles.button}
      >
        <Text style={styles.buttonText}>
          {state === "pending" ? "Recording…" : state === "error" ? "Retry" : "Meet & earn"}
        </Text>
      </Pressable>
      {state === "error" ? (
        <Pressable
          accessibilityLabel="Discard meeting retry"
          accessibilityRole="button"
          hitSlop={4}
          onPress={() => {
            if (!discardMeetingAttempt(accountId, friendId)) return;
            setState("idle");
            setMessage(null);
          }}
          style={styles.button}
        >
          <Text style={styles.discardText}>Discard</Text>
        </Pressable>
      ) : null}
      {message ? <Text accessibilityLiveRegion="polite" style={styles.error}>{message}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: spacing[1], flexShrink: 0 },
  button: { minHeight: 44, justifyContent: "center", paddingHorizontal: spacing[2] },
  buttonText: { ...typography.caption, color: colors.primary[500], fontFamily: fontFamilies.semibold },
  discardText: { ...typography.caption, color: colors.ink[6] },
  message: { ...typography.caption, color: colors.primary[600], flexShrink: 0 },
  error: { ...typography.caption, color: colors.danger[500], maxWidth: 120 },
});
