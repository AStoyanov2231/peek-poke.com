"use client";

import { useId, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, MapPin, Users } from "lucide-react";
import type { PlanCreateRequest } from "@peekpoke/shared";
import { createPlan } from "@/data/plans";
import { bootstrapQueryOptions, webQueryKeys } from "@/data/web-query";
import { sharedGroupsQueryOptions } from "@/data/web-query";
import { useNearbyPresence } from "@/features/map/useNearbyPresence";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type PlanComposerDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sourceThreadId?: string;
  defaultActivity?: string;
  defaultPlaceText?: string;
  defaultCircleId?: string;
  onCreated?: (planId: string) => void;
};

function localDateTimeMinimum() {
  const now = new Date(Date.now() + 5 * 60_000);
  now.setSeconds(0, 0);
  const zoneOffset = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - zoneOffset).toISOString().slice(0, 16);
}

export function PlanComposerDialog(props: PlanComposerDialogProps) {
  return props.open ? <PlanComposerForm {...props} /> : null;
}

function PlanComposerForm({
  open,
  onOpenChange,
  sourceThreadId,
  defaultActivity = "Coffee",
  defaultPlaceText = "",
  defaultCircleId,
  onCreated,
}: PlanComposerDialogProps) {
  const queryClient = useQueryClient();
  const actorId = useQuery(bootstrapQueryOptions).data?.identity.id;
  const presence = useNearbyPresence(actorId);
  const groupsQuery = useQuery(sharedGroupsQueryOptions);
  const activityId = useId();
  const timeId = useId();
  const placeId = useId();
  const visibilityId = useId();
  const [activity, setActivity] = useState(defaultActivity);
  const [startsAt, setStartsAt] = useState("");
  const [placeText, setPlaceText] = useState(defaultPlaceText);
  const [visibility, setVisibility] = useState<
    "private" | "friends" | "circle" | "open"
  >(defaultCircleId ? "circle" : "private");
  const [circleId, setCircleId] = useState(defaultCircleId ?? "");
  const [participantLimit, setParticipantLimit] = useState(4);
  const [nearbyDiscovery, setNearbyDiscovery] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasAttempt, setHasAttempt] = useState(false);
  const attemptKeyRef = useRef<string | null>(null);
  const attemptBodyRef = useRef<PlanCreateRequest | null>(null);
  const minimum = open ? localDateTimeMinimum() : "";
  const mutation = useMutation({
    mutationFn: async (input: PlanCreateRequest) => {
      if (input.nearby_discovery && !presence.isLocationFresh && await presence.requestLocationSync() !== "success") throw new Error("Location wasn’t enabled. Retry, or cancel and create an open Plan without nearby discovery.");
      return createPlan(input, attemptKeyRef.current ?? crypto.randomUUID());
    },
    onSuccess: ({ plan }) => {
      void queryClient.invalidateQueries({ queryKey: webQueryKeys.plans });
      onOpenChange(false);
      onCreated?.(plan.id);
      setStartsAt("");
      setPlaceText("");
      setError(null);
      attemptKeyRef.current = null;
    },
    onError: (reason: Error) => setError(reason.message),
  });
  const fieldsLocked = mutation.isPending || hasAttempt;
  const changeOpen = (next: boolean) => { if (!mutation.isPending) onOpenChange(next); };

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (
      !startsAt ||
      !placeText.trim() ||
      !activity.trim() ||
      (visibility === "circle" && !circleId)
    )
      return;
    setError(null);
    attemptKeyRef.current ??= crypto.randomUUID();
    attemptBodyRef.current ??= {
      activity: activity.trim(),
      starts_at: new Date(startsAt).toISOString(),
      place_text: placeText.trim(),
      visibility,
      ...(visibility === "circle" ? { circle_id: circleId } : {}),
      participant_limit: participantLimit,
      nearby_discovery: visibility === "open" && nearbyDiscovery,
      ...(sourceThreadId ? { source_thread_id: sourceThreadId } : {}),
    };
    setHasAttempt(true);
    mutation.mutate(attemptBodyRef.current);
  }

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Make a plan</DialogTitle>
          <DialogDescription>
            Set the essentials now. You can change the details later.
          </DialogDescription>
        </DialogHeader>
        <form className="grid gap-4" onSubmit={submit}>
          <label className="grid gap-1.5" htmlFor={activityId}>
            <span className="t-caption text-ink-7">What are you doing?</span>
            <input
              disabled={fieldsLocked}
              id={activityId}
              className="input"
              value={activity}
              maxLength={48}
              onChange={(event) => setActivity(event.target.value)}
              required
            />
          </label>
          <label className="grid gap-1.5" htmlFor={timeId}>
            <span className="t-caption text-ink-7">
              <CalendarClock className="mr-1 inline h-3.5 w-3.5" />
              When
            </span>
            <input
              disabled={fieldsLocked}
              id={timeId}
              className="input"
              type="datetime-local"
              min={minimum}
              value={startsAt}
              onChange={(event) => setStartsAt(event.target.value)}
              required
            />
          </label>
          <label className="grid gap-1.5" htmlFor={placeId}>
            <span className="t-caption text-ink-7">
              <MapPin className="mr-1 inline h-3.5 w-3.5" />
              Place or area
            </span>
            <input
              disabled={fieldsLocked}
              id={placeId}
              className="input"
              value={placeText}
              maxLength={160}
              placeholder="Name a place or general area"
              onChange={(event) => setPlaceText(event.target.value)}
              required
            />
          </label>
          <label className="grid gap-1.5" htmlFor={visibilityId}>
            <span className="t-caption text-ink-7">
              <Users className="mr-1 inline h-3.5 w-3.5" />
              Who can see it?
            </span>
            <select
              disabled={fieldsLocked}
              id={visibilityId}
              className="input"
              value={visibility}
              onChange={(event) =>
                setVisibility(event.target.value as typeof visibility)
              }
            >
              <option value="private">Just us</option>
              <option value="friends">Friends</option>
              <option
                value="circle"
                disabled={!groupsQuery.data?.groups.length}
              >
                A Circle
              </option>
              <option value="open">Open</option>
            </select>
          </label>
          {visibility === "circle" ? (
            <label className="grid gap-1.5" htmlFor={`${visibilityId}-circle`}>
              <span className="t-caption text-ink-7">Choose a Circle</span>
              <select
                id={`${visibilityId}-circle`}
                className="input"
                value={circleId}
                disabled={fieldsLocked || groupsQuery.isLoading}
                required
                onChange={(event) => setCircleId(event.target.value)}
              >
                <option value="">
                  {groupsQuery.isLoading
                    ? "Loading your Circles…"
                    : "Choose a Circle"}
                </option>
                {groupsQuery.data?.groups.map((group) => (
                  <option key={group.id} value={group.id}>
                    {group.name} · {group.member_count}{" "}
                    {group.member_count === 1 ? "member" : "members"}
                  </option>
                ))}
              </select>
              {!groupsQuery.isLoading && !groupsQuery.data?.groups.length ? (
                <p className="t-caption text-ink-6">
                  Scan a Circle QR code from Inbox to join one before creating a
                  Circle plan.
                </p>
              ) : null}
            </label>
          ) : null}
          {visibility === "open" ? <label className="flex items-start gap-2 rounded-xl bg-ink-1 p-3 t-caption text-ink-7"><input disabled={fieldsLocked} type="checkbox" checked={nearbyDiscovery} onChange={(event) => setNearbyDiscovery(event.target.checked)} /><span>Show this Plan near my current approximate area. This asks for location when you create the Plan. Choose it only if the meeting will be near you. Otherwise, people can join through your share link.</span></label> : null}
          <label className="grid gap-1.5" htmlFor={`${visibilityId}-capacity`}>
            <span className="t-caption text-ink-7">
              <Users className="mr-1 inline h-3.5 w-3.5" />
              How many people?
            </span>
            <select
              disabled={fieldsLocked}
              id={`${visibilityId}-capacity`}
              className="input"
              value={participantLimit}
              onChange={(event) =>
                setParticipantLimit(Number(event.target.value))
              }
            >
              {[2, 4, 8, 12, 20].map((limit) => (
                <option key={limit} value={limit}>
                  Up to {limit}
                </option>
              ))}
            </select>
          </label>
          {error ? (
            <div><p role="alert" className="t-caption text-danger-500">{error}</p><p className="mt-2 t-caption text-ink-6">Retry to recover the same Plan if your request already reached the server.</p></div>
          ) : null}
          <DialogFooter>
            <button
              type="button"
              className="btn btn-ghost btn-md"
              disabled={mutation.isPending}
              onClick={() => changeOpen(false)}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-accent btn-md"
              disabled={mutation.isPending}
            >
              {mutation.isPending ? "Creating…" : "Create plan"}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
