import type { Plan } from "@peekpoke/shared/plans";

const RECENT_PLAN_WINDOW_MS = 48 * 60 * 60 * 1_000;

export function splitPlanFeed(plans: Plan[], now: number) {
  const upcoming = plans
    .filter(
      (plan) =>
        plan.status === "active" && new Date(plan.starts_at).getTime() > now,
    )
    .sort((left, right) => left.starts_at.localeCompare(right.starts_at));
  const recent = plans
    .filter((plan) => {
      const startsAt = new Date(plan.starts_at).getTime();
      return (
        plan.status === "active" &&
        plan.viewer_is_member &&
        startsAt <= now &&
        startsAt >= now - RECENT_PLAN_WINDOW_MS
      );
    })
    .sort((left, right) => right.starts_at.localeCompare(left.starts_at));

  return { upcoming, recent };
}
