import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  apiFetch: vi.fn(async () => ({})),
  getPermissions: vi.fn(async () => ({ status: "granted" })),
  requestPermissions: vi.fn(async () => ({ status: "granted" })),
  getExpoPushToken: vi.fn(async () => ({ data: "ExpoPushToken[device-token]" })),
  dismissAllNotifications: vi.fn(async () => undefined),
}));

vi.mock("expo-constants", () => ({
  default: { expoConfig: { extra: { eas: { projectId: "project-id" } } } },
}));

vi.mock("expo-device", () => ({ isDevice: true }));

vi.mock("expo-notifications", () => ({
  setNotificationHandler: vi.fn(),
  getPermissionsAsync: mocks.getPermissions,
  requestPermissionsAsync: mocks.requestPermissions,
  getExpoPushTokenAsync: mocks.getExpoPushToken,
  dismissAllNotificationsAsync: mocks.dismissAllNotifications,
  addNotificationResponseReceivedListener: vi.fn(() => ({ remove: vi.fn() })),
}));

vi.mock("react-native", () => ({ Platform: { OS: "ios" } }));
vi.mock("expo-router", () => ({ router: { push: vi.fn() } }));
vi.mock("@/lib/api", () => ({
  apiFetch: mocks.apiFetch,
  jsonBody: JSON.stringify,
}));
vi.mock("@/lib/navigation-policy", () => ({ resolveNotificationRoute: vi.fn() }));

import {
  captureCurrentPushAuth,
  nativePushRegistration,
  registerForPushNotifications,
  unregisterForPushNotifications,
} from "@/lib/push";
import { PUSH_PROVIDER_ACQUISITION_TIMEOUT_MS } from "@/lib/push-registration";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

afterEach(async () => {
  nativePushRegistration.clearAuth();
  await nativePushRegistration.invalidate();
  vi.clearAllMocks();
  mocks.apiFetch.mockResolvedValue({});
});

