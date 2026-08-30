import { afterEach, describe, expect, it, vi } from "vitest";
import type { Bootstrap } from "@peekpoke/shared";
import { ApiRequestError } from "@/lib/api";
import { ensureAuthenticatedProfile } from "@/data/api";
import { loadBootstrapForCurrentSession } from "@/lib/profile-bootstrap";

const USER_A = "11111111-1111-4111-8111-111111111111";
const USER_B = "22222222-2222-4222-8222-222222222222";
const auth = vi.hoisted(() => ({
  getSession: vi.fn(async () => ({
    data: { session: { access_token: "access-token-a", user: { id: USER_A } } },
  })),
}));

vi.mock("@/lib/supabase", () => ({
  supabase: { auth: { getSession: auth.getSession } },
}));
vi.mock("expo-crypto", () => ({ randomUUID: () => "native-meeting-key-000001" }));

vi.mock("@/lib/env", () => ({
  env: { apiBaseUrl: "https://www.peek-poke.com" },
}));

function bootstrap(userId = USER_A): Bootstrap {
  return {
    version: "v1",
    identity: { id: userId, email: null },
    onboarding_completed: false,
    roles: ["user"],
    feature_config_version: "v1",
    unread_summary: { threads: 0 },
  };
}

function ensured(userId = USER_A) {
  return {
    created: true,
    profile: { id: userId, onboarding_completed: false },
  };
}

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe("native authenticated profile transport", () => {
  it("sends one authenticated idempotent empty mutation and validates the exact response", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(ensured()), {
      headers: { "x-request-id": "request-native-auth-profile-1" },
    }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(ensureAuthenticatedProfile()).resolves.toEqual(ensured());
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://www.peek-poke.com/api/auth/profile");
    expect(init.method).toBe("POST");
    expect(init.body).toBe("{}");
    expect(new Headers(init.headers).get("authorization")).toBe("Bearer access-token-a");
    expect(new Headers(init.headers).get("content-type")).toBe("application/json");
  });

  it("fails malformed success payloads before bootstrap state is used", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      ...ensured(),
      database_only: "secret",
    }), { headers: { "x-request-id": "request-native-auth-profile-invalid" } })));

    await expect(ensureAuthenticatedProfile()).rejects.toMatchObject({
      status: 502,
      code: "INVALID_RESPONSE",
      requestId: "request-native-auth-profile-invalid",
    });
  });

  it("surfaces the canonical server error without retrying the mutation", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      version: "v1",
      error: "Internal server error",
      message: "Internal server error",
      code: "PROFILE_BOOTSTRAP_FAILED",
      request_id: "request-native-auth-profile-failed",
    }), { status: 500 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(ensureAuthenticatedProfile()).rejects.toMatchObject({
      name: "ApiRequestError",
      status: 500,
      code: "PROFILE_BOOTSTRAP_FAILED",
      requestId: "request-native-auth-profile-failed",
    });
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});

describe("native session-bound profile bootstrap", () => {
  it("does no backend work for email confirmation without a session", async () => {
    const dependencies = {
      currentSessionUserId: vi.fn(async () => null),
      ensureProfile: vi.fn(async () => ensured()),
      fetchBootstrap: vi.fn(async () => bootstrap()),
    };

    await expect(loadBootstrapForCurrentSession(USER_A, dependencies)).resolves.toBeNull();
    expect(dependencies.ensureProfile).not.toHaveBeenCalled();
    expect(dependencies.fetchBootstrap).not.toHaveBeenCalled();
  });

  it("prepares an OAuth session exactly once before loading bootstrap", async () => {
    const dependencies = {
      currentSessionUserId: vi.fn(async () => USER_A),
      ensureProfile: vi.fn(async () => ensured()),
      fetchBootstrap: vi.fn(async () => bootstrap()),
    };

    await expect(loadBootstrapForCurrentSession(USER_A, dependencies)).resolves.toEqual(bootstrap());
    expect(dependencies.currentSessionUserId).toHaveBeenCalledTimes(3);
    expect(dependencies.ensureProfile).toHaveBeenCalledOnce();
    expect(dependencies.fetchBootstrap).toHaveBeenCalledOnce();
  });

  it.each([
    ["before ensure", [USER_B], 0, 0],
    ["after ensure", [USER_A, USER_B], 1, 0],
    ["after bootstrap", [USER_A, USER_A, USER_B], 1, 1],
  ])("abandons a session switch %s without routing stale state", async (
    _label,
    sessionIds,
    ensureCalls,
    bootstrapCalls,
  ) => {
    let index = 0;
    const dependencies = {
      currentSessionUserId: vi.fn(async () => sessionIds[Math.min(index++, sessionIds.length - 1)] ?? null),
      ensureProfile: vi.fn(async () => ensured()),
      fetchBootstrap: vi.fn(async () => bootstrap()),
    };

    await expect(loadBootstrapForCurrentSession(USER_A, dependencies)).resolves.toBeNull();
    expect(dependencies.ensureProfile).toHaveBeenCalledTimes(ensureCalls);
    expect(dependencies.fetchBootstrap).toHaveBeenCalledTimes(bootstrapCalls);
  });

  it("rejects a server identity mismatch before loading bootstrap", async () => {
    const dependencies = {
      currentSessionUserId: vi.fn(async () => USER_A),
      ensureProfile: vi.fn(async () => ensured(USER_B)),
      fetchBootstrap: vi.fn(async () => bootstrap()),
    };

    await expect(loadBootstrapForCurrentSession(USER_A, dependencies)).resolves.toBeNull();
    expect(dependencies.fetchBootstrap).not.toHaveBeenCalled();
  });

  it("propagates canonical auth failures for root recovery without an internal retry loop", async () => {
    const error = new ApiRequestError("Unauthorized", 401, "UNAUTHORIZED", "request-session-expired");
    const dependencies = {
      currentSessionUserId: vi.fn(async () => USER_A),
      ensureProfile: vi.fn(async () => { throw error; }),
      fetchBootstrap: vi.fn(async () => bootstrap()),
    };

    await expect(loadBootstrapForCurrentSession(USER_A, dependencies)).rejects.toBe(error);
    expect(dependencies.ensureProfile).toHaveBeenCalledOnce();
    expect(dependencies.fetchBootstrap).not.toHaveBeenCalled();
  });

  it("propagates coordinator cancellation before starting backend work", async () => {
    const controller = new AbortController();
    const reason = new Error("superseded session");
    controller.abort(reason);
    const dependencies = {
      currentSessionUserId: vi.fn(async () => USER_A),
      ensureProfile: vi.fn(async () => ensured()),
      fetchBootstrap: vi.fn(async () => bootstrap()),
    };

    await expect(loadBootstrapForCurrentSession(USER_A, dependencies, controller.signal))
      .rejects.toBe(reason);
    expect(dependencies.currentSessionUserId).not.toHaveBeenCalled();
    expect(dependencies.ensureProfile).not.toHaveBeenCalled();
    expect(dependencies.fetchBootstrap).not.toHaveBeenCalled();
  });
});
