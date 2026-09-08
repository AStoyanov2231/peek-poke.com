import type { Plan } from "@peekpoke/shared";

/**
 * The API has already applied the viewer's authorization and coarse-area
 * discovery rules. Keep member-only Plans here, rather than re-filtering by
 * visibility on the device.
 */
export function upcomingPlansForNow(
  plans: readonly Plan[],
  now: number,
  limit = 3,
) {
  return plans
    .filter((plan) => plan.status === "active" && Date.parse(plan.starts_at) > now)
    .slice(0, limit);
}
