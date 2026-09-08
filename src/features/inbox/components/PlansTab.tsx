"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CalendarClock, MapPin, Plus, Users } from "lucide-react";
import { format } from "date-fns";
import { plansQueryOptions } from "@/data/web-query";
import { PlanComposerDialog } from "@/features/plans/components/PlanComposerDialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useTransitionRouter } from "@/hooks/useTransitionRouter";
import { splitPlanFeed } from "@/data/plan-feed";

export function PlansTab() {
  const router = useTransitionRouter();
  const plansQuery = useQuery(plansQueryOptions);
  const [composerOpen, setComposerOpen] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  const { upcoming, recent } = useMemo(
    () => splitPlanFeed(plansQuery.data?.plans ?? [], now),
    [now, plansQuery.data?.plans],
  );

  if (plansQuery.isLoading) {
    return (
      <div className="space-y-3 px-4 py-4">
        {[1, 2].map((item) => (
          <Skeleton key={item} className="h-32 w-full rounded-2xl" />
        ))}
      </div>
    );
  }

  if (plansQuery.isError) {
    return (
      <div className="flex h-48 flex-col items-center justify-center gap-3 px-8 text-center">
        <p className="t-body text-ink-8">Plans could not be loaded.</p>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={() => void plansQuery.refetch()}
        >
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3 px-3 py-3">
      <div className="flex items-center justify-between px-1">
        <div>
          <p className="t-micro">What&apos;s happening</p>
          <p className="t-caption muted">
            Plans turn a chat into a time and place.
          </p>
        </div>
        <button
          type="button"
          className="iconbtn iconbtn-sm"
          onClick={() => setComposerOpen(true)}
          aria-label="Create a plan"
        >
          <Plus size={16} />
        </button>
      </div>
      {upcoming.length === 0 && recent.length === 0 ? (
        <div className="card-flat flex flex-col items-start gap-3 p-5">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary-100 text-primary-700">
            <CalendarClock size={19} />
          </span>
          <div>
            <p className="t-body-b text-ink-9">Nothing planned yet</p>
            <p className="mt-1 t-caption muted">
              Make a lightweight plan so people know when and where to join.
            </p>
          </div>
          <button
            type="button"
            className="btn btn-accent btn-sm"
            onClick={() => setComposerOpen(true)}
          >
            Create a plan
          </button>
        </div>
      ) : null}
      {upcoming.length > 0 ? (
        <PlanList plans={upcoming} onOpen={(planId) => router.push(`/plans/${planId}`)} />
      ) : null}
      {recent.length > 0 ? (
        <section className="space-y-2 pt-2" aria-labelledby="recent-plans-title">
          <div className="px-1">
            <p id="recent-plans-title" className="t-body-b text-ink-9">
              Recent plans
            </p>
            <p className="t-caption muted">
              Did you meet? Open a plan to confirm together.
            </p>
          </div>
          <PlanList plans={recent} onOpen={(planId) => router.push(`/plans/${planId}`)} recent />
        </section>
      ) : null}
      <PlanComposerDialog open={composerOpen} onOpenChange={setComposerOpen} />
    </div>
  );
}

function PlanList({
  plans,
  onOpen,
  recent = false,
}: {
  plans: ReturnType<typeof splitPlanFeed>["upcoming"];
  onOpen: (planId: string) => void;
  recent?: boolean;
}) {
  return plans.map((plan) => (
    <button
      type="button"
      className="card-flat w-full space-y-3 p-4 text-left transition-colors hover:bg-ink-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      key={plan.id}
      onClick={() => onOpen(plan.id)}
      aria-label={`${recent ? "Open recent plan" : "Open plan"}: ${plan.title ?? plan.activity}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="t-body-b truncate text-ink-9">
            {plan.title ?? plan.activity}
          </p>
          {plan.title ? (
            <p className="t-caption text-primary-600">{plan.activity}</p>
          ) : null}
        </div>
        <span className="shrink-0 rounded-pill bg-primary-100 px-2 py-1 t-caption text-primary-700">
          {plan.visibility === "open"
            ? "Open"
            : plan.visibility === "friends"
              ? "Friends"
              : plan.visibility === "circle"
                ? "Circle"
                : "Private"}
        </span>
      </div>
      <div className="grid gap-1.5 t-caption text-ink-7">
        <p className="flex items-center gap-2">
          <CalendarClock size={14} aria-hidden="true" />
          {format(new Date(plan.starts_at), "EEE, MMM d · p")}
        </p>
        <p className="flex items-center gap-2">
          <MapPin size={14} aria-hidden="true" />
          {plan.place_text}
        </p>
        <p className="flex items-center gap-2">
          <Users size={14} aria-hidden="true" />
          {plan.member_count} going · up to {plan.participant_limit}
        </p>
      </div>
    </button>
  ));
}
