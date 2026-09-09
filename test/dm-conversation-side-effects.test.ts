import { beforeEach, expect, it, vi } from "vitest";

const account = "11111111-1111-4111-8111-111111111111";
const thread = "22222222-2222-4222-8222-222222222222";
const peer = "33333333-3333-4333-8333-333333333333";
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), broadcast: vi.fn(), suggest: vi.fn() }));
vi.mock("@/lib/auth", () => ({
  withAuth: (handler: (request: Request, context: unknown) => Promise<Response>) => (request: Request) => handler(request, { user: { id: account }, params: { threadId: thread }, supabase: {} }),
  verifyThreadMembership: async () => ({ participant_1_id: account, participant_2_id: peer }),
  verifyThreadParticipant: async () => ({ participant_1_id: account, participant_2_id: peer }),
  isBlocked: async () => false,
  isDeletedProfile: async () => false,
}));
vi.mock("@/lib/rate-limit", () => ({ enforceRateLimit: async () => null }));
vi.mock("@/lib/supabase/server", () => ({ createServiceClient: () => ({ rpc: mocks.rpc }) }));
vi.mock("@/lib/realtime-broadcast", () => ({ broadcastPrivateRealtimeEvent: mocks.broadcast }));
vi.mock("@/features/chat/server/suggestions", () => ({ contextualChatSuggestions: mocks.suggest }));
import { POST as typing } from "@/app/api/dm/[threadId]/typing/route";
import { GET as suggestions } from "@/app/api/dm/[threadId]/suggestions/route";

beforeEach(() => { vi.clearAllMocks(); });
it.each([["typing", typing], ["suggestions", suggestions]] as const)("prevents %s side effects after expiry or an access-service failure", async (_name, handler) => {
  for (const [rpc, status] of [
    [{ data: { friendship_accepted: false, latest_poke_accepted_at: "2026-09-08T10:00:00Z", server_now: "2026-09-09T10:00:00Z" }, error: null }, 409],
    [{ data: null, error: { code: "PGRST202" } }, 503],
  ] as const) {
    mocks.rpc.mockResolvedValue(rpc);
    const response = await handler(new Request("https://app.test/"), {} as never);
    expect(response.status).toBe(status);
    expect(mocks.broadcast).not.toHaveBeenCalled();
    expect(mocks.suggest).not.toHaveBeenCalled();
  }
});
