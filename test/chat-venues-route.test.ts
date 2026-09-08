import { beforeEach, describe, expect, it, vi } from "vitest";

const USER = "11111111-1111-4111-8111-111111111111";
const PEER = "22222222-2222-4222-8222-222222222222";
const THREAD = "44444444-4444-4444-8444-444444444444";
const mocks = vi.hoisted(() => ({
  blocked: vi.fn(),
  deleted: vi.fn(),
  membership: vi.fn(),
  rpc: vi.fn(),
  locations: vi.fn(),
  venues: vi.fn(),
  rate: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  withAuth: (handler: (request: Request, context: unknown) => Promise<Response>) =>
    (request: Request, context?: { params?: { threadId?: string } }) => handler(request, {
      user: { id: USER }, supabase: {}, params: context?.params ?? {},
    }),
  verifyThreadMembership: mocks.membership,
  isBlocked: mocks.blocked,
  isDeletedProfile: mocks.deleted,
}));
vi.mock("@/lib/rate-limit", () => ({ enforceRateLimit: mocks.rate }));
vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: () => ({
    rpc: mocks.rpc,
    from: () => ({ select: () => ({ in: () => ({ gt: () => ({ limit: mocks.locations }) }) }) }),
  }),
}));
vi.mock("@/features/chat/server/venues", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/features/chat/server/venues")>(),
  contextualVenues: mocks.venues,
}));

import { GET } from "@/app/api/dm/[threadId]/venues/route";

function request() {
  return GET(new Request(`https://app.test/api/dm/${THREAD}/venues`), { params: { threadId: THREAD } } as never);
}

function visibleWithLocations() {
  mocks.rpc.mockResolvedValue({ data: true, error: null });
  mocks.locations.mockResolvedValue({ data: [
    { user_id: USER, lat: 42.6977, lng: 23.3219, updated_at: new Date().toISOString() },
    { user_id: PEER, lat: 42.7032, lng: 23.33, updated_at: new Date().toISOString() },
  ], error: null });
}

describe("chat venue route authorization", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.rate.mockResolvedValue(null);
    mocks.membership.mockResolvedValue({ id: THREAD, participant_1_id: USER, participant_2_id: PEER });
    mocks.blocked.mockResolvedValue(false);
    mocks.deleted.mockResolvedValue(false);
    mocks.venues.mockResolvedValue({ source: "google_places", venues: [] });
  });

  it("does not consult privileged location data without current membership", async () => {
    mocks.membership.mockResolvedValue(null);
    const response = await request();
    expect(response.status).toBe(404);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("does not consult privileged location data for a blocked thread", async () => {
    mocks.blocked.mockResolvedValue(true);
    const response = await request();
    expect(response.status).toBe(404);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("fails closed when either member's discovery audience denies the midpoint", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: false, error: null }).mockResolvedValueOnce({ data: true, error: null });
    const response = await request();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ source: "unavailable", venues: [] });
    expect(mocks.locations).not.toHaveBeenCalled();
    expect(mocks.venues).not.toHaveBeenCalled();
  });

  it("returns unavailable for missing or stale locations", async () => {
    mocks.rpc.mockResolvedValue({ data: true, error: null });
    mocks.locations.mockResolvedValue({ data: [{ user_id: USER, lat: 42.7, lng: 23.32, updated_at: new Date().toISOString() }], error: null });
    const response = await request();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ source: "unavailable", venues: [] });
    expect(mocks.venues).not.toHaveBeenCalled();
  });

  it("uses only a 2-decimal midpoint after every authorization fence", async () => {
    visibleWithLocations();
    const response = await request();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(mocks.venues).toHaveBeenCalledWith({ latitude: 42.7, longitude: 23.33 });
  });
});
