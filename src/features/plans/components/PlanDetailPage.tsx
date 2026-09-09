"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CalendarClock,
  ChevronRight,
  Check,
  Copy,
  MapPin,
  MessageCircle,
  Pencil,
  QrCode,
  Share2,
  Users,
  X,
} from "lucide-react";
import { format } from "date-fns";
import { QRCodeSVG } from "qrcode.react";
import type { PlanPatchRequest } from "@peekpoke/shared";
import {
  cancelPlan,
  createPlanShare,
  joinPlan,
  leavePlan,
  revokePlanShares,
  updatePlan,
} from "@/data/plans";
import { planQueryOptions, webQueryKeys } from "@/data/web-query";
import { useTransitionRouter } from "@/hooks/useTransitionRouter";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { PlanMeetupAcknowledgements } from "@/features/plans/components/PlanMeetupAcknowledgements";
import { PlanDetailsShare } from "@/features/plans/components/PlanDetailsShare";
import { hasPlanStarted } from "@/data/plan-detail-time";
import { useAuth } from "@/features/auth/useAuth";

function localDate(value: string) {
  return new Date(
    new Date(value).getTime() - new Date(value).getTimezoneOffset() * 60_000,
  )
    .toISOString()
    .slice(0, 16);
}

export function PlanDetailPage({ planId }: { planId: string }) {
  const { user } = useAuth();
  const router = useTransitionRouter();
  const queryClient = useQueryClient();
  const query = useQuery(planQueryOptions(planId));
  const [editing, setEditing] = useState(false);
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const [confirmingLeave, setConfirmingLeave] = useState(false);
  const [confirmingRevoke, setConfirmingRevoke] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const joinAttemptKeyRef = useRef<string | null>(null);

  useEffect(() => {
    const startsAt = query.data?.plan.starts_at;
    if (!startsAt) return;

    const delay = new Date(startsAt).getTime() - Date.now();
    const timeout = window.setTimeout(
      () => setNow(Date.now()),
      Math.max(0, delay),
    );
    return () => window.clearTimeout(timeout);
  }, [query.data?.plan.starts_at]);
  const editMutation = useMutation({
    mutationFn: (input: PlanPatchRequest) => updatePlan(planId, input),
    onSuccess: (data) => {
      queryClient.setQueryData(webQueryKeys.plan(planId), data);
      void queryClient.invalidateQueries({ queryKey: webQueryKeys.plans });
      setEditing(false);
      setError(null);
    },
    onError: (reason: Error) => setError(reason.message),
  });
  const joinMutation = useMutation({
    mutationFn: () => {
      joinAttemptKeyRef.current ??= crypto.randomUUID();
      return joinPlan(planId, {}, joinAttemptKeyRef.current);
    },
    onSuccess: () => {
      joinAttemptKeyRef.current = null;
      void queryClient.invalidateQueries({
        queryKey: webQueryKeys.plan(planId),
      });
      void queryClient.invalidateQueries({ queryKey: webQueryKeys.plans });
    },
    onError: (reason: Error) => setError(reason.message),
  });
  const cancelMutation = useMutation({
    mutationFn: () => cancelPlan(planId),
    onSuccess: (data) => {
      queryClient.setQueryData(webQueryKeys.plan(planId), data);
      void queryClient.invalidateQueries({ queryKey: webQueryKeys.plans });
      setConfirmingCancel(false);
    },
    onError: (reason: Error) => setError(reason.message),
  });
  const shareMutation = useMutation({
    mutationFn: () => createPlanShare(planId),
    onSuccess: ({ token }) => {
      setShareUrl(`${window.location.origin}/plan/${token}`);
      setError(null);
    },
    onError: (reason: Error) => setError(reason.message),
  });
  const leaveMutation = useMutation({
    mutationFn: () => leavePlan(planId),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: webQueryKeys.plan(planId),
      });
      void queryClient.invalidateQueries({ queryKey: webQueryKeys.plans });
      setConfirmingLeave(false);
      setError(null);
    },
    onError: (reason: Error) => setError(reason.message),
  });
  const revokeMutation = useMutation({
    mutationFn: () => revokePlanShares(planId),
    onSuccess: () => {
      setShareUrl(null);
      setCopied(false);
      setConfirmingRevoke(false);
      setError(null);
    },
    onError: (reason: Error) => setError(reason.message),
  });

  if (query.isLoading)
    return (
      <div className="flex h-full items-center justify-center t-caption muted">
        Loading plan…
      </div>
    );
  if (query.isError || !query.data)
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="t-body text-ink-9">This plan could not be loaded.</p>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={() => void query.refetch()}
        >
          Try again
        </button>
      </div>
    );
  const { plan, members } = query.data;
  const isPast = hasPlanStarted(plan.starts_at, now);
  const inactive = plan.status === "cancelled" || isPast;

  async function copyShare() {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
    } catch {
      setError(
        "Could not copy the link. Select it from the QR preview instead.",
      );
    }
  }

  return (
    <main
      className="mx-auto flex w-full max-w-2xl flex-col gap-5 p-4 md:p-8"
      style={{ paddingBottom: "calc(var(--safe-area-bottom) + 2.5rem)" }}
    >
      <button
        type="button"
        className="w-fit t-caption text-ink-6 hover:text-ink-9"
        onClick={() => router.back()}
      >
        ← Back to plans
      </button>
      <section className="card-flat space-y-5 p-5 md:p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="t-micro">
              {plan.status === "cancelled"
                ? "Cancelled plan"
                : isPast
                  ? "Past plan"
                  : plan.visibility === "open"
                    ? "Open nearby"
                    : plan.visibility === "friends"
                      ? "Friends plan"
                      : plan.visibility === "circle"
                        ? "Circle plan"
                        : "Private plan"}
            </p>
            <h1 className="mt-1 t-title-1 text-ink-9">
              {plan.title ?? plan.activity}
            </h1>
            {plan.title ? (
              <p className="mt-1 t-body text-primary-600">{plan.activity}</p>
            ) : null}
          </div>
          {plan.viewer_is_owner && !inactive ? (
            <button
              type="button"
              className="iconbtn"
              aria-label="Edit plan"
              onClick={() => setEditing(true)}
            >
              <Pencil size={17} />
            </button>
          ) : null}
        </div>
        <div className="grid gap-3 rounded-xl bg-ink-1 p-4 t-callout text-ink-8">
          <p className="flex items-center gap-2">
            <CalendarClock
              className="text-primary-600"
              size={18}
              aria-hidden="true"
            />
            {format(new Date(plan.starts_at), "EEEE, MMMM d · p")}
          </p>
          <p className="flex items-center gap-2">
            <MapPin className="text-primary-600" size={18} aria-hidden="true" />
            {plan.place_text}
          </p>
          <p className="flex items-center gap-2">
            <Users className="text-primary-600" size={18} aria-hidden="true" />
            {plan.member_count} of {plan.participant_limit} going
          </p>
        </div>
        {error ? (
          <p
            role="alert"
            className="rounded-xl bg-danger-50 px-3 py-2 t-caption text-danger-500"
          >
            {error}
          </p>
        ) : null}
        {!inactive && (
          <div className="flex flex-wrap gap-2">
            {!plan.viewer_is_member ? (
              <button
                type="button"
                className="btn btn-accent btn-md"
                disabled={joinMutation.isPending}
                onClick={() => joinMutation.mutate()}
              >
                {joinMutation.isPending ? "Joining…" : "Join plan"}
              </button>
            ) : (
              <span className="inline-flex h-10 items-center gap-2 rounded-md bg-primary-100 px-3 t-caption font-semibold text-primary-700">
                <Check size={15} />
                You&apos;re going
              </span>
            )}
            {plan.viewer_is_owner ? (
              <button
                type="button"
                className="btn btn-secondary btn-md"
                disabled={shareMutation.isPending || revokeMutation.isPending}
                onClick={() => shareMutation.mutate()}
              >
                <Share2 size={16} />
                {shareMutation.isPending ? "Preparing…" : "Share invite"}
              </button>
            ) : null}
            {plan.source_thread_id ? (
              <button
                type="button"
                className="btn btn-secondary btn-md"
                onClick={() => router.push(`/chat/${plan.source_thread_id}`)}
              >
                <MessageCircle size={16} />
                Open conversation
              </button>
            ) : null}
            {plan.viewer_is_member && !plan.viewer_is_owner ? (
              <button
                type="button"
                className="btn btn-ghost btn-md text-danger-500"
                onClick={() => setConfirmingLeave(true)}
              >
                Leave plan
              </button>
            ) : null}
            {plan.viewer_is_owner ? (
              <button
                type="button"
                className="btn btn-ghost btn-md text-danger-500"
                onClick={() => setConfirmingCancel(true)}
              >
                <X size={16} />
                Cancel plan
              </button>
            ) : null}
          </div>
        )}
        <PlanDetailsShare key={`${user?.id}:${plan.id}`} plan={plan} />
      </section>
      <section className="card-flat p-5">
        <p className="t-body-b text-ink-9">Going</p>
        <div className="mt-3 space-y-2">
          {members.map((member) => {
            const name = member.display_name ?? "Peek & Poke member";
            return (
              <Link
                key={member.user_id}
                href={member.user_id === user?.id ? "/profile" : `/profile/${member.user_id}`}
                aria-label={`View ${name}'s profile`}
                className="flex min-h-12 items-center gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-ink-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500"
              >
                <Avatar className="h-9 w-9">
                  <AvatarImage
                    src={member.avatar_url ?? undefined}
                    alt={name}
                  />
                  <AvatarFallback name={name} />
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="t-callout text-ink-8">{name}</p>
                  <p className="t-caption muted">
                    {member.role === "owner" ? "Hosting" : "Going"}
                  </p>
                </div>
                <ChevronRight size={18} className="shrink-0 text-ink-5" aria-hidden="true" />
              </Link>
            );
          })}
        </div>
      </section>
      <PlanMeetupAcknowledgements planId={planId} members={members} />
      {shareUrl ? (
        <section className="card-flat flex flex-col items-center gap-4 p-5 text-center">
          <div>
            <p className="t-body-b text-ink-9">Plan QR code</p>
            <p className="mt-1 t-caption muted">
              Scanning opens a preview before anyone is asked to join.
            </p>
          </div>
          <div className="rounded-xl bg-white p-3 shadow-e-1">
            <QRCodeSVG value={shareUrl} size={180} />
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => void copyShare()}
            >
              <Copy size={14} />
              {copied ? "Copied" : "Copy link"}
            </button>
            {plan.viewer_is_owner ? (
              <button
                type="button"
                className="btn btn-ghost btn-sm text-danger-500"
                disabled={revokeMutation.isPending}
                onClick={() => setConfirmingRevoke(true)}
              >
                {revokeMutation.isPending ? "Revoking…" : "Revoke links"}
              </button>
            ) : null}
          </div>
          <p className="max-w-full break-all t-caption muted">{shareUrl}</p>
        </section>
      ) : null}
      <PlanEditDialog
        open={editing}
        onOpenChange={setEditing}
        plan={plan}
        pending={editMutation.isPending}
        onSave={(input) => editMutation.mutate(input)}
      />
      <Dialog open={confirmingCancel} onOpenChange={setConfirmingCancel}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel this plan?</DialogTitle>
            <DialogDescription>
              People who joined will no longer see it as active.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <button
              type="button"
              className="btn btn-secondary btn-md"
              onClick={() => setConfirmingCancel(false)}
            >
              Keep plan
            </button>
            <button
              type="button"
              className="btn btn-danger btn-md"
              disabled={cancelMutation.isPending}
              onClick={() => cancelMutation.mutate()}
            >
              {cancelMutation.isPending ? "Cancelling…" : "Cancel plan"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={confirmingLeave} onOpenChange={setConfirmingLeave}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Leave this plan?</DialogTitle>
            <DialogDescription>
              You will no longer be counted as going. The host keeps the plan
              active.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <button
              type="button"
              className="btn btn-secondary btn-md"
              onClick={() => setConfirmingLeave(false)}
            >
              Stay
            </button>
            <button
              type="button"
              className="btn btn-danger btn-md"
              disabled={leaveMutation.isPending}
              onClick={() => leaveMutation.mutate()}
            >
              {leaveMutation.isPending ? "Leaving…" : "Leave plan"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={confirmingRevoke} onOpenChange={setConfirmingRevoke}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Revoke every share link?</DialogTitle>
            <DialogDescription>
              Existing public links and QR codes for this plan will stop
              working.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <button
              type="button"
              className="btn btn-secondary btn-md"
              onClick={() => setConfirmingRevoke(false)}
            >
              Keep links
            </button>
            <button
              type="button"
              className="btn btn-danger btn-md"
              disabled={revokeMutation.isPending}
              onClick={() => revokeMutation.mutate()}
            >
              {revokeMutation.isPending ? "Revoking…" : "Revoke links"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}

function PlanEditDialog({
  open,
  onOpenChange,
  plan,
  pending,
  onSave,
}: {
  open: boolean;
  onOpenChange: (value: boolean) => void;
  plan: {
    activity: string;
    starts_at: string;
    place_text: string;
    visibility: "private" | "friends" | "circle" | "open";
    participant_limit: number;
  };
  pending: boolean;
  onSave: (value: PlanPatchRequest) => void;
}) {
  const activityId = useId();
  const timeId = useId();
  const placeId = useId();
  const [activity, setActivity] = useState(plan.activity);
  const [startsAt, setStartsAt] = useState(localDate(plan.starts_at));
  const [placeText, setPlaceText] = useState(plan.place_text);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit plan</DialogTitle>
          <DialogDescription>
            Keep the people joining in the loop.
          </DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            onSave({
              activity: activity.trim(),
              starts_at: new Date(startsAt).toISOString(),
              place_text: placeText.trim(),
            });
          }}
        >
          <label className="grid gap-1.5" htmlFor={activityId}>
            <span className="t-caption">Activity</span>
            <input
              id={activityId}
              className="input"
              value={activity}
              maxLength={48}
              required
              onChange={(event) => setActivity(event.target.value)}
            />
          </label>
          <label className="grid gap-1.5" htmlFor={timeId}>
            <span className="t-caption">When</span>
            <input
              id={timeId}
              className="input"
              type="datetime-local"
              value={startsAt}
              required
              onChange={(event) => setStartsAt(event.target.value)}
            />
          </label>
          <label className="grid gap-1.5" htmlFor={placeId}>
            <span className="t-caption">Place or area</span>
            <input
              id={placeId}
              className="input"
              value={placeText}
              maxLength={160}
              required
              onChange={(event) => setPlaceText(event.target.value)}
            />
          </label>
          <DialogFooter>
            <button
              type="button"
              className="btn btn-ghost btn-md"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-accent btn-md"
              disabled={pending}
            >
              {pending ? "Saving…" : "Save changes"}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