describe("native push registration transport", () => {
  it("binds the backend mutation to the current attempt token and abort signal", async () => {
    const controller = new AbortController();

    await expect(registerForPushNotifications({
      signal: controller.signal,
      currentAccessToken: async () => "attempt-access-token",
    })).resolves.toBe("ExpoPushToken[device-token]");

    expect(mocks.apiFetch).toHaveBeenCalledWith("/api/profile/push-token", expect.objectContaining({
      method: "POST",
      authToken: "attempt-access-token",
      signal: expect.any(AbortSignal),
    }));
    const options = mocks.apiFetch.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(String(options.body))).toEqual({
      token: "ExpoPushToken[device-token]",
      provider: "expo",
      platform: "ios",
    });
  });

  it("revokes with A credentials when A becomes stale after backend registration", async () => {
    let current = true;
    mocks.apiFetch.mockImplementation(async (_path, options) => {
      if ((options as RequestInit).method === "POST") current = false;
      return {};
    });

    await expect(registerForPushNotifications({
      signal: new AbortController().signal,
      currentAccessToken: async () => current ? "access-a" : null,
    })).resolves.toBeNull();

    expect(mocks.apiFetch.mock.calls).toEqual([
      ["/api/profile/push-token", expect.objectContaining({
        method: "POST",
        authToken: "access-a",
      })],
      ["/api/profile/push-token", expect.objectContaining({
        method: "DELETE",
        authToken: "access-a",
      })],
    ]);
  });

  it("unregisters with the explicitly captured A token and never mutable session auth", async () => {
    nativePushRegistration.observeAuth({
      userId: "user-a",
      sessionIdentity: "session-a",
    }, "access-a");
    const capturedA = captureCurrentPushAuth();

    await expect(unregisterForPushNotifications(capturedA)).resolves.toBeUndefined();

    expect(mocks.apiFetch).toHaveBeenCalledOnce();
    expect(mocks.apiFetch).toHaveBeenCalledWith(
      "/api/profile/push-token",
      expect.objectContaining({
        method: "DELETE",
        authToken: "access-a",
        signal: expect.any(AbortSignal),
      }),
    );
    const options = mocks.apiFetch.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(String(options.body))).toEqual({
      token: "ExpoPushToken[device-token]",
    });
    expect(mocks.dismissAllNotifications).toHaveBeenCalledOnce();
  });

  it("does not delete or dismiss B state when A becomes stale during token lookup", async () => {
    const delayedToken = deferred<{ data: string }>();
    mocks.getExpoPushToken.mockReturnValueOnce(delayedToken.promise);
    nativePushRegistration.observeAuth({
      userId: "user-a",
      sessionIdentity: "session-a",
    }, "access-a");
    const capturedA = captureCurrentPushAuth();

    const cleanup = unregisterForPushNotifications(capturedA);
    await vi.waitFor(() => expect(mocks.getExpoPushToken).toHaveBeenCalledOnce());
    nativePushRegistration.observeAuth({
      userId: "user-b",
      sessionIdentity: "session-b",
    }, "access-b");
    delayedToken.resolve({ data: "ExpoPushToken[device-token]" });
    await cleanup;

    expect(mocks.apiFetch).not.toHaveBeenCalled();
    expect(mocks.dismissAllNotifications).not.toHaveBeenCalled();
  });

  it("times out a hung provider without late backend or notification effects", async () => {
    vi.useFakeTimers();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      const delayedToken = deferred<{ data: string }>();
      mocks.getExpoPushToken.mockReturnValueOnce(delayedToken.promise);
      nativePushRegistration.observeAuth({
        userId: "user-a",
        sessionIdentity: "session-a",
      }, "access-a");

      const cleanup = unregisterForPushNotifications(captureCurrentPushAuth());
      await vi.waitFor(() => expect(mocks.getExpoPushToken).toHaveBeenCalledOnce());
      await vi.advanceTimersByTimeAsync(PUSH_PROVIDER_ACQUISITION_TIMEOUT_MS);
      await cleanup;
      delayedToken.resolve({ data: "ExpoPushToken[late-device-token]" });
      await Promise.resolve();

      expect(mocks.apiFetch).not.toHaveBeenCalled();
      expect(mocks.dismissAllNotifications).not.toHaveBeenCalled();
      expect(warn).toHaveBeenCalledOnce();
    } finally {
      warn.mockRestore();
      vi.useRealTimers();
    }
  });

  it("aborts a hung DELETE at the same deadline without late B or notification effects", async () => {
    vi.useFakeTimers();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      const lateDelete = deferred<Record<string, never>>();
      mocks.apiFetch.mockImplementation(async (_path, options) => {
        const signal = (options as RequestInit).signal;
        return Promise.race([
          lateDelete.promise,
          new Promise<never>((_resolve, reject) => {
            signal?.addEventListener("abort", () => reject(signal.reason), { once: true });
          }),
        ]);
      });
      nativePushRegistration.observeAuth({
        userId: "user-a",
        sessionIdentity: "session-a",
      }, "access-a");

      const cleanup = unregisterForPushNotifications(captureCurrentPushAuth());
      await vi.waitFor(() => expect(mocks.apiFetch).toHaveBeenCalledOnce());
      await vi.advanceTimersByTimeAsync(PUSH_PROVIDER_ACQUISITION_TIMEOUT_MS);
      await cleanup;
      nativePushRegistration.observeAuth({
        userId: "user-b",
        sessionIdentity: "session-b",
      }, "access-b");
      lateDelete.resolve({});
      await Promise.resolve();

      expect(mocks.apiFetch).toHaveBeenCalledWith(
        "/api/profile/push-token",
        expect.objectContaining({
          method: "DELETE",
          authToken: "access-a",
          signal: expect.objectContaining({ aborted: true }),
        }),
      );
      expect(mocks.dismissAllNotifications).not.toHaveBeenCalled();
      expect(warn).toHaveBeenCalledOnce();
    } finally {
      warn.mockRestore();
      vi.useRealTimers();
    }
  });
});
