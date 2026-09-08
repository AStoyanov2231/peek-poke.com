import { Alert } from "react-native";
import { render, userEvent } from "@testing-library/react-native";
import { ChatMeetupAcknowledgement } from "@/components/chat-meetup-acknowledgement";

const mocks = {
  meetup: null as {
    id: string;
    peerId: string;
    status: "waiting" | "confirmed";
    viewerConfirmed: boolean;
    expiresAt: string;
    confirmedAt: string | null;
  } | null,
  invalidateQueries: jest.fn(),
  setQueryData: jest.fn(),
};

jest.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ data: { meetup: mocks.meetup } }),
  useQueryClient: () => ({
    invalidateQueries: mocks.invalidateQueries,
    setQueryData: mocks.setQueryData,
  }),
}));
jest.mock("@/data/meetups", () => ({
  acknowledgeMeetup: jest.fn(),
  fetchMeetupAcknowledgement: jest.fn(),
}));

const PEER_ID = "11111111-1111-4111-8111-111111111111";

function acknowledgement(meetup = mocks.meetup) {
  mocks.meetup = meetup;
  return render(
    <ChatMeetupAcknowledgement
      peerId={PEER_ID}
      threadId="22222222-2222-4222-8222-222222222222"
      onPlanAgain={jest.fn()}
    />,
  );
}

describe("ChatMeetupAcknowledgement", () => {
  beforeEach(() => {
    mocks.meetup = null;
    jest.clearAllMocks();
  });

  it("asks for the viewer's explicit confirmation when only the peer acknowledged", () => {
    const result = acknowledgement({
      id: "33333333-3333-4333-8333-333333333333",
      peerId: PEER_ID,
      status: "waiting",
      viewerConfirmed: false,
      expiresAt: "2026-09-09T12:00:00.000Z",
      confirmedAt: null,
    });

    expect(result.getByRole("button", { name: "Confirm we met" })).toBeTruthy();
    expect(
      result.getByText("They said you met. Confirm only if you met too."),
    ).toBeTruthy();
  });

  it("does not present a reward claim and disables a repeat acknowledgement", () => {
    const result = acknowledgement({
      id: "33333333-3333-4333-8333-333333333333",
      peerId: PEER_ID,
      status: "waiting",
      viewerConfirmed: true,
      expiresAt: "2026-09-09T12:00:00.000Z",
      confirmedAt: null,
    });

    expect(
      result.getByRole("button", { name: "You confirmed", disabled: true }),
    ).toBeTruthy();
    expect(
      result.getByText("Waiting for the other person to confirm."),
    ).toBeTruthy();
  });

  it("explains the consent boundary before it can submit", async () => {
    const alert = jest.spyOn(Alert, "alert");
    const result = acknowledgement();

    await userEvent
      .setup()
      .press(result.getByRole("button", { name: "We met" }));

    expect(alert).toHaveBeenCalledWith(
      "Did you meet up?",
      expect.stringContaining("does not use location proof"),
      expect.any(Array),
    );
    expect(alert.mock.calls[0]?.[1]).toContain("no coins or rewards");
  });
});
