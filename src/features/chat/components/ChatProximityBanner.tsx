"use client";

import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { MapPin, X } from "lucide-react";
import { ApiTransportError } from "@peekpoke/shared";
import {
  discardMeetingAttempt,
  recordMeeting,
  unsubscribeMeetingAttempt,
  webQueryKeys,
} from "@/data/web-query";
import { useAppStore } from "@/stores/appStore";

interface ChatProximityBannerProps {
  accountId: string;
  friendId: string;
  distanceMeters: number;
  meetingEligible: boolean;
  name: string;
  threadId: string;
}

type MeetingState = "idle" | "pending" | "success" | "error";

export function ChatProximityBanner({
  accountId,
  friendId,
  distanceMeters,
  meetingEligible,
  name,
  threadId,
}: ChatProximityBannerProps) {
  const queryClient = useQueryClient();
  const [dismissed, setDismissed] = useState(false);
  const [meetingState, setMeetingState] = useState<MeetingState>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const ownerIdentity = `${accountId}:${threadId}:${friendId}`;
  const consumerId = `web-chat-meeting:${ownerIdentity}`;
  const ownerRef = useRef(ownerIdentity);

  useEffect(() => {
    ownerRef.current = ownerIdentity;
    return () => {
      ownerRef.current = "";
      unsubscribeMeetingAttempt(accountId, friendId, consumerId);
    };
  }, [accountId, consumerId, friendId, ownerIdentity]);

  if (dismissed) return null;

  const record = () => {
    if (!meetingEligible || meetingState === "pending") return;
    const submissionOwner = ownerIdentity;
    setMeetingState("pending");
    setMessage(null);
    void recordMeeting(accountId, friendId, undefined, (result) => {
      if (ownerRef.current !== submissionOwner || result.already_met) return;
      queryClient.setQueryData(webQueryKeys.coins, { balance: result.balance });
    }, consumerId).then((result) => {
      if (ownerRef.current !== submissionOwner) return;
      setMeetingState("success");
      setMessage(result.already_met
        ? "Meeting already recorded"
        : result.awarded ? "Coin earned" : "Meeting recorded");
    }).catch((error: unknown) => {
      if (ownerRef.current !== submissionOwner) return;
      if (error instanceof Error && error.name === "AbortError") {
        setMeetingState("idle");
        setMessage(null);
        return;
      }
      if (error instanceof ApiTransportError && error.code === "LOCATION_STALE") {
        useAppStore.getState().markLocationStale();
        setMeetingState("idle");
        setMessage(null);
        return;
      }
      setMeetingState("error");
      setMessage(error instanceof Error ? error.message : "Could not record meeting");
    });
  };

  return (
    <div
      className="flex items-center gap-2.5 px-3 py-2.5 mx-4 mt-3 rounded-md border flex-shrink-0"
      style={{ background: "var(--primary-50)", borderColor: "var(--primary-100)" }}
    >
      <MapPin size={16} style={{ color: "var(--primary-500)", flexShrink: 0 }} />
      <div className="min-w-0 flex-1">
        <p className="t-caption truncate" style={{ color: "var(--primary-600)" }}>
          You&apos;re {distanceMeters}m from {name}
        </p>
        {message ? (
          <p className="t-caption" role="status" style={{ color: "var(--primary-600)" }}>
            {message}
          </p>
        ) : null}
      </div>
      {meetingEligible && meetingState !== "success" ? (
        <button
          type="button"
          className="min-h-11 t-caption font-semibold flex-shrink-0 disabled:opacity-60"
          style={{ color: "var(--primary-500)" }}
          disabled={meetingState === "pending"}
          onClick={record}
          aria-label={meetingState === "error" ? "Retry Meet and earn" : "Meet and earn"}
        >
          {meetingState === "pending" ? "Recording…" : meetingState === "error" ? "Retry" : "Meet & earn"}
        </button>
      ) : null}
      {meetingState === "error" ? (
        <button
          type="button"
          className="min-h-11 t-caption flex-shrink-0"
          onClick={() => {
            if (!discardMeetingAttempt(accountId, friendId)) return;
            setMeetingState("idle");
            setMessage(null);
          }}
          aria-label="Discard meeting retry"
        >
          Discard
        </button>
      ) : null}
      <button
        type="button"
        onClick={() => setDismissed(true)}
        className="iconbtn flex-shrink-0"
        style={{ width: 44, height: 44, color: "var(--primary-400)" }}
        aria-label="Dismiss proximity message"
      >
        <X size={14} />
      </button>
    </div>
  );
}
