import type { Plan } from "./plans";

/** A reviewable text summary, without creating or disclosing a join capability. */
export function planShareDetails(
  plan: Pick<Plan, "title" | "activity" | "starts_at" | "place_text" | "member_count">,
  options: { locale?: string; timeZone?: string } = {},
) {
  const when = new Intl.DateTimeFormat(options.locale, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
    ...(options.timeZone ? { timeZone: options.timeZone } : {}),
  }).format(new Date(plan.starts_at));
  return [
    plan.title ?? plan.activity,
    when,
    `Place: ${plan.place_text}`,
    `${plan.member_count} ${plan.member_count === 1 ? "person" : "people"} going`,
    "",
    "My plan details from Peek & Poke.",
  ].join("\n");
}
