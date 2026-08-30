import { describe, expect, it, vi } from "vitest";
import { createRealtimeAuthSynchronizer } from "@/lib/realtime-auth";

const session = (userId: string, accessToken: string) => ({
  user: { id: userId },
  access_token: accessToken,
});

describe("native Realtime auth synchronization", () => {
  it("applies a refreshed current access token exactly once", async () => {
    const applyToken = vi.fn(async () => undefined);
    const auth = createRealtimeAuthSynchronizer(applyToken);

    await auth.session(session("user-a", "token-old"));
    await Promise.all([
      auth.session(session("user-a", "token-current")),
      auth.session(session("user-a", "token-current")),
      auth.session(session("user-a", "token-current")),
    ]);

    expect(applyToken.mock.calls).toEqual([
      ["token-old"],
      ["token-current"],
    ]);
  });

  it("serializes a refresh behind an in-flight old token so the current token wins", async () => {
    let releaseOld: (() => void) | undefined;
    const applyToken = vi.fn((token?: string) => token === "token-old"
      ? new Promise<void>((resolve) => {
          releaseOld = resolve;
        })
      : Promise.resolve());
    const auth = createRealtimeAuthSynchronizer(applyToken);

    const oldSync = auth.session(session("user-a", "token-old"));
    const currentSync = auth.session(session("user-a", "token-current"));
    expect(applyToken).toHaveBeenCalledTimes(1);
    releaseOld?.();
    await Promise.all([oldSync, currentSync]);

    expect(applyToken.mock.calls).toEqual([
      ["token-old"],
      ["token-current"],
    ]);
  });

  it("clears auth once on sign-out and applies a different user's token afterward", async () => {
    const applyToken = vi.fn(async () => undefined);
    const auth = createRealtimeAuthSynchronizer(applyToken);

    await auth.session(session("user-a", "shared-looking-token"));
    await Promise.all([auth.anonymous(), auth.anonymous()]);
    await auth.session(session("user-b", "shared-looking-token"));

    expect(applyToken.mock.calls).toEqual([
      ["shared-looking-token"],
      [undefined],
      ["shared-looking-token"],
    ]);
  });
});
