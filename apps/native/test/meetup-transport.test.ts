import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  apiFetch: vi.fn(),
  randomUUID: vi.fn(() => "native-meetup-key-000001"),
}));

vi.mock("expo-crypto", () => ({ randomUUID: mocks.randomUUID }));
vi.mock("@/lib/api", () => ({
  apiFetch: mocks.apiFetch,
  jsonBody: JSON.stringify,
}));

import { acknowledgeMeetup, fetchMeetupAcknowledgement } from "@/data/meetups";

const PEER_ID = "11111111-1111-4111-8111-111111111111";

describe("native meetup acknowledgement transport", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("reads private acknowledgement state without location data", async () => {
    mocks.apiFetch.mockResolvedValue({ meetup: null });

    await expect(fetchMeetupAcknowledgement(PEER_ID)).resolves.toEqual({
      meetup: null,
    });

    expect(mocks.apiFetch).toHaveBeenCalledWith(
      `/api/meetups?peerId=${PEER_ID}`,
      expect.objectContaining({
        responseSchema: expect.anything(),
      }),
    );
    expect(mocks.apiFetch.mock.calls[0]?.[1]).not.toMatchObject({
      body: expect.anything(),
    });
  });

  it("retains its idempotency key when a submission is retried after failure", async () => {
    mocks.apiFetch.mockRejectedValueOnce(new Error("Temporary failure"));

    await expect(acknowledgeMeetup(PEER_ID, "thread-a:peer-a")).rejects.toThrow(
      "Temporary failure",
    );

    mocks.apiFetch.mockResolvedValueOnce({
      meetup: {
        id: "22222222-2222-4222-8222-222222222222",
        peerId: PEER_ID,
        status: "waiting",
        viewerConfirmed: true,
        expiresAt: "2026-09-09T12:00:00.000Z",
        confirmedAt: null,
      },
      replayed: true,
    });

    await acknowledgeMeetup(PEER_ID, "thread-a:peer-a");

    const [first, second] = mocks.apiFetch.mock.calls;
    expect(first?.[0]).toBe("/api/meetups");
    expect(second?.[0]).toBe("/api/meetups");
    expect(first?.[1]).toMatchObject({
      method: "POST",
      body: JSON.stringify({ peerId: PEER_ID }),
      headers: { "idempotency-key": "native-meetup-key-000001" },
    });
    expect(second?.[1]).toMatchObject({
      headers: { "idempotency-key": "native-meetup-key-000001" },
    });
  });
});
