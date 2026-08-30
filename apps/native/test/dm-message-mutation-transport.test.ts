import { afterEach, describe, expect, it, vi } from "vitest";
import {
  contractFixtureMessage,
  createDmMessageMutationCoordinator,
} from "@peekpoke/shared";
import { mutatePreparedNativeDmMessage } from "@/data/dm-message-mutations";

const ACCOUNT = "11111111-1111-4111-8111-111111111111";
const THREAD = "22222222-2222-4222-8222-222222222222";
const MESSAGE = "33333333-3333-4333-8333-333333333333";
const KEY = "44444444-4444-4444-8444-444444444444";
const scope = { accountId: ACCOUNT, threadId: THREAD, messageId: MESSAGE };

vi.mock("@/lib/supabase", () => ({
  supabase: { auth: { getSession: vi.fn(async () => ({
    data: { session: { access_token: "native-token" } },
  })) } },
}));
vi.mock("@/lib/env", () => ({ env: { apiBaseUrl: "https://www.peek-poke.com" } }));

afterEach(() => vi.unstubAllGlobals());

describe(`native DM mutation transport (${process.env.NATIVE_TEST_PLATFORM ?? "shared"})`, () => {
  it("retries a lost delete response with the exact same key and no body", async () => {
    const responseMessage = {
      ...contractFixtureMessage,
      id: MESSAGE,
      thread_id: THREAD,
      sender_id: ACCOUNT,
      content: null,
      media_url: null,
      media_thumbnail_url: null,
      is_deleted: true,
    };
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new TypeError("lost response"))
      .mockResolvedValueOnce(new Response(JSON.stringify({ message: responseMessage })));
    vi.stubGlobal("fetch", fetchMock);
    const coordinator = createDmMessageMutationCoordinator(() => KEY);

    await expect(coordinator.run(scope, { kind: "delete" }, mutatePreparedNativeDmMessage))
      .rejects.toThrow("Network unavailable");
    await expect(coordinator.run(scope, { kind: "delete" }, mutatePreparedNativeDmMessage))
      .resolves.toEqual({ message: responseMessage });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    for (const [url, init] of fetchMock.mock.calls) {
      expect(url).toBe(`https://www.peek-poke.com/api/dm/${THREAD}/${MESSAGE}`);
      expect(init?.method).toBe("DELETE");
      expect(init?.body).toBeUndefined();
      expect(new Headers(init?.headers).get("idempotency-key")).toBe(KEY);
      expect(new Headers(init?.headers).get("authorization")).toBe("Bearer native-token");
    }
  });
});
