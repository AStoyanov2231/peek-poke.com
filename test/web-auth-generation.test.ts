import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type AuthSession = {
  access_token: string;
  user: { id: string };
};

type AuthCallback = (
  event: string,
  session: AuthSession | null,
) => Promise<void>;

const mocks = vi.hoisted(() => ({
  authCallback: null as AuthCallback | null,
  clearStore: vi.fn(),
  fetchContract: vi.fn(),
  getSession: vi.fn(),
  observeMeetingAuthOwner: vi.fn(),
  onAuthStateChange: vi.fn(),
  resetFriendMutationAttempts: vi.fn(),
  setAuth: vi.fn(),
  unsubscribe: vi.fn(),
}));

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: {
      getSession: mocks.getSession,
      onAuthStateChange: mocks.onAuthStateChange,
    },
    realtime: { setAuth: mocks.setAuth },
  }),
}));

vi.mock("@/lib/typed-api", () => ({
  fetchContract: mocks.fetchContract,
}));

vi.mock("@/stores/appStore", () => ({
  useAppStore: {
    getState: () => ({
      clearStore: mocks.clearStore,
    }),
  },
}));

vi.mock("@/data/friend-mutations", () => ({
  resetFriendMutationAttempts: mocks.resetFriendMutationAttempts,
}));

vi.mock("@/data/web-query", () => ({
  observeMeetingAuthOwner: mocks.observeMeetingAuthOwner,
}));

import { useAuth } from "@/features/auth/useAuth";

const ACCOUNT_A = "11111111-1111-4111-8111-111111111111";
const ACCOUNT_B = "22222222-2222-4222-8222-222222222222";
const ACCOUNT_C = "33333333-3333-4333-8333-333333333333";

let renderer: ReactTestRenderer | null = null;

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function session(userId: string, accessToken: string): AuthSession {
  return { access_token: accessToken, user: { id: userId } };
}

function AuthHarness() {
  const auth = useAuth();
  return createElement("auth-state", {
    loading: auth.loading,
    profileId: auth.profile?.id ?? null,
    userId: auth.user?.id ?? null,
  });
}

function authState() {
  if (!renderer) throw new Error("Auth harness is not mounted");
  return renderer.root.findByType("auth-state").props as {
    loading: boolean;
    profileId: string | null;
    userId: string | null;
  };
}

async function mountAuth() {
  await act(async () => {
    renderer = create(createElement(AuthHarness));
    await Promise.resolve();
  });
}

async function flushAuth() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

function emitAuth(sessionValue: AuthSession | null) {
  if (!mocks.authCallback) throw new Error("Auth callback was not registered");
  return mocks.authCallback(sessionValue ? "SIGNED_IN" : "SIGNED_OUT", sessionValue);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.authCallback = null;
  mocks.fetchContract.mockResolvedValue({ profile: { id: "profile" } });
  mocks.setAuth.mockResolvedValue(undefined);
  mocks.onAuthStateChange.mockImplementation((callback: AuthCallback) => {
    mocks.authCallback = callback;
    return { data: { subscription: { unsubscribe: mocks.unsubscribe } } };
  });
});

afterEach(async () => {
  if (renderer) {
    await act(async () => renderer?.unmount());
    renderer = null;
  }
});

