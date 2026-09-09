import { beforeEach, describe, expect, it, vi } from "vitest";
import { readDmConversationAccess, requireNewDmInteraction } from "@/lib/dm-conversation-access";

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createServiceClient: () => ({ rpc }) }));
const account = "11111111-1111-4111-8111-111111111111";
const thread = "22222222-2222-4222-8222-222222222222";
const facts = { friendship_accepted: false, latest_poke_accepted_at: "2026-09-08T10:00:00Z", server_now: "2026-09-09T10:00:00Z" };

describe("server-owned conversation access", () => {
  beforeEach(() => { rpc.mockReset(); });
  it("binds the read to the authenticated actor and thread and denies an expired new interaction", async () => {
    rpc.mockResolvedValue({ data: facts, error: null });
    const access = await readDmConversationAccess(thread, account);
    expect(rpc).toHaveBeenCalledWith("read_dm_conversation_facts_v1", { p_actor_id: account, p_thread_id: thread });
    expect(access.data).toMatchObject({ account_id: account, thread_id: thread, basis: "poke" });
    const denial = await requireNewDmInteraction(thread, account);
    expect(denial?.status).toBe(409);
    expect(await denial?.json()).toMatchObject({ code: "POKE_CONVERSATION_EXPIRED" });
  });
  it("allows friendship and valid temporary windows", async () => {
    rpc.mockResolvedValue({ data: { ...facts, friendship_accepted: true }, error: null });
    expect(await requireNewDmInteraction(thread, account)).toBeNull();
    rpc.mockResolvedValue({ data: { ...facts, server_now: "2026-09-09T09:59:59Z" }, error: null });
    expect(await requireNewDmInteraction(thread, account)).toBeNull();
  });
  it("does not turn missing or malformed RPC responses into ongoing access", async () => {
    for (const response of [{ data: null, error: { code: "PGRST202" } }, { data: {}, error: null }, { data: { ...facts, unexpected: true }, error: null }]) {
      rpc.mockResolvedValue(response);
      expect((await requireNewDmInteraction(thread, account))?.status).toBe(503);
    }
  });
  it("keeps nonmember and blocked-thread denials indistinguishable", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "42501" } });
    expect((await requireNewDmInteraction(thread, account))?.status).toBe(404);
  });
});
