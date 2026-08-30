import { afterEach, describe, expect, it, vi } from "vitest";
import {
  contractFixtureMessage,
  createChatMessageAttemptCoordinator,
  messageCreateSchema,
} from "@peekpoke/shared";
import {
  sendChatMessage,
  sendPreparedChatMessage,
  type ChatMessageInput,
} from "@/data/chat-message";

const THREAD_ID = "11111111-1111-4111-8111-111111111111";
const CLIENT_ID = "22222222-2222-4222-8222-222222222222";
const REPLY_ID = "33333333-3333-4333-8333-333333333333";
const UPLOADER_ID = "44444444-4444-4444-8444-444444444444";
const OBJECT_STEM = "1722501296789-550e8400-e29b-41d4-a716-446655440000";
const SUPABASE_ORIGIN = "https://project.supabase.co";
const MEDIA_URL = `${SUPABASE_ORIGIN}/storage/v1/object/sign/media/${UPLOADER_ID}/${OBJECT_STEM}.jpg?token=main-token`;
const THUMBNAIL_URL = `${SUPABASE_ORIGIN}/storage/v1/object/sign/media/${UPLOADER_ID}/${OBJECT_STEM}_thumb.webp?token=thumb-token`;

vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      getSession: vi.fn(async () => ({
        data: { session: { access_token: "native-access-token" } },
      })),
    },
  },
}));

vi.mock("@/lib/env", () => ({
  env: { apiBaseUrl: "https://www.peek-poke.com" },
}));

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("native chat message wire payload", () => {
  it.each<{
    label: string;
    input: ChatMessageInput;
    expected: Record<string, unknown>;
  }>([
    {
      label: "text without reply",
      input: {
        threadId: THREAD_ID,
        clientId: CLIENT_ID,
        content: "  Hello  ",
      },
      expected: {
        client_id: CLIENT_ID,
        content: "Hello",
      },
    },
    {
      label: "image without thumbnail",
      input: {
        threadId: THREAD_ID,
        clientId: CLIENT_ID,
        content: "Photo",
        messageType: "image",
        mediaUrl: MEDIA_URL,
        mediaThumbnailUrl: null,
      },
      expected: {
        client_id: CLIENT_ID,
        content: "Photo",
        message_type: "image",
        media_url: MEDIA_URL,
      },
    },
    {
      label: "image with thumbnail",
      input: {
        threadId: THREAD_ID,
        clientId: CLIENT_ID,
        content: "Photo",
        messageType: "image",
        mediaUrl: MEDIA_URL,
        mediaThumbnailUrl: THUMBNAIL_URL,
      },
      expected: {
        client_id: CLIENT_ID,
        content: "Photo",
        message_type: "image",
        media_url: MEDIA_URL,
        media_thumbnail_url: THUMBNAIL_URL,
      },
    },
    {
      label: "text reply",
      input: {
        threadId: THREAD_ID,
        clientId: CLIENT_ID,
        content: "Reply",
        replyToId: REPLY_ID,
      },
      expected: {
        client_id: CLIENT_ID,
        content: "Reply",
        reply_to_id: REPLY_ID,
      },
    },
  ])("captures route-compatible JSON for $label", async ({ input, expected }) => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      message: contractFixtureMessage,
    })));
    vi.stubGlobal("fetch", fetchMock);

    await expect(sendChatMessage(input)).resolves.toEqual({
      message: contractFixtureMessage,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`https://www.peek-poke.com/api/dm/${THREAD_ID}`);
    const payload = JSON.parse(String(init?.body));
    expect(payload).toEqual(expected);
    expect(messageCreateSchema.safeParse(payload).success).toBe(true);
    expect(payload).not.toHaveProperty("reply_to_id", null);
    expect(payload).not.toHaveProperty("media_thumbnail_url", null);
    expect(new Headers(init?.headers).get("idempotency-key")).toBe(CLIENT_ID);
    expect(new Headers(init?.headers).get("authorization")).toBe("Bearer native-access-token");
  });

  it("retries a lost committed response with the exact same request", async () => {
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new TypeError("response connection lost"))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        message: contractFixtureMessage,
      })));
    vi.stubGlobal("fetch", fetchMock);
    const attempts = createChatMessageAttemptCoordinator(() => CLIENT_ID);
    const draft = { content: "Retried message", replyToId: REPLY_ID };

    await expect(attempts.run(draft, (attempt) =>
      sendPreparedChatMessage(THREAD_ID, attempt),
    )).rejects.toThrow("Network unavailable");
    await expect(attempts.run(draft, (attempt) =>
      sendPreparedChatMessage(THREAD_ID, attempt),
    )).resolves.toEqual({ message: contractFixtureMessage });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const firstInit = fetchMock.mock.calls[0][1];
    const secondInit = fetchMock.mock.calls[1][1];
    expect(secondInit?.body).toBe(firstInit?.body);
    expect(new Headers(secondInit?.headers).get("idempotency-key")).toBe(
      new Headers(firstInit?.headers).get("idempotency-key"),
    );
    expect(new Headers(secondInit?.headers).get("idempotency-key")).toBe(CLIENT_ID);
  });

  it("preserves an exclusive media-claim conflict for native recovery UI", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      version: "v1",
      error: "Message media was already used",
      message: "Message media was already used",
      code: "MESSAGE_MEDIA_ALREADY_CLAIMED",
      request_id: null,
    }), { status: 409 })));

    await expect(sendChatMessage({
      threadId: THREAD_ID,
      clientId: CLIENT_ID,
      content: "Photo",
    })).rejects.toMatchObject({
      status: 409,
      code: "MESSAGE_MEDIA_ALREADY_CLAIMED",
    });
  });
});
