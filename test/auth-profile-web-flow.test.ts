import { beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "@supabase/supabase-js";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const state = vi.hoisted(() => ({
  signUp: vi.fn(),
  signInWithPassword: vi.fn(),
  exchangeCodeForSession: vi.fn(),
  getUser: vi.fn(),
  signOut: vi.fn(),
  ensureAuthProfile: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: {
      signUp: state.signUp,
      signInWithPassword: state.signInWithPassword,
      exchangeCodeForSession: state.exchangeCodeForSession,
      getUser: state.getUser,
      signOut: state.signOut,
    },
  }),
}));

vi.mock("@/lib/auth-profile", () => ({
  ensureAuthProfile: state.ensureAuthProfile,
}));

vi.mock("next/navigation", () => ({ redirect: state.redirect }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ delete: vi.fn() }),
}));

import { login, signup } from "@/features/auth/actions";
import { GET as authCallback } from "@/app/auth/callback/route";

function authUser(metadata: Record<string, unknown> = {}): User {
  return {
    id: USER_ID,
    email: "ada@example.com",
    app_metadata: { provider: "google" },
    user_metadata: metadata,
    aud: "authenticated",
    created_at: "2026-08-07T10:00:00.000Z",
  };
}

function signupForm() {
  const form = new FormData();
  form.set("email", "ada@example.com");
  form.set("password", "correct-horse-battery-staple");
  return form;
}

describe("web authenticated profile flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const user = authUser();
    state.signUp.mockResolvedValue({ data: { user, session: null }, error: null });
    state.signInWithPassword.mockResolvedValue({ data: { user }, error: null });
    state.exchangeCodeForSession.mockResolvedValue({ error: null });
    state.getUser.mockResolvedValue({ data: { user }, error: null });
    state.signOut.mockResolvedValue({ error: null });
    state.ensureAuthProfile.mockResolvedValue({
      status: "ready",
      created: true,
      profile: { id: USER_ID, onboarding_completed: false },
    });
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it("does not call the profile backend while email confirmation has no session", async () => {
    await expect(signup(signupForm())).resolves.toEqual({ emailConfirmation: true });
    expect(state.ensureAuthProfile).not.toHaveBeenCalled();
    expect(state.redirect).not.toHaveBeenCalled();
  });

  it("ensures a profile before an immediate-session signup reaches onboarding", async () => {
    const user = authUser();
    state.signUp.mockResolvedValue({
      data: { user, session: { access_token: "session-token", user } },
      error: null,
    });

    await signup(signupForm());

    expect(state.ensureAuthProfile).toHaveBeenCalledWith(user);
    expect(state.redirect).toHaveBeenCalledWith("/onboarding");
  });

  it("fails a malformed successful login closed instead of entering without a profile", async () => {
    state.signInWithPassword.mockResolvedValue({ data: { user: null }, error: null });

    await expect(login(signupForm())).resolves.toEqual({
      error: "Could not prepare your account. Please try again.",
    });
    expect(state.signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(state.ensureAuthProfile).not.toHaveBeenCalled();
    expect(state.redirect).not.toHaveBeenCalled();
  });

  it("ensures an OAuth profile and preserves the invite through onboarding", async () => {
    const user = authUser({ full_name: "Ada Lovelace" });
    state.getUser.mockResolvedValue({ data: { user }, error: null });

    const response = await authCallback(new Request(
      "https://example.test/auth/callback?code=oauth-code&next=%2Finvite%2Fabc-123",
    ));

    expect(state.exchangeCodeForSession).toHaveBeenCalledWith("oauth-code");
    expect(state.ensureAuthProfile).toHaveBeenCalledWith(user);
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://example.test/onboarding?invite=abc-123");
  });

  it("lets an existing completed profile continue to the safe intended route", async () => {
    state.ensureAuthProfile.mockResolvedValue({
      status: "ready",
      created: false,
      profile: { id: USER_ID, onboarding_completed: true },
    });

    const response = await authCallback(new Request(
      "https://example.test/auth/callback?code=oauth-code&next=%2Fprofile",
    ));

    expect(response.headers.get("location")).toBe("https://example.test/profile");
  });

  it("signs out and returns a generic callback failure when profile preparation fails", async () => {
    state.ensureAuthProfile.mockResolvedValue({
      status: "failed",
      cause: new Error("database secret"),
    });

    const response = await authCallback(new Request(
      "https://example.test/auth/callback?code=oauth-code",
    ));

    expect(state.signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(response.headers.get("location")).toBe(
      "https://example.test/login?error=Failed+to+authenticate.+Please+try+again.",
    );
  });
});
