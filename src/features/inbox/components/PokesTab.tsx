"use client";

import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Clock3, Send } from "lucide-react";
import { differenceInMinutes, formatDistanceToNowStrict } from "date-fns";
import type { PokeInboxItem } from "@peekpoke/shared";
import { activityLabel, respondToPoke } from "@/data/pokes";
import { webQueryKeys } from "@/data/web-query";
import { usePokeInbox } from "@/features/inbox/usePokeInbox";
import { useTransitionRouter } from "@/hooks/useTransitionRouter";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

function expiryLabel(expiresAt: string) {
  const minutes = differenceInMinutes(new Date(expiresAt), new Date());
  return minutes <= 1
    ? "Expires now"
    : `Expires in ${formatDistanceToNowStrict(new Date(expiresAt))}`;
}

function PokeCard({
  poke,
  onRespond,
  pending,
}: {
  poke: PokeInboxItem;
  onRespond: (action: "accept" | "later" | "decline") => void;
  pending: boolean;
}) {
  const label = activityLabel(poke);
  const sender = poke.sender;
  const name = sender?.display_name ?? sender?.username ?? "Someone";
  return (
    <article className="card-flat space-y-3 p-4">
      <div className="flex gap-3">
        <Avatar className="h-10 w-10 shrink-0">
          <AvatarImage src={sender?.avatar_url ?? undefined} alt={name} />
          <AvatarFallback name={name} />
        </Avatar>
        <div className="min-w-0 flex-1">
          <p className="t-body-b text-ink-9">{name} wants to make a plan</p>
          <p className="mt-0.5 t-title-3 text-ink-9">{label}?</p>
          {poke.note ? (
            <p className="mt-1 t-caption text-ink-7">“{poke.note}”</p>
          ) : null}
          <p className="mt-2 flex items-center gap-1 t-caption text-primary-600">
            <Clock3 size={13} aria-hidden="true" />
            {expiryLabel(poke.expiresAt)}
          </p>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <button
          type="button"
          className="btn btn-accent btn-sm"
          disabled={pending}
          onClick={() => onRespond("accept")}
        >
          {pending ? "…" : "I’m in"}
        </button>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          disabled={pending}
          onClick={() => onRespond("later")}
        >
          Later
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          disabled={pending}
          onClick={() => onRespond("decline")}
        >
          Not today
        </button>
      </div>
    </article>
  );
}

export function PokesTab() {
  const router = useTransitionRouter();
  const queryClient = useQueryClient();
  const { pokesQuery, received, sent } = usePokeInbox();
  const [error, setError] = useState<string | null>(null);
  const responseAttemptKeys = useRef(new Map<string, string>());
  const response = useMutation({
    mutationFn: ({
      pokeId,
      action,
    }: {
      pokeId: string;
      action: "accept" | "later" | "decline";
    }) => {
      const attemptId = `${pokeId}:${action}`;
      const key =
        responseAttemptKeys.current.get(attemptId) ?? crypto.randomUUID();
      responseAttemptKeys.current.set(attemptId, key);
      return respondToPoke(pokeId, action, key);
    },
    onSuccess: ({ threadId }, { pokeId, action }) => {
      setError(null);
      responseAttemptKeys.current.delete(`${pokeId}:${action}`);
      void queryClient.invalidateQueries({ queryKey: webQueryKeys.pokes });
      if (action === "accept" && threadId) {
        void queryClient.invalidateQueries({ queryKey: webQueryKeys.threads });
        router.push(`/chat/${threadId}`);
      }
    },
    onError: (reason: Error) => setError(reason.message),
  });
  if (pokesQuery.isLoading)
    return (
      <div className="space-y-3 px-4 py-4">
        {[1, 2].map((item) => (
          <Skeleton key={item} className="h-40 w-full rounded-2xl" />
        ))}
      </div>
    );
  if (pokesQuery.isError)
    return (
      <div className="flex h-48 flex-col items-center justify-center gap-3 px-8 text-center">
        <p className="t-body text-ink-8">Pokes could not be loaded.</p>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={() => void pokesQuery.refetch()}
        >
          Try again
        </button>
      </div>
    );

  return (
    <div className="space-y-5 px-3 py-3">
      <div className="px-1">
        <p className="t-micro">Your next move</p>
        <p className="t-caption muted">
          Pokes are short-lived invitations to do something together.
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
      {received.length ? (
        <section className="space-y-2" aria-label="Received pokes">
          <p className="px-1 t-micro">Waiting on you</p>
          {received.map((poke) => (
            <PokeCard
              key={poke.id}
              poke={poke}
              pending={response.isPending}
              onRespond={(action) =>
                response.mutate({ pokeId: poke.id, action })
              }
            />
          ))}
        </section>
      ) : (
        <section className="card-flat flex flex-col items-start gap-3 p-5">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary-100 text-primary-700">
            <Send size={18} />
          </span>
          <div>
            <p className="t-body-b text-ink-9">No pokes right now</p>
            <p className="mt-1 t-caption muted">
              Set what you&apos;re up for in Now to meet people who want the
              same thing.
            </p>
          </div>
          <button
            type="button"
            className="btn btn-accent btn-sm"
            onClick={() => router.push("/")}
          >
            See who&apos;s up for it
          </button>
        </section>
      )}
      {sent.length ? (
        <section className="space-y-2">
          <p className="px-1 t-micro">Waiting for a reply</p>
          {sent.map((poke) => {
            const recipient = poke.recipient;
            const name =
              recipient?.display_name ?? recipient?.username ?? "Someone";
            return (
              <div
                className="card-flat flex items-center gap-3 p-4"
                key={poke.id}
              >
                <Avatar className="h-10 w-10">
                  <AvatarImage
                    src={recipient?.avatar_url ?? undefined}
                    alt={name}
                  />
                  <AvatarFallback name={name} />
                </Avatar>
                <div>
                  <p className="t-body-b text-ink-9">
                    {activityLabel(poke)} with {name}
                  </p>
                  <p className="t-caption muted">
                    {expiryLabel(poke.expiresAt)}
                  </p>
                </div>
              </div>
            );
          })}
        </section>
      ) : null}
    </div>
  );
}
