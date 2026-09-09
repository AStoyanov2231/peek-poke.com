import { z } from "zod";
import { utcTimestampSchema } from "./contract";

export const TEMPORARY_POKE_CONVERSATION_MS = 24 * 60 * 60 * 1000;

export const dmConversationAccessSchema = z.strictObject({
  version: z.literal("v1"),
  thread_id: z.uuid(),
  account_id: z.uuid(),
  basis: z.enum(["legacy", "friendship", "poke"]),
  expires_at: utcTimestampSchema.nullable(),
  server_now: utcTimestampSchema,
}).superRefine((value, context) => {
  if ((value.basis === "poke") !== (value.expires_at !== null)) {
    context.addIssue({ code: "custom", path: ["expires_at"], message: "Only Poke conversations have an expiry" });
  }
});

export type DmConversationAccess = z.infer<typeof dmConversationAccessSchema>;

export function dmConversationAccessSchemaFor(threadId: string, accountId: string) {
  return dmConversationAccessSchema.refine(
    (value) => value.thread_id === threadId && value.account_id === accountId,
    "Conversation access does not match the requested account and thread",
  );
}

/** Presentation only. Every new interaction still requires server authorization. */
export function conversationWindowRemainingMs(access: DmConversationAccess, elapsedSinceReceiptMs: number) {
  if (access.expires_at === null) return null;
  if (!Number.isFinite(elapsedSinceReceiptMs) || elapsedSinceReceiptMs < 0) return 0;
  return Math.max(0, Date.parse(access.expires_at) - Date.parse(access.server_now) - elapsedSinceReceiptMs);
}

/** Converts server-owned relationship facts to the versioned access response. */
export function conversationAccessFromFacts(facts: {
  threadId: string;
  accountId: string;
  friendshipAccepted: boolean;
  latestPokeAcceptedAt: string | null;
  serverNow: string;
}): DmConversationAccess {
  const acceptedAt = facts.latestPokeAcceptedAt === null ? null : utcTimestampSchema.parse(facts.latestPokeAcceptedAt);
  const basis = facts.friendshipAccepted ? "friendship" : acceptedAt === null ? "legacy" : "poke";
  return dmConversationAccessSchema.parse({
    version: "v1",
    thread_id: facts.threadId,
    account_id: facts.accountId,
    basis,
    expires_at: basis === "poke" ? new Date(Date.parse(acceptedAt!) + TEMPORARY_POKE_CONVERSATION_MS).toISOString() : null,
    server_now: facts.serverNow,
  });
}
