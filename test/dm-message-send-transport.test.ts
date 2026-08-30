import { afterEach, describe, expect, it, vi } from "vitest";
import {
  contractFixtureMessage,
  createChatMessageAttemptCoordinator,
} from "@peekpoke/shared";
import { sendPreparedWebChatMessage } from "@/data/chat-message";

const THREAD_ID = "11111111-1111-4111-8111-111111111111";
const CLIENT_ID = "22222222-2222-4222-8222-222222222222";
const REPLY_ID = "33333333-3333-4333-8333-333333333333";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("web chat message send transport", () => {
  it("retries a lost committed response with the exact same body and header", async () => {
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new TypeError("response connection lost"))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        message: contractFixtureMessage,
      })));
    vi.stubGlobal("fetch", fetchMock);
    const attempts = createChatMessageAttemptCoordinator(() => CLIENT_ID);
    const draft = { content: "Retried web message", replyToId: REPLY_ID };

    await expect(attempts.run(draft, (attempt) =>
      sendPreparedWebChatMessage(THREAD_ID, attempt),
    )).rejects.toThrow("Network unavailable");
    await expect(attempts.run(draft, (attempt) =>
      sendPreparedWebChatMessage(THREAD_ID, attempt),
    )).resolves.toEqual({ message: contractFixtureMessage });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [firstUrl, firstInit] = fetchMock.mock.calls[0];
    const [secondUrl, secondInit] = fetchMock.mock.calls[1];
    expect(firstUrl).toBe(`/api/dm/${THREAD_ID}`);
    expect(secondUrl).toBe(firstUrl);
    expect(secondInit?.body).toBe(firstInit?.body);
    expect(new Headers(secondInit?.headers).get("idempotency-key")).toBe(
      new Headers(firstInit?.headers).get("idempotency-key"),
    );
    expect(new Headers(secondInit?.headers).get("idempotency-key")).toBe(CLIENT_ID);
  });

  it("preserves an exclusive media-claim conflict for web recovery UI", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      version: "v1",
      error: "Message media was already used",
      message: "Message media was already used",
      code: "MESSAGE_MEDIA_ALREADY_CLAIMED",
      request_id: null,
    }), { status: 409 })));

    const attempts = createChatMessageAttemptCoordinator(() => CLIENT_ID);
    await expect(attempts.run({ content: "Photo" }, (attempt) =>
      sendPreparedWebChatMessage(THREAD_ID, attempt),
    )).rejects.toMatchObject({
      status: 409,
      code: "MESSAGE_MEDIA_ALREADY_CLAIMED",
    });
  });
});
