"use client";

import { CalendarDays, CircleDot, Clock3, UsersRound } from "lucide-react";
import type { Availability, Plan } from "@peekpoke/shared";
import { Card } from "@/components/ui/card";

export type ProfileSocialContextData = {
  availability: Availability | null;
  sharedCircles: Array<{ id: string; name: string }>;
  upcomingPlans: Plan[];
  mutualMeetups: number;
};

function activityLabel(availability: Availability) {
  return availability.activity === "custom" ? availability.customLabel ?? "Something" : availability.activity;
}

export function ProfileSocialContext({ context, onOpenPlan }: {
  context: ProfileSocialContextData;
  onOpenPlan: (planId: string) => void;
}) {
  return (
    <section className="flex flex-col gap-4" aria-label="Social context">
      {context.availability ? (
        <Card className="rounded-md border-primary/20 bg-primary/[0.06] p-4">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-full bg-primary text-sm text-white">Now</span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-foreground">Up for {activityLabel(context.availability)}</p>
              <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground"><Clock3 className="h-3.5 w-3.5" />Ends {new Date(context.availability.expiresAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</p>
            </div>
          </div>
        </Card>
      ) : null}

      {(context.sharedCircles.length > 0 || context.mutualMeetups > 0) ? (
        <Card className="rounded-md p-4">
          <h2 className="text-[16px] font-semibold text-foreground">Your context</h2>
          {context.sharedCircles.length > 0 ? <p className="mt-3 flex items-center gap-2 text-sm text-muted-foreground"><CircleDot className="h-4 w-4" />{context.sharedCircles.length} shared circle{context.sharedCircles.length === 1 ? "" : "s"}</p> : null}
          {context.mutualMeetups > 0 ? <p className="mt-3 flex items-start gap-2 text-sm text-muted-foreground"><UsersRound className="mt-0.5 h-4 w-4 shrink-0" />You both marked {context.mutualMeetups} meetup{context.mutualMeetups === 1 ? "" : "s"}.</p> : null}
        </Card>
      ) : null}

      {context.upcomingPlans.length > 0 ? <Card className="rounded-md p-4"><h2 className="text-[16px] font-semibold text-foreground">Upcoming plans</h2><div className="mt-3 grid gap-2">{context.upcomingPlans.map((plan) => <button key={plan.id} type="button" onClick={() => onOpenPlan(plan.id)} className="flex items-center gap-3 rounded-sm border border-hairline p-3 text-left hover:bg-ink-1"><CalendarDays className="h-4 w-4 shrink-0 text-primary" /><span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-foreground">{plan.title ?? plan.activity}</span><span className="block truncate text-xs text-muted-foreground">{plan.place_text} · {new Date(plan.starts_at).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</span></span></button>)}</div></Card> : null}
    </section>
  );
}
