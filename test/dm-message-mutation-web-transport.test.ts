import { afterEach, describe, expect, it, vi } from "vitest";
import {
  contractFixtureMessage,
  createDmMessageMutationCoordinator,
} from "@peekpoke/shared";
import { mutatePreparedWebDmMessage } from "@/data/dm-message-mutations";

const ACCOUNT = "11111111-1111-4111-8111-111111111111";
const THREAD = "22222222-2222-4222-8222-222222222222";
const MESSAGE = "33333333-3333-4333-8333-333333333333";
const KEY = "44444444-4444-4444-8444-444444444444";
const scope = { accountId: ACCOUNT, threadId: THREAD, messageId: MESSAGE };

afterEach(() => vi.unstubAllGlobals());

describe("web DM message mutation transport", () => {
  it.each([
    ["edit", { kind: "edit" as const, content: "  changed  " }, "PATCH", { content: "changed" }],
    ["delete", { kind: "delete" as const }, "DELETE", undefined],
  ])("sends a strict %s request with its retained key", async (_label, mutation, method, body) => {
    const responseMessage = {
      ...contractFixtureMessage,
      id: MESSAGE,
      thread_id: THREAD,
      sender_id: ACCOUNT,
      content: mutation.kind === "edit" ? "changed" : null,
      is_edited: mutation.kind === "edit",
      is_deleted: mutation.kind === "delete",
      media_url: null,
      media_thumbnail_url: null,
    };
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ message: responseMessage })));
    vi.stubGlobal("fetch", fetchMock);
    const coordinator = createDmMessageMutationCoordinator(() => KEY);
    const attempt = coordinator.prepare(scope, mutation);

    await expect(mutatePreparedWebDmMessage(attempt)).resolves.toEqual({ message: responseMessage });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`/api/dm/${THREAD}/${MESSAGE}`);
    expect(init?.method).toBe(method);
    expect(new Headers(init?.headers).get("idempotency-key")).toBe(KEY);
    expect(init?.body === undefined ? undefined : JSON.parse(String(init.body))).toEqual(body);
  });
});
