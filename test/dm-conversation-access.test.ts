import { describe, expect, it } from "vitest";
import { conversationAccessFromFacts, conversationWindowRemainingMs, dmConversationAccessSchemaFor } from "@peekpoke/shared";

const accountId = "11111111-1111-4111-8111-111111111111";
const threadId = "22222222-2222-4222-8222-222222222222";
const accepted = "2026-09-08T10:00:00.000Z";
const facts = { accountId, threadId, friendshipAccepted: false, latestPokeAcceptedAt: accepted, serverNow: "2026-09-09T09:59:59.000Z" };

describe("temporary Poke conversation access", () => {
  it("expires precisely 24 hours after acceptance using server-relative elapsed time", () => {
    const access = conversationAccessFromFacts(facts);
    expect(access.expires_at).toBe("2026-09-09T10:00:00.000Z");
    expect(conversationWindowRemainingMs(access, 999)).toBe(1);
    expect(conversationWindowRemainingMs(access, 1000)).toBe(0);
    expect(conversationWindowRemainingMs(access, 60_000)).toBe(0);
  });
  it("renews only when a new accepted-Poke timestamp is supplied", () => {
    const expired = conversationAccessFromFacts({ ...facts, serverNow: "2026-09-10T00:00:00.000Z" });
    expect(conversationWindowRemainingMs(expired, 0)).toBe(0);
    const renewed = conversationAccessFromFacts({ ...facts, serverNow: "2026-09-10T00:00:00.000Z", latestPokeAcceptedAt: "2026-09-09T23:00:00.000Z" });
    expect(conversationWindowRemainingMs(renewed, 0)).toBe(23 * 60 * 60 * 1000);
  });
  it("keeps accepted friendship ongoing and restores the Poke window after removal", () => {
    expect(conversationAccessFromFacts({ ...facts, friendshipAccepted: true }).basis).toBe("friendship");
    expect(conversationWindowRemainingMs(conversationAccessFromFacts({ ...facts, friendshipAccepted: true }), 0)).toBeNull();
    expect(conversationAccessFromFacts(facts).basis).toBe("poke");
  });
  it("preserves legacy conversations without an accepted Poke", () => {
    const access = conversationAccessFromFacts({ ...facts, latestPokeAcceptedAt: null });
    expect(access.basis).toBe("legacy");
    expect(conversationWindowRemainingMs(access, 0)).toBeNull();
  });
  it("rejects mismatched identities and inconsistent expiration contracts", () => {
    const schema = dmConversationAccessSchemaFor(threadId, accountId);
    const access = conversationAccessFromFacts(facts);
    for (const payload of [
      { ...access, account_id: threadId },
      { ...access, thread_id: accountId },
      { ...access, expires_at: null },
      { ...access, basis: "legacy" },
      { ...access, server_now: "invalid" },
      { ...access, privileged: true },
    ]) expect(schema.safeParse(payload).success).toBe(false);
  });
  it("never extends a temporary window on an invalid elapsed-time measurement", () => {
    const access = conversationAccessFromFacts(facts);
    for (const elapsed of [-1, NaN, Infinity]) expect(conversationWindowRemainingMs(access, elapsed)).toBe(0);
  });
});
