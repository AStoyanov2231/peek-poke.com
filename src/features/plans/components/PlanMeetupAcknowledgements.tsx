"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check } from "lucide-react";
import {
  planMeetupRequestSchema,
  planMeetupStatusResponseSchema,
} from "@peekpoke/shared/plans";
import { fetchContract } from "@/lib/typed-api";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAuth } from "@/features/auth/useAuth";
import {
  createPlanMeetupAttemptRegistry,
  type PlanMeetupConfirmationAttempt,
} from "@/data/plan-meetup-attempts";

type Member = {
  user_id: string;
  display_name: string | null;
};

function meetupQueryKey(planId: string, accountId: string) {
  return ["web", "plans", planId, "meetups", accountId] as const;
}

export function PlanMeetupAcknowledgements({
  planId,
  members,
}: {
  planId: string;
  members: Member[];
}) {
  const client = useQueryClient();
  const { user } = useAuth();
  const accountId = user?.id ?? null;
  const [peerId, setPeerId] = useState<string | null>(null);
  const accountIdRef = useRef<string | null>(accountId);
  const [attemptRegistry] = useState(() =>
    createPlanMeetupAttemptRegistry(),
  );

  useEffect(() => {
    accountIdRef.current = accountId;
  }, [accountId]);
  const status = useQuery({
    queryKey: meetupQueryKey(planId, accountId ?? "anonymous"),
    queryFn: ({ signal }) =>
      fetchContract(
        `/api/plans/${encodeURIComponent(planId)}/meetups`,
        planMeetupStatusResponseSchema,
        { cache: "no-store", signal },
      ),
    enabled: Boolean(accountId),
    refetchInterval: accountId ? 30_000 : false,
  });
  const mutation = useMutation({
    mutationFn: async (attempt: PlanMeetupConfirmationAttempt) => {
      if (attempt.accountId !== accountIdRef.current) {
        throw new Error("Your account changed. Reopen this plan to confirm.");
      }

      const idempotencyKey = attemptRegistry.keyFor(attempt);

      return fetchContract(
        `/api/plans/${encodeURIComponent(planId)}/meetups`,
        planMeetupStatusResponseSchema,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "idempotency-key": idempotencyKey,
          },
          body: JSON.stringify(
            planMeetupRequestSchema.parse({ peerId: attempt.peerId }),
          ),
        },
      );
    },
    onSuccess: (data, attempt) => {
      if (attempt.accountId !== accountIdRef.current) return;

      client.setQueryData(meetupQueryKey(planId, attempt.accountId), data);
      void client.invalidateQueries({
        queryKey: meetupQueryKey(planId, attempt.accountId),
      });
      setPeerId(null);
    },
  });

  const hasAcknowledgement = status.data?.acknowledgements.some(
    (item) => item.viewerConfirmed || item.peerConfirmed,
  );
  if (status.isError) {
    return (
      <section className="card-flat space-y-3 p-5" aria-live="polite">
        <div>
          <p className="t-body-b text-ink-9">After the plan</p>
          <p className="t-caption text-danger-500">
            Could not load meetup confirmations.
          </p>
        </div>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={() => void status.refetch()}
        >
          Try again
        </button>
      </section>
    );
  }
  if (!status.data?.canConfirm && !hasAcknowledgement) return null;

  const selectedMember = members.find((member) => member.user_id === peerId);
  const selectedName = selectedMember?.display_name ?? "this plan member";

  return (
    <section className="card-flat space-y-3 p-5">
      <div>
        <p className="t-body-b text-ink-9">After the plan</p>
        <p className="t-caption muted">
          A shared acknowledgement with no rewards attached.
        </p>
      </div>

      {status.data?.acknowledgements.map((item) => {
        const name =
          members.find((member) => member.user_id === item.peerId)
            ?.display_name ?? "A plan member";
        const canAcknowledge =
          status.data.canConfirm && !item.viewerConfirmed && !mutation.isPending;

        return (
          <div
            key={item.peerId}
            className="flex items-center justify-between gap-3"
          >
            <p className="t-caption text-ink-7">
              {item.viewerConfirmed && item.peerConfirmed
                ? `You both marked meeting ${name}.`
                : item.viewerConfirmed
                  ? `Waiting for ${name}.`
                  : item.peerConfirmed
                    ? `${name} marked that you met. Did you?`
                    : `Did you meet ${name}?`}
            </p>
            {item.viewerConfirmed && item.peerConfirmed ? (
              <Check className="shrink-0 text-primary-600" size={17} />
            ) : (
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                disabled={!canAcknowledge}
                onClick={() => setPeerId(item.peerId)}
              >
                We met
              </button>
            )}
          </div>
        );
      })}

      <Dialog
        open={peerId !== null}
        onOpenChange={(open) => {
          if (!mutation.isPending && !open) setPeerId(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mark that you met?</DialogTitle>
            <DialogDescription>
              The other person will be asked to acknowledge this too. No
              rewards are attached.
            </DialogDescription>
          </DialogHeader>
          {mutation.isError ? (
            <p role="alert" className="t-caption text-danger-500">
              {mutation.error.message}
            </p>
          ) : null}
          <DialogFooter>
            <button
              type="button"
              className="btn btn-secondary btn-md"
              disabled={mutation.isPending}
              onClick={() => setPeerId(null)}
            >
              Not yet
            </button>
            <button
              type="button"
              className="btn btn-accent btn-md"
              disabled={mutation.isPending || !accountId || !peerId}
              onClick={() => {
                if (peerId && accountId) {
                  mutation.mutate({ accountId, peerId });
                }
              }}
            >
              {mutation.isPending ? "Marking…" : `Yes, we met ${selectedName}`}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
