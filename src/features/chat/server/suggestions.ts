import { z } from "zod";
import { chatSuggestionsResponseSchema } from "@peekpoke/shared/chat-suggestions";
import { createServiceClient } from "@/lib/supabase/server";

const messagesSchema = z.array(z.strictObject({ content: z.string().nullable(), sender_id: z.string().uuid() })).max(10);
const availabilitySchema = z.strictObject({ user_id: z.string().uuid(), activity: z.string(), expires_at: z.string() });

export type SuggestionContext = {
  actorId: string; peerId: string; acceptedPoke: { activity: string; customLabel: string | null } | null;
  actorAvailability: { activity: string; expiresAt: string } | null; peerAvailability: { activity: string; expiresAt: string } | null;
  sharedInterestNames: string[]; recentMessages: Array<{ content: string | null; senderId: string }>; sharedPlanCount: number;
};
export interface SuggestionProvider { suggest(context: SuggestionContext): Promise<unknown>; }

/** Deterministic baseline uses only server-verified structured facts. The last
 * ten messages remain untrusted opaque context and are never instructions. */
export class DeterministicContextualSuggestionProvider implements SuggestionProvider {
  async suggest(context: SuggestionContext) {
    const activity = context.acceptedPoke?.customLabel ?? context.acceptedPoke?.activity;
    const sharedAvailabilityActivity = context.actorAvailability && context.peerAvailability && context.actorAvailability.activity === context.peerAvailability.activity
      ? context.actorAvailability.activity
      : null;
    const sharedInterest = context.sharedInterestNames[0];
    return { source: "deterministic", suggestions: activity ? [
      { id: "time", text: "What time works for you?" },
      { id: "place", text: `Want to pick a public spot for ${activity}?` },
      { id: "plan", text: `Turn this ${activity} Poke into a plan?` },
    ] : sharedAvailabilityActivity ? [
      { id: "time", text: `You are both available for ${sharedAvailabilityActivity}. What time works?` },
      { id: "place", text: "Want to choose a general area?" },
      { id: "plan", text: `Turn your shared ${sharedAvailabilityActivity} availability into a plan?` },
    ] : sharedInterest ? [
      { id: "time", text: `When would you like to do something around ${sharedInterest}?` },
      { id: "place", text: "Want to choose a general area?" },
      { id: "plan", text: `Make a plan around ${sharedInterest}?` },
    ] : [
      { id: "time", text: "Would 20 minutes work for you?" },
      { id: "place", text: "Want to choose a general area?" },
      { id: "plan", text: context.sharedPlanCount ? "Want to make another plan?" : "Want to turn this into a plan?" },
    ] };
  }
}

export async function authorizedSuggestionContext(threadId: string, actorId: string, peerId: string): Promise<SuggestionContext> {
  const db = createServiceClient();
  const [messages, poke, availability, interests, members, peerVisible] = await Promise.all([
    db.from("dm_messages").select("content,sender_id").eq("thread_id", threadId).eq("is_deleted", false).order("sequence", { ascending: false }).limit(10),
    db.from("pokes").select("activity,custom_label").eq("status", "accepted").or(`and(sender_id.eq.${actorId},recipient_id.eq.${peerId}),and(sender_id.eq.${peerId},recipient_id.eq.${actorId})`).order("responded_at", { ascending: false }).limit(1).maybeSingle(),
    db.from("user_availabilities").select("user_id,activity,expires_at").in("user_id", [actorId, peerId]).gt("expires_at", new Date().toISOString()).limit(2),
    db.from("profile_interests").select("user_id,tag_id,interest_tags(name)").in("user_id", [actorId, peerId]).limit(40),
    db.from("plan_members").select("plan_id,user_id").in("user_id", [actorId, peerId]).limit(100),
    db.rpc("discovery_subject_visible_to_viewer", { p_viewer_id: actorId, p_subject_id: peerId }),
  ]);
  if (messages.error || poke.error || availability.error || interests.error || members.error || peerVisible.error) throw messages.error ?? poke.error ?? availability.error ?? interests.error ?? members.error ?? peerVisible.error;
  const tagUsers = new Map<string, Set<string>>();
  for (const row of (interests.data ?? []) as Array<{ user_id: string; interest_tags: { name?: unknown } | Array<{ name?: unknown }> | null }>) {
    const tag = Array.isArray(row.interest_tags) ? row.interest_tags[0]?.name : row.interest_tags?.name;
    if (typeof tag === "string") (tagUsers.get(tag) ?? tagUsers.set(tag, new Set()).get(tag)!).add(row.user_id);
  }
  const planUsers = new Map<string, Set<string>>();
  for (const row of members.data ?? []) (planUsers.get(row.plan_id) ?? planUsers.set(row.plan_id, new Set()).get(row.plan_id)!).add(row.user_id);
  const rows = z.array(availabilitySchema).parse(availability.data ?? []);
  const accepted = poke.data && typeof poke.data.activity === "string" ? { activity: poke.data.activity, customLabel: typeof poke.data.custom_label === "string" ? poke.data.custom_label : null } : null;
  const toAvailability = (id: string) => { const row = rows.find((item) => item.user_id === id); return row ? { activity: row.activity, expiresAt: row.expires_at } : null; };
  const canUseSharedFacts = peerVisible.data === true;
  return { actorId, peerId, acceptedPoke: accepted, actorAvailability: canUseSharedFacts ? toAvailability(actorId) : null, peerAvailability: canUseSharedFacts ? toAvailability(peerId) : null, sharedInterestNames: canUseSharedFacts ? [...tagUsers].filter(([, users]) => users.has(actorId) && users.has(peerId)).map(([tag]) => tag).slice(0, 10) : [], recentMessages: messagesSchema.parse(messages.data ?? []).map((row) => ({ content: row.content, senderId: row.sender_id })), sharedPlanCount: [...planUsers.values()].filter((users) => users.has(actorId) && users.has(peerId)).length };
}

export async function contextualChatSuggestions(threadId: string, actorId: string, peerId: string, provider: SuggestionProvider = new DeterministicContextualSuggestionProvider()) {
  return chatSuggestionsResponseSchema.parse(await provider.suggest(await authorizedSuggestionContext(threadId, actorId, peerId)));
}
