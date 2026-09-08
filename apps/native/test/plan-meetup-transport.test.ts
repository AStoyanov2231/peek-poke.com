import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  apiFetch: vi.fn(),
  randomUUID: vi.fn(() => "native-plan-meetup-key-000001"),
}));

vi.mock("expo-crypto", () => ({ randomUUID: mocks.randomUUID }));
vi.mock("@/lib/api", () => ({
  apiFetch: mocks.apiFetch,
  jsonBody: JSON.stringify,
}));

const {
  acknowledgePlanMeetup,
  fetchPlanMeetupStatus,
  planMeetupLabel,
  planMeetupPresentation,
  planMeetupShouldShowLoadError,
} = await import("@/data/plan-meetups");

const PLAN_ID = "11111111-1111-4111-8111-111111111111";
const PEER_ID = "22222222-2222-4222-8222-222222222222";
const ACCOUNT_ID = "33333333-3333-4333-8333-333333333333";
const endpoint = `/api/plans/${PLAN_ID}/meetups`;
const FUTURE_CLOSES_AT = "2026-09-10T12:00:00.000Z";
const NOW = Date.parse("2026-09-08T12:00:00.000Z");
const peerMember = {
  user_id: PEER_ID,
  role: "member" as const,
  joined_at: "2026-09-01T12:00:00.000Z",
  display_name: "Alex",
  avatar_url: null,
};

describe("native Plan meetup acknowledgement transport", () => {
  beforeEach(() => vi.clearAllMocks());

  it("reads Plan-scoped acknowledgement state without putting peer identity in the URL", async () => {
    mocks.apiFetch.mockResolvedValue({
      acknowledgements: [],
      canConfirm: true,
      closesAt: "2026-09-10T12:00:00.000Z",
    });

    await expect(fetchPlanMeetupStatus(PLAN_ID)).resolves.toMatchObject({
      canConfirm: true,
    });
    expect(mocks.apiFetch).toHaveBeenCalledWith(
      endpoint,
      expect.objectContaining({ responseSchema: expect.anything() }),
    );
  });

  it("reuses an account-scoped idempotency key after a failed confirmation", async () => {
    mocks.apiFetch.mockRejectedValueOnce(new Error("Temporary failure"));
    await expect(
      acknowledgePlanMeetup(PLAN_ID, PEER_ID, ACCOUNT_ID),
    ).rejects.toThrow("Temporary failure");

    mocks.apiFetch.mockResolvedValueOnce({
      acknowledgements: [{
        peerId: PEER_ID,
        viewerConfirmed: true,
        peerConfirmed: false,
        confirmedAt: null,
      }],
      canConfirm: true,
      closesAt: "2026-09-10T12:00:00.000Z",
    });
    await acknowledgePlanMeetup(PLAN_ID, PEER_ID, ACCOUNT_ID);

    const [first, second] = mocks.apiFetch.mock.calls;
    expect(first?.[0]).toBe(endpoint);
    expect(second?.[0]).toBe(endpoint);
    expect(first?.[1]).toMatchObject({
      method: "POST",
      body: JSON.stringify({ peerId: PEER_ID }),
      headers: { "idempotency-key": "native-plan-meetup-key-000001" },
    });
    expect(second?.[1]).toMatchObject({
      headers: { "idempotency-key": "native-plan-meetup-key-000001" },
    });
  });

  it("uses status wording that does not claim GPS proof or rewards", () => {
    expect(planMeetupLabel(undefined)).toBe("We met");
    expect(planMeetupLabel({ peerId: PEER_ID, viewerConfirmed: true, peerConfirmed: false, confirmedAt: null })).toBe("Waiting for them");
    expect(planMeetupLabel({ peerId: PEER_ID, viewerConfirmed: true, peerConfirmed: true, confirmedAt: "2026-09-10T12:00:00.000Z" })).toBe("Both marked it");
  });

  it("hides the component before the Plan starts, but shows an expired confirmation window accurately", () => {
    const future = {
      acknowledgements: [{ peerId: PEER_ID, viewerConfirmed: false, peerConfirmed: false, confirmedAt: null }],
      canConfirm: false,
      closesAt: FUTURE_CLOSES_AT,
    };
    expect(planMeetupPresentation(future, [peerMember], ACCOUNT_ID, NOW)).toMatchObject({ kind: "hidden" });
    expect(planMeetupPresentation({ ...future, closesAt: "2026-09-07T12:00:00.000Z" }, [peerMember], ACCOUNT_ID, NOW)).toMatchObject({ kind: "closed" });
  });

  it("only presents peers authorized by the server and keeps a failed load visible for retry", () => {
    const blockedPeerId = "44444444-4444-4444-8444-444444444444";
    const blockedMember = { ...peerMember, user_id: blockedPeerId, display_name: "Removed peer" };
    const state = planMeetupPresentation({
      acknowledgements: [{ peerId: PEER_ID, viewerConfirmed: false, peerConfirmed: false, confirmedAt: null }],
      canConfirm: true,
      closesAt: FUTURE_CLOSES_AT,
    }, [peerMember, blockedMember], ACCOUNT_ID, NOW);
    expect(state).toMatchObject({ kind: "active" });
    expect(state.kind === "active" && state.peers.map((peer) => peer.member.user_id)).toEqual([PEER_ID]);
    expect(planMeetupShouldShowLoadError(true, true)).toBe(true);
    expect(planMeetupShouldShowLoadError(false, true)).toBe(false);
  });
});
