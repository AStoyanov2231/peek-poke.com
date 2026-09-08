import { planCreateRequestSchema, type PlanCreateRequest } from "@peekpoke/shared";

export type PlanComposerDraft = { activity: string; title: string; date: string; time: string; placeText: string; participantLimit: string; visibility: PlanCreateRequest["visibility"]; circleId: string | null; nearbyDiscovery: boolean };

export function planDraftDefaults(): PlanComposerDraft {
  return { activity: "", title: "", date: "", time: "", placeText: "", participantLimit: "6", visibility: "private", circleId: null, nearbyDiscovery: false };
}

export function planRequestFromDraft(draft: PlanComposerDraft, sourceThreadId?: string): PlanCreateRequest {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(draft.time)) throw new Error("Choose a date (YYYY-MM-DD) and a time (HH:MM).");
  const startsAt = new Date(`${draft.date}T${draft.time}:00`);
  const [year, month, day] = draft.date.split("-").map(Number);
  const [hour, minute] = draft.time.split(":").map(Number);
  if (Number.isNaN(startsAt.getTime()) || startsAt.getFullYear() !== year || startsAt.getMonth() + 1 !== month || startsAt.getDate() !== day || startsAt.getHours() !== hour || startsAt.getMinutes() !== minute) throw new Error("That date or local time doesn’t exist. Please choose another.");
  if (startsAt.getTime() <= Date.now()) throw new Error("Choose a time in the future.");
  if (draft.visibility === "circle" && !draft.circleId) throw new Error("Choose a Circle for this Plan.");
  const result = planCreateRequestSchema.safeParse({
    activity: draft.activity.trim(),
    ...(draft.title.trim() ? { title: draft.title.trim() } : {}),
    starts_at: startsAt.toISOString(),
    place_text: draft.placeText.trim(),
    visibility: draft.visibility,
    participant_limit: Number(draft.participantLimit),
    nearby_discovery: draft.visibility === "open" && draft.nearbyDiscovery,
    ...(draft.visibility === "circle" ? { circle_id: draft.circleId ?? undefined } : {}),
    ...(sourceThreadId ? { source_thread_id: sourceThreadId } : {}),
  });
  if (!result.success) throw new Error(result.error.issues[0]?.message ?? "Check the Plan details.");
  return result.data;
}