describe("web auth generation fence", () => {
  it("honors an auth event delivered synchronously during subscription setup", async () => {
    mocks.getSession.mockResolvedValue({
      data: { session: session(ACCOUNT_A, "token-a") },
    });
    mocks.onAuthStateChange.mockImplementation((callback: AuthCallback) => {
      mocks.authCallback = callback;
      void callback("SIGNED_IN", session(ACCOUNT_B, "token-b"));
      return { data: { subscription: { unsubscribe: mocks.unsubscribe } } };
    });

    await mountAuth();
    await flushAuth();

    expect(mocks.observeMeetingAuthOwner).toHaveBeenCalledTimes(1);
    expect(mocks.observeMeetingAuthOwner).toHaveBeenCalledWith(ACCOUNT_B);
    expect(mocks.setAuth).toHaveBeenCalledTimes(1);
    expect(mocks.fetchContract).toHaveBeenCalledTimes(1);
    expect(authState().userId).toBe(ACCOUNT_B);
  });

  it("subscribes first and ignores a late A initializer after a B callback", async () => {
    const initialSession = deferred<{ data: { session: AuthSession | null } }>();
    mocks.getSession.mockReturnValue(initialSession.promise);
    await mountAuth();

    expect(mocks.onAuthStateChange.mock.invocationCallOrder[0])
      .toBeLessThan(mocks.getSession.mock.invocationCallOrder[0]);

    await act(async () => emitAuth(session(ACCOUNT_B, "token-b")));
    initialSession.resolve({ data: { session: session(ACCOUNT_A, "token-a") } });
    await flushAuth();

    expect(mocks.observeMeetingAuthOwner).toHaveBeenCalledTimes(1);
    expect(mocks.observeMeetingAuthOwner).toHaveBeenCalledWith(ACCOUNT_B);
    expect(mocks.setAuth).toHaveBeenCalledTimes(1);
    expect(mocks.setAuth).toHaveBeenCalledWith("token-b");
    expect(mocks.fetchContract).toHaveBeenCalledTimes(1);
    expect(authState().userId).toBe(ACCOUNT_B);
    expect(authState().loading).toBe(false);
  });

  it("does not let a late A initializer undo a null callback", async () => {
    const initialSession = deferred<{ data: { session: AuthSession | null } }>();
    mocks.getSession.mockReturnValue(initialSession.promise);
    await mountAuth();

    await act(async () => emitAuth(null));
    initialSession.resolve({ data: { session: session(ACCOUNT_A, "token-a") } });
    await flushAuth();

    expect(mocks.observeMeetingAuthOwner).toHaveBeenCalledOnce();
    expect(mocks.observeMeetingAuthOwner).toHaveBeenCalledWith(null);
    expect(mocks.setAuth).not.toHaveBeenCalled();
    expect(mocks.fetchContract).not.toHaveBeenCalled();
    expect(mocks.clearStore).toHaveBeenCalledOnce();
    expect(authState().userId).toBeNull();
    expect(authState().profileId).toBeNull();
  });

  it("lets only the newest of multiple callbacks commit while realtime auth awaits", async () => {
    const initialSession = deferred<{ data: { session: AuthSession | null } }>();
    const bRealtime = deferred<void>();
    mocks.getSession.mockReturnValue(initialSession.promise);
    mocks.setAuth.mockImplementation((token: string) => (
      token === "token-b" ? bRealtime.promise : Promise.resolve()
    ));
    await mountAuth();

    const bCallback = emitAuth(session(ACCOUNT_B, "token-b"));
    await act(async () => emitAuth(session(ACCOUNT_C, "token-c")));
    initialSession.resolve({ data: { session: session(ACCOUNT_A, "token-a") } });
    await flushAuth();
    bRealtime.resolve();
    await act(async () => bCallback);

    expect(mocks.observeMeetingAuthOwner.mock.calls).toEqual([
      [ACCOUNT_B],
      [ACCOUNT_C],
    ]);
    expect(mocks.fetchContract).toHaveBeenCalledTimes(1);
    expect(authState().userId).toBe(ACCOUNT_C);
  });

  it("allows an unsuperseded initializer to complete", async () => {
    const initialRealtime = deferred<void>();
    mocks.getSession.mockResolvedValue({
      data: { session: session(ACCOUNT_A, "token-a") },
    });
    mocks.setAuth.mockReturnValue(initialRealtime.promise);
    await mountAuth();

    expect(mocks.observeMeetingAuthOwner).toHaveBeenCalledWith(ACCOUNT_A);
    expect(mocks.fetchContract).not.toHaveBeenCalled();

    initialRealtime.resolve();
    await flushAuth();

    expect(mocks.fetchContract).toHaveBeenCalledOnce();
    expect(authState().userId).toBe(ACCOUNT_A);
    expect(authState().profileId).toBe("profile");
    expect(authState().loading).toBe(false);
  });

  it("fences an initializer superseded during its realtime await", async () => {
    const initialRealtime = deferred<void>();
    mocks.getSession.mockResolvedValue({
      data: { session: session(ACCOUNT_A, "token-a") },
    });
    mocks.setAuth.mockImplementation((token: string) => (
      token === "token-a" ? initialRealtime.promise : Promise.resolve()
    ));
    await mountAuth();

    await act(async () => emitAuth(session(ACCOUNT_B, "token-b")));
    initialRealtime.resolve();
    await flushAuth();

    expect(mocks.observeMeetingAuthOwner.mock.calls).toEqual([
      [ACCOUNT_A],
      [ACCOUNT_B],
    ]);
    expect(mocks.fetchContract).toHaveBeenCalledTimes(1);
    expect(authState().userId).toBe(ACCOUNT_B);
  });

  it("keeps same-user refresh valid and replaces a stale in-flight profile", async () => {
    const staleProfile = deferred<{ profile: { id: string } }>();
    mocks.getSession.mockResolvedValue({
      data: { session: session(ACCOUNT_A, "token-a-1") },
    });
    mocks.fetchContract
      .mockReturnValueOnce(staleProfile.promise)
      .mockResolvedValueOnce({ profile: { id: "fresh-profile" } });
    await mountAuth();

    await act(async () => emitAuth(session(ACCOUNT_A, "token-a-2")));
    staleProfile.resolve({ profile: { id: "stale-profile" } });
    await flushAuth();

    expect(mocks.observeMeetingAuthOwner.mock.calls).toEqual([
      [ACCOUNT_A],
      [ACCOUNT_A],
    ]);
    expect(mocks.fetchContract).toHaveBeenCalledTimes(2);
    expect(authState().userId).toBe(ACCOUNT_A);
    expect(authState().profileId).toBe("fresh-profile");
  });
});
