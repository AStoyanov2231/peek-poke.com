"use client";
import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  CalendarDays,
  MapPin,
  Users,
  Coffee,
  Loader2,
} from "lucide-react";
import type { z } from "zod";
import {
  publicPlanPreviewSchema,
  planJoinResponseSchema,
} from "@peekpoke/shared";
import { fetchContract } from "@/lib/typed-api";
import { BrandMark } from "@/components/ui/BrandMark";
import { LocalDateTime } from "@/components/ui/LocalDateTime";

type Preview = z.infer<typeof publicPlanPreviewSchema>;
export function PublicPlanPage({
  token,
  signedIn,
  preview,
  unavailable = false,
}: {
  token: string;
  signedIn: boolean;
  preview: Preview | null;
  unavailable?: boolean;
}) {
  const router = useRouter();
  const key = useRef<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  async function join() {
    if (!preview || pending) return;
    if (!signedIn) {
      router.push(`/login?redirectTo=${encodeURIComponent(`/plan/${token}`)}`);
      return;
    }
    setPending(true);
    setError("");
    key.current ??= crypto.randomUUID();
    try {
      const result = await fetchContract(
        `/api/plans/${preview.plan.id}/join`,
        planJoinResponseSchema,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "idempotency-key": key.current,
          },
          body: JSON.stringify({ share_token: token }),
        },
      );
      router.push(`/plans/${result.plan.id}`);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Couldn’t join. Please try again.",
      );
      setPending(false);
    }
  }
  return (
    <div className="public-page">
      <header className="public-header">
        <Link href="/" className="wordmark">
          <BrandMark />
          peek & poke<span>.</span>
        </Link>
        {!signedIn && (
          <Link
            href={`/login?redirectTo=${encodeURIComponent(`/plan/${token}`)}`}
            className="text-link"
          >
            Sign in
          </Link>
        )}
      </header>
      <main
        id="main-content"
        className="mx-auto w-full max-w-xl px-6 py-10 sm:py-16"
        tabIndex={-1}
      >
        {preview ? (
          <>
            <p className="eyebrow">
              <span className="active-dot" /> A little invitation. A good plan.
            </p>
            <div className="rounded-[32px] bg-surface p-7 shadow-e-2 sm:p-10">
              <div className="mb-6 flex items-center justify-between">
                <span className="activity-medallion">
                  <Coffee size={25} />
                </span>
                <span className="text-xs font-medium text-ink-6">
                  You’re invited
                </span>
              </div>
              <h1 className="text-4xl font-semibold leading-tight tracking-[-.05em]">
                {preview.plan.title ?? preview.plan.activity}
              </h1>
              {preview.plan.title && (
                <p className="mt-2 text-primary">{preview.plan.activity}</p>
              )}
              <div className="my-7 grid gap-5 border-y border-hairline py-6">
                <p className="flex items-center gap-3 text-sm">
                  <CalendarDays size={20} className="text-primary" />
                  <LocalDateTime value={preview.plan.starts_at} />
                </p>
                <p className="flex items-start gap-3 text-sm">
                  <MapPin size={20} className="shrink-0 text-primary" />
                  <span className="break-words">{preview.plan.place_text}</span>
                </p>
                <p className="flex items-center gap-3 text-sm">
                  <Users size={20} className="text-primary" />
                  {preview.plan.member_count} going ·{" "}
                  {preview.plan.participant_limit} places
                </p>
              </div>
              <p className="mb-6 text-xs leading-relaxed text-ink-6">
                Choose a public place. Let someone you trust know your plans.
                You can decide whether to join.
              </p>
              {error && (
                <p role="alert" className="mb-4 text-sm text-danger-500">
                  {error}
                </p>
              )}
              <button
                type="button"
                className="btn btn-accent btn-lg w-full"
                onClick={() => void join()}
                disabled={!preview.can_join || pending}
              >
                {pending ? (
                  <Loader2 className="animate-spin" size={18} />
                ) : (
                  <ArrowRight size={18} />
                )}{" "}
                {pending
                  ? "Joining…"
                  : preview.can_join
                    ? "Join this plan"
                    : "This plan is no longer taking guests"}
              </button>
              {!signedIn && preview.can_join && (
                <p className="mt-4 text-center text-xs text-ink-6">
                  Create a free account after choosing to join.
                </p>
              )}
            </div>
          </>
        ) : (
          <div className="py-12 text-center">
            <BrandMark className="mx-auto mb-6 h-14 w-14" />
            <h1 className="text-3xl font-semibold tracking-tight">
              {unavailable
                ? "We couldn’t load your invitation."
                : "This invitation isn’t available."}
            </h1>
            <p className="my-5 text-sm leading-relaxed text-ink-6">
              {unavailable
                ? "Your invitation may still be valid. Please try again in a moment."
                : "It may have ended, or the link may have expired. Ask the host for a fresh invitation."}
            </p>
            {unavailable && (
              <button
                type="button"
                className="btn btn-accent btn-lg mb-4 w-full"
                onClick={() => router.refresh()}
              >
                Try again
              </button>
            )}
            <Link
              href={signedIn ? "/now" : "/"}
              className="btn btn-accent btn-lg"
            >
              Find another possibility <ArrowRight size={17} />
            </Link>
          </div>
        )}
        <p className="mt-9 text-center text-xs text-ink-6">
          Good plans start with a little poke.{" "}
          <Link className="underline underline-offset-4" href="/safety">
            Meet with confidence
          </Link>
        </p>
      </main>
    </div>
  );
}
