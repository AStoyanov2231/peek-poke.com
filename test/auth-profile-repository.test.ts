import { beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "@supabase/supabase-js";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const database = vi.hoisted(() => ({
  rpc: vi.fn(),
  single: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: () => ({ rpc: database.rpc }),
}));

import { ensureAuthProfile } from "@/lib/auth-profile";

function user(): User {
  return {
    id: USER_ID,
    app_metadata: { provider: "google" },
    user_metadata: { full_name: "Ada Lovelace" },
    aud: "authenticated",
    created_at: "2026-08-07T10:00:00.000Z",
  };
}

describe("authenticated profile bootstrap repository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    database.rpc.mockReturnValue({ single: database.single });
    database.single.mockResolvedValue({
      data: {
        id: USER_ID,
        onboarding_completed: false,
        deleted_at: null,
        auth_user_id: USER_ID,
        created: true,
        user_role_assigned: true,
      },
      error: null,
    });
  });

  it("uses the service-role atomic RPC and validates its exact result", async () => {
    await expect(ensureAuthProfile(user())).resolves.toEqual({
      status: "ready",
      created: true,
      profile: { id: USER_ID, onboarding_completed: false },
    });
    expect(database.rpc).toHaveBeenCalledWith("ensure_auth_profile_with_default_role", {
      p_auth_user_id: USER_ID,
      p_username: "user_111111111111411",
      p_display_name: "Ada Lovelace",
    });
    expect(database.single).toHaveBeenCalledOnce();
  });

  it("fails closed when the RPC cannot prove the default role assignment", async () => {
    database.single.mockResolvedValue({
      data: {
        id: USER_ID,
        onboarding_completed: false,
        deleted_at: null,
        auth_user_id: USER_ID,
        created: true,
        user_role_assigned: false,
      },
      error: null,
    });

    await expect(ensureAuthProfile(user())).resolves.toMatchObject({ status: "failed" });
  });
});
