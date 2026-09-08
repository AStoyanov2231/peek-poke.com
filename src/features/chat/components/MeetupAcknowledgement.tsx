"use client";

import { Check, HandHeart } from "lucide-react";
import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { acknowledgeMeetup, fetchMeetupAcknowledgement } from "@/data/meetups";
import { WEB_QUERY_STALE_TIME, webQueryKeys } from "@/data/web-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface MeetupAcknowledgementProps {
  peerId: string;
  name: string;
  onPlanAgain: () => void;
}

export function MeetupAcknowledgement({
  peerId,
  name,
  onPlanAgain,
}: MeetupAcknowledgementProps) {
  const [confirming, setConfirming] = useState(false);
  const attemptKeyRef = useRef<string | null>(null);
  const queryClient = useQueryClient();
  const acknowledgement = useQuery({
    queryKey: webQueryKeys.meetup(peerId),
    queryFn: ({ signal }) => fetchMeetupAcknowledgement(peerId, signal),
    staleTime: WEB_QUERY_STALE_TIME.social,
    refetchInterval: 30_000,
  });
  const currentMeetup = acknowledgement.data?.meetup ?? null;
  const mutation = useMutation({
    mutationFn: () => {
      attemptKeyRef.current ??= crypto.randomUUID();
      return acknowledgeMeetup(peerId, attemptKeyRef.current);
    },
    onSuccess: ({ meetup: nextMeetup }) => {
      queryClient.setQueryData(webQueryKeys.meetup(peerId), {
        meetup: nextMeetup,
      });
      void queryClient.invalidateQueries({
        queryKey: webQueryKeys.meetup(peerId),
      });
      setConfirming(false);
    },
  });

  if (currentMeetup?.status === "confirmed") {
    return (
      <div className="mx-4 mt-3 flex items-center justify-between gap-3 rounded-xl border border-primary-100 bg-primary-50 px-3 py-2.5">
        <div className="flex min-w-0 items-center gap-2 text-primary-700">
          <Check size={17} aria-hidden="true" />
          <p className="t-caption">You both marked this meetup.</p>
        </div>
        <button
          type="button"
          className="btn btn-secondary btn-sm shrink-0"
          onClick={onPlanAgain}
        >
          Plan again
        </button>
      </div>
    );
  }

  return (
    <>
      <div className="mx-4 mt-3 flex items-center justify-between gap-3 rounded-xl border border-hairline bg-surface px-3 py-2.5">
        <div className="min-w-0">
          <p className="t-caption font-semibold text-ink-8">Did you meet up?</p>
          <p className="t-caption muted">Let each other know you connected.</p>
        </div>
        {currentMeetup?.status === "waiting" &&
        currentMeetup.viewerConfirmed ? (
          <span className="shrink-0 t-caption text-ink-6">
            Waiting for {name}
          </span>
        ) : (
          <button
            type="button"
            className="btn btn-secondary btn-sm shrink-0"
            onClick={() => setConfirming(true)}
          >
            <HandHeart size={15} />
            We met
          </button>
        )}
      </div>
      {currentMeetup?.status === "waiting" && !currentMeetup.viewerConfirmed ? (
        <p className="mx-4 mt-2 t-caption text-ink-6">
          {name} marked that you met. Did you?
        </p>
      ) : null}
      {mutation.isError ? (
        <p role="alert" className="mx-4 mt-2 t-caption text-danger-500">
          {mutation.error.message}
        </p>
      ) : null}
      <Dialog
        open={confirming}
        onOpenChange={(open) => !mutation.isPending && setConfirming(open)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mark that you met?</DialogTitle>
            <DialogDescription>
              {name} will be asked to acknowledge this too. No rewards are
              attached.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <button
              type="button"
              className="btn btn-secondary btn-md"
              disabled={mutation.isPending}
              onClick={() => setConfirming(false)}
            >
              Not yet
            </button>
            <button
              type="button"
              className="btn btn-accent btn-md"
              disabled={mutation.isPending}
              onClick={() => mutation.mutate()}
            >
              {mutation.isPending ? "Marking…" : "Yes, we met"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
