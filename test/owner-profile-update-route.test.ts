import { beforeEach, describe, expect, it, vi } from "vitest";
import { ownerProfileUpdateResponseSchema } from "@peekpoke/shared";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const timestamp = "2026-08-07T10:00:00.000Z";

const boundary = vi.hoisted(() => ({
  update: vi.fn(),
  eq: vi.fn(),
  notifyProfileChanged: vi.fn(async () => undefined),
}));

vi.mock("@/lib/auth", () => ({
  withAuth: (handler: (request: Request, context: unknown) => Promise<Response>) =>
    (request: Request) => request.headers.get("authorization") === "Bearer valid"
      ? handler(request, { user: { id: USER_ID } })
      : Response.json({ code: "UNAUTHORIZED", message: "Unauthorized" }, { status: 401 }),
}));
vi.mock("@/lib/rate-limit", () => ({ enforceRateLimit: vi.fn(async () => null) }));
vi.mock("@/lib/realtime-broadcast", () => ({
  notifyProfileChanged: boundary.notifyProfileChanged,
}));
vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: () => ({
    from: () => ({ update: boundary.update }),
    rpc: vi.fn(async () => ({ data: ["user"], error: null })),
  }),
}));

import { PATCH } from "@/app/api/profile/route";

const storedProfile = {
  id: USER_ID,
  username: "owner",
  display_name: "Élodie 🌈",
  bio: "Preserved bio",
  avatar_url: null,
  cover_image_url: null,
  location_text: null,
  is_online: true,
  last_seen_at: timestamp,
  created_at: timestamp,
  onboarding_completed: true,
};

function request(body: string, authorized = true) {
  return PATCH(new Request("https://example.test/api/profile", {
    method: "PATCH",
    headers: {
      "content-type": "application/json",
      ...(authorized ? { authorization: "Bearer valid" } : {}),
    },
    body,
  }), {} as never);
}

describe("PATCH /api/profile owner display name", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    boundary.eq.mockReturnValue({
      select: () => ({ single: async () => ({ data: storedProfile, error: null }) }),
    });
    boundary.update.mockReturnValue({ eq: boundary.eq });
  });

  it("canonicalizes input, updates only the authenticated owner, and emits an owner-private refresh hint", async () => {
    const response = await request(JSON.stringify({
      display_name: "  E\u0301lodie 🌈  ",
      bio: "Preserved bio",
    }));
    const payload = ownerProfileUpdateResponseSchema.parse(await response.json());

    expect(response.status).toBe(200);
    expect(payload.profile.display_name).toBe("Élodie 🌈");
    expect(boundary.update).toHaveBeenCalledWith({
      display_name: "Élodie 🌈",
      bio: "Preserved bio",
    });
    expect(boundary.eq).toHaveBeenCalledWith("id", USER_ID);
    expect(boundary.notifyProfileChanged).toHaveBeenCalledWith(USER_ID);
  });

  it("rejects unauthenticated writes before privileged database access", async () => {
    const response = await request(JSON.stringify({ display_name: "Ada" }), false);

    expect(response.status).toBe(401);
    expect(boundary.update).not.toHaveBeenCalled();
    expect(boundary.notifyProfileChanged).not.toHaveBeenCalled();
  });

  it.each([
    ["malformed JSON", "{"],
    ["blank display name", JSON.stringify({ display_name: "  " })],
    ["extra owner selector", JSON.stringify({ display_name: "Ada", id: USER_ID })],
    ["empty patch", JSON.stringify({})],
  ])("rejects %s without updating", async (_label, body) => {
    const response = await request(body);

    expect(response.status).toBe(400);
    expect(boundary.update).not.toHaveBeenCalled();
    expect(boundary.notifyProfileChanged).not.toHaveBeenCalled();
  });
});
