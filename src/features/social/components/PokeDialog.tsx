"use client";

import { useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Loader2, Send } from "lucide-react";
import {
  pokeCreateResponseSchema,
  type Activity,
  type ProfileCard,
} from "@peekpoke/shared";
import { fetchContract } from "@/lib/typed-api";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const activities: Array<{ value: Activity; label: string }> = [
  { value: "coffee", label: "Coffee" },
  { value: "food", label: "Food" },
  { value: "walk", label: "Walk" },
  { value: "gym", label: "Gym" },
  { value: "study", label: "Study" },
  { value: "drinks", label: "Drinks" },
  { value: "gaming", label: "Gaming" },
  { value: "explore", label: "Explore" },
  { value: "anything", label: "Anything" },
  { value: "custom", label: "Something else" },
];

type PokeRecipient = Pick<ProfileCard, "id" | "username" | "display_name">;

export function PokeDialog({
  recipient,
  defaultActivity = "anything",
  defaultCustomLabel = null,
  onClose,
  onSent,
}: {
  recipient: PokeRecipient;
  defaultActivity?: Activity;
  defaultCustomLabel?: string | null;
  onClose: () => void;
  onSent: () => void;
}) {
  const [activity, setActivity] = useState<Activity>(defaultActivity);
  const [customLabel, setCustomLabel] = useState(defaultCustomLabel ?? "");
  const [note, setNote] = useState("");
  const attempt = useRef<{ key: string; body: string } | null>(null);
  const name = recipient.display_name ?? recipient.username;
  const mutation = useMutation({
    mutationFn: async () => {
      const body = JSON.stringify({
        recipientId: recipient.id,
        activity,
        customLabel: activity === "custom" ? customLabel.trim() : null,
        ...(note.trim() ? { note: note.trim() } : {}),
      });
      if (!attempt.current || attempt.current.body !== body)
        attempt.current = { key: crypto.randomUUID(), body };
      return fetchContract("/api/pokes", pokeCreateResponseSchema, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": attempt.current.key,
        },
        body: attempt.current.body,
      });
    },
    onSuccess: onSent,
  });
  const label =
    activity === "custom"
      ? customLabel.trim() || "something"
      : (activities
          .find((item) => item.value === activity)
          ?.label.toLowerCase() ?? "something");
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !mutation.isPending) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Poke {name}?</DialogTitle>
          <DialogDescription>
            A short invitation to do something together. They can accept, say
            later, or pass.
          </DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            mutation.mutate();
          }}
        >
          <label className="grid gap-1.5 text-sm font-medium">
            What are you up for?
            <select
              className="input"
              value={activity}
              disabled={mutation.isPending}
              onChange={(event) => setActivity(event.target.value as Activity)}
            >
              {activities.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          {activity === "custom" ? (
            <label className="grid gap-1.5 text-sm font-medium">
              Your activity
              <input
                className="input"
                maxLength={48}
                required
                value={customLabel}
                placeholder="e.g. A gallery visit"
                disabled={mutation.isPending}
                onChange={(event) => setCustomLabel(event.target.value)}
              />
            </label>
          ) : null}
          <label className="grid gap-1.5 text-sm font-medium">
            Add a note{" "}
            <span className="text-xs font-normal text-ink-6">Optional</span>
            <textarea
              className="input min-h-24 resize-y"
              maxLength={280}
              value={note}
              placeholder={`Want to ${label}?`}
              disabled={mutation.isPending}
              onChange={(event) => setNote(event.target.value)}
            />
          </label>
          <p className="text-xs leading-relaxed text-ink-6">
            Pokes expire automatically. If you meet, choose a public place.
          </p>
          {mutation.isError ? (
            <p role="alert" className="text-sm text-danger-500">
              {mutation.error.message}
            </p>
          ) : null}
          <button
            type="submit"
            className="btn btn-accent btn-lg"
            disabled={
              mutation.isPending ||
              (activity === "custom" && !customLabel.trim())
            }
          >
            {mutation.isPending ? (
              <Loader2 size={17} className="animate-spin" />
            ) : (
              <Send size={17} />
            )}
            {mutation.isPending ? "Sending your poke…" : "Send a poke"}
          </button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
