import { Alert } from "react-native";
import { act, render, userEvent } from "@testing-library/react-native";
import { acknowledgeMeetup } from "@/data/meetups";
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
  isError: false,
  refetch: jest.fn(),
  invalidateQueries: jest.fn(),
  setQueryData: jest.fn(),
};

jest.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ data: mocks.isError ? undefined : { meetup: mocks.meetup }, isError: mocks.isError, refetch: mocks.refetch }),
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
const ACKNOWLEDGED = {
  meetup: {
    id: "33333333-3333-4333-8333-333333333333",
    peerId: PEER_ID,
    status: "waiting" as const,
    viewerConfirmed: true,
    expiresAt: "2026-09-09T12:00:00.000Z",
    confirmedAt: null,
  },
  replayed: false,
};

function acknowledgement(meetup = mocks.meetup) {
  mocks.meetup = meetup;
  return render(
    <ChatMeetupAcknowledgement
      accountId="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
      peerId={PEER_ID}
      threadId="22222222-2222-4222-8222-222222222222"
      onPlanAgain={jest.fn()}
    />,
  );
}

describe("ChatMeetupAcknowledgement", () => {
  beforeEach(() => {
    mocks.meetup = null;
    mocks.isError = false;
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
  it("offers a retry instead of confirmation when its status could not be loaded", async () => {
    mocks.isError = true;
    const result = acknowledgement();
    expect(result.getByRole("alert")).toHaveTextContent("Meetup confirmation could not be loaded.");
    expect(result.queryByRole("button", { name: "We met" })).toBeNull();
    await userEvent.setup().press(result.getByRole("button", { name: "Retry meetup confirmation" }));
    expect(mocks.refetch).toHaveBeenCalledTimes(1);
    expect(acknowledgeMeetup).not.toHaveBeenCalled();
  });

  it("ignores a pending acknowledgement after the conversation unmounts", async () => {
    let resolve!: (response: Awaited<ReturnType<typeof acknowledgeMeetup>>) => void;
    jest.mocked(acknowledgeMeetup).mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
    const alert = jest.spyOn(Alert, "alert");
    const result = acknowledgement();
    await userEvent.setup().press(result.getByRole("button", { name: "We met" }));
    const yes = alert.mock.calls.at(-1)?.[2]?.find((button) => button.text === "Yes, we met");
    act(() => yes?.onPress?.());
    expect(acknowledgeMeetup).toHaveBeenCalledTimes(1);
    result.unmount();
    await act(async () => { resolve(ACKNOWLEDGED); });
    expect(mocks.setQueryData).not.toHaveBeenCalled();
    expect(mocks.invalidateQueries).not.toHaveBeenCalled();
  });

  it("does not submit an alert left open after switching accounts", async () => {
    const alert = jest.spyOn(Alert, "alert");
    const result = acknowledgement();
    await userEvent.setup().press(result.getByRole("button", { name: "We met" }));
    const yes = alert.mock.calls.at(-1)?.[2]?.find((button) => button.text === "Yes, we met");
    result.rerender(<ChatMeetupAcknowledgement accountId="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" peerId={PEER_ID} threadId="22222222-2222-4222-8222-222222222222" onPlanAgain={jest.fn()} />);
    act(() => yes?.onPress?.());
    expect(acknowledgeMeetup).not.toHaveBeenCalled();
  });

  it("submits once for repeated consent callbacks and updates only the account-scoped query", async () => {
    let resolve!: (response: Awaited<ReturnType<typeof acknowledgeMeetup>>) => void;
    jest.mocked(acknowledgeMeetup).mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
    const alert = jest.spyOn(Alert, "alert");
    const result = acknowledgement();
    await userEvent.setup().press(result.getByRole("button", { name: "We met" }));
    const yes = alert.mock.calls.at(-1)?.[2]?.find((button) => button.text === "Yes, we met");
    act(() => { yes?.onPress?.(); yes?.onPress?.(); });
    expect(acknowledgeMeetup).toHaveBeenCalledTimes(1);
    await act(async () => { resolve(ACKNOWLEDGED); });
    expect(mocks.setQueryData).toHaveBeenCalledWith(["meetups", "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", PEER_ID], { meetup: ACKNOWLEDGED.meetup });
  });

});
