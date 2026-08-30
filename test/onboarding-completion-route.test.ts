import { beforeEach, describe, expect, it, vi } from "vitest";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const database = vi.hoisted(() => ({
  from: vi.fn(),
  profileSelect: vi.fn(),
  interestSelect: vi.fn(),
  update: vi.fn(),
  updateSelect: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  withAuth: (handler: (request: Request, context: unknown) => Promise<Response>) =>
    (request: Request) => handler(request, { user: { id: USER_ID } }),
}));

vi.mock("@/lib/rate-limit", () => ({
  enforceRateLimit: vi.fn(async () => null),
}));

vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: () => ({ from: database.from }),
}));

import { POST } from "@/app/api/profile/complete-onboarding/route";

describe("complete onboarding route contract", () => {
  beforeEach(() => {
    database.profileSelect.mockImplementation((columns: string) => ({
      eq: () => ({
        single: async () => columns === "username"
          ? { data: { username: "alice" }, error: null }
          : {
              data: { id: USER_ID, username: "alice", onboarding_completed: true },
              error: null,
            },
      }),
    }));
    database.interestSelect.mockReturnValue({
      eq: async () => ({ count: 5, error: null }),
    });
    database.updateSelect.mockReturnValue({
      single: async () => ({
        data: { id: USER_ID, username: "alice", onboarding_completed: true },
        error: null,
      }),
    });
    database.update.mockReturnValue({
      eq: () => ({ select: database.updateSelect }),
    });
    database.from.mockImplementation((table: string) => {
      if (table === "profiles") {
        return { select: database.profileSelect, update: database.update };
      }
      if (table === "profile_interests") {
        return { select: database.interestSelect };
      }
      throw new Error(`Unexpected table ${table}`);
    });
  });

  it("counts a named field and returns only the completion projection", async () => {
    const response = await POST(
      new Request("https://example.test/api/profile/complete-onboarding", { method: "POST" }),
      {} as never,
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      success: true,
      profile: { id: USER_ID, username: "alice", onboarding_completed: true },
    });
    expect(database.interestSelect).toHaveBeenCalledWith("id", { count: "exact", head: true });
    expect(database.updateSelect).toHaveBeenCalledWith("id, username, onboarding_completed");
  });
});
