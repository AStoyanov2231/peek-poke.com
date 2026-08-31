import { StyleSheet } from "react-native";
import { act, render, userEvent } from "@testing-library/react-native";
import { ChatMeetingAction } from "@/components/chat-meeting-action";
import {
  ApiTransportError,
  createMeetingAttemptCoordinator,
  createMeetingCompletionRegistry,
  StaleMeetingAttemptError,
} from "@peekpoke/shared";

const mockSetQueryData = jest.fn();

jest.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ setQueryData: mockSetQueryData }),
}));
jest.mock("@/data/api", () => ({
  recordMeeting: jest.fn(),
  discardMeetingAttempt: jest.fn(() => true),
  unsubscribeMeetingAttempt: jest.fn(() => true),
}));
jest.mock("@/lib/location", () => ({ markDeviceLocationStale: jest.fn() }));

const mockedMeetingApi = jest.requireMock("@/data/api") as {
  recordMeeting: jest.Mock;
  discardMeetingAttempt: jest.Mock;
  unsubscribeMeetingAttempt: jest.Mock;
};
const mockedLocation = jest.requireMock("@/lib/location") as {
  markDeviceLocationStale: jest.Mock;
};

const ACCOUNT_ID = "11111111-1111-4111-8111-111111111111";
const FRIEND_ID = "22222222-2222-4222-8222-222222222222";

function action(eligible = true) {
  return render(
    <ChatMeetingAction
      accountId={ACCOUNT_ID}
      friendId={FRIEND_ID}
      meetingEligible={eligible}
      threadId="33333333-3333-4333-8333-333333333333"
    />,
  );
}

describe("ChatMeetingAction Pressability", () => {
  beforeEach(() => jest.clearAllMocks());

  it("hides when fresh-location proximity eligibility is absent", () => {
    const result = action(false);
    expect(result.queryByRole("button")).toBeNull();
  });

  it("uses a real accessible 44 point Pressable and blocks duplicate taps", async () => {
    let resolve!: (value: {
      success: true;
      awarded: true;
      already_met: false;
      balance: number;
    }) => void;
    mockedMeetingApi.recordMeeting.mockImplementation(
      (_accountId: string, _friendId: string, _signal: undefined, commit: (value: {
        success: true;
        awarded: true;
        already_met: false;
        balance: number;
      }) => void) => new Promise((done) => {
        resolve = (value) => {
          commit(value);
          done(value);
        };
      }),
    );
    const result = action();
    const button = result.getByRole("button", { name: "Meet and earn" });

    expect(StyleSheet.flatten(button.props.style)).toMatchObject({ minHeight: 44 });
    await userEvent.setup().press(button);
    expect(mockedMeetingApi.recordMeeting).toHaveBeenCalledTimes(1);
    expect(mockedMeetingApi.recordMeeting).toHaveBeenCalledWith(
      ACCOUNT_ID,
      FRIEND_ID,
      undefined,
      expect.any(Function),
      `native-chat-meeting:${ACCOUNT_ID}:33333333-3333-4333-8333-333333333333:${FRIEND_ID}`,
    );
    expect(result.getByRole("button", { name: "Meet and earn", disabled: true })).toBeTruthy();
    await userEvent.setup().press(button);
    expect(mockedMeetingApi.recordMeeting).toHaveBeenCalledTimes(1);

    await act(async () => resolve({
      success: true,
      awarded: true,
      already_met: false,
      balance: 4,
    }));
    expect(mockSetQueryData).toHaveBeenCalledWith(["coins"], { balance: 4 });
    expect(result.getByText("Coin earned")).toBeTruthy();
  });

  it("offers retry and explicit discard after an error", async () => {
    mockedMeetingApi.recordMeeting.mockRejectedValueOnce(new Error("Network unavailable"));
    const result = action();
    await userEvent.setup().press(result.getByRole("button", { name: "Meet and earn" }));

    expect(await result.findByRole("button", { name: "Retry Meet and earn" })).toBeTruthy();
    expect(result.getByText("Network unavailable")).toBeTruthy();
    await userEvent.setup().press(result.getByRole("button", { name: "Discard meeting retry" }));
    expect(mockedMeetingApi.discardMeetingAttempt).toHaveBeenCalledWith(ACCOUNT_ID, FRIEND_ID);
    expect(result.getByRole("button", { name: "Meet and earn" })).toBeTruthy();
  });

  it("does not commit a late response after the account/thread owner unmounts", async () => {
    let resolve!: (value: {
      success: true;
      awarded: true;
      already_met: false;
      balance: number;
    }) => void;
    mockedMeetingApi.recordMeeting.mockImplementation(
      (_accountId: string, _friendId: string, _signal: undefined, commit: (value: {
        success: true;
        awarded: true;
        already_met: false;
        balance: number;
      }) => void) => new Promise((done) => {
        resolve = (value) => {
          commit(value);
          done(value);
        };
      }),
    );
    const result = action();
    await userEvent.setup().press(result.getByRole("button", { name: "Meet and earn" }));
    result.unmount();

    expect(mockedMeetingApi.unsubscribeMeetingAttempt).toHaveBeenCalledWith(
      ACCOUNT_ID,
      FRIEND_ID,
      `native-chat-meeting:${ACCOUNT_ID}:33333333-3333-4333-8333-333333333333:${FRIEND_ID}`,
    );

    await act(async () => resolve({
      success: true,
      awarded: true,
      already_met: false,
      balance: 4,
    }));
    expect(mockSetQueryData).not.toHaveBeenCalled();
  });

  it("invalidates local freshness when the authoritative server rejects stale location", async () => {
    mockedMeetingApi.recordMeeting.mockRejectedValueOnce(
      new ApiTransportError("Location data is stale", 409, "LOCATION_STALE"),
    );
    const result = action();
    await userEvent.setup().press(result.getByRole("button", { name: "Meet and earn" }));

    expect(mockedLocation.markDeviceLocationStale).toHaveBeenCalledWith(
      ACCOUNT_ID,
      "Location needs to be refreshed.",
    );
  });

  it("keeps capped-wallet success copy distinct from a coin award", async () => {
    mockedMeetingApi.recordMeeting.mockImplementation(
      (_accountId: string, _friendId: string, _signal: undefined, commit: (value: {
        success: true;
        awarded: false;
        already_met: false;
        balance: number;
      }) => void) => {
        const result = {
          success: true,
          awarded: false,
          already_met: false,
          balance: 5,
        } as const;
        commit(result);
        return Promise.resolve(result);
      },
    );
    const result = action();
    await userEvent.setup().press(result.getByRole("button", { name: "Meet and earn" }));

    expect(await result.findByText("Meeting recorded")).toBeTruthy();
    expect(result.queryByText("Coin earned")).toBeNull();
    expect(mockSetQueryData).toHaveBeenCalledWith(["coins"], { balance: 5 });
  });

  it("returns to an empty retryable UI when auth generation fences a late result", async () => {
    mockedMeetingApi.recordMeeting.mockRejectedValueOnce(new StaleMeetingAttemptError());
    const result = action();
    await userEvent.setup().press(result.getByRole("button", { name: "Meet and earn" }));

    expect(await result.findByRole("button", { name: "Meet and earn" })).toBeTruthy();
    expect(result.queryByText("Meeting attempt belongs to an inactive authentication generation"))
      .toBeNull();
    expect(mockSetQueryData).not.toHaveBeenCalled();
  });

  it("keeps the platform CTA subscribed when an overlapping background owner unmounts", async () => {
    const coordinator = createMeetingAttemptCoordinator(() => "native-platform-overlap-0001");
    const backgroundCommit = jest.fn();
    const ctaCommit = jest.fn();
    let resolve!: (result: { balance: number }) => void;

    const background = coordinator.run(
      ACCOUNT_ID,
      FRIEND_ID,
      () => new Promise<{ balance: number }>((done) => { resolve = done; }),
      backgroundCommit,
      "native-background-meeting:platform-test",
    );
    const cta = coordinator.run(
      ACCOUNT_ID,
      FRIEND_ID,
      async () => ({ balance: 99 }),
      ctaCommit,
      "native-chat-meeting:platform-test",
    );
    coordinator.unsubscribe(
      ACCOUNT_ID,
      FRIEND_ID,
      "native-background-meeting:platform-test",
    );
    await Promise.resolve();
    resolve({ balance: 4 });

    await Promise.all([background, cta]);
    expect(backgroundCommit).not.toHaveBeenCalled();
    expect(ctaCommit).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["background", "cta"],
    ["cta", "background"],
  ] as const)(
    "completes a capped-wallet platform detector for %s/%s order without a repeat delivery",
    async (firstConsumer, secondConsumer) => {
      const coordinator = createMeetingAttemptCoordinator(() => "native-capped-overlap-00001");
      const completions = createMeetingCompletionRegistry();
      const epoch = completions.activate(ACCOUNT_ID).epoch;
      const delivery = jest.fn(async () => {
        const result = {
          success: true,
          awarded: false,
          already_met: false,
          balance: 5,
        } as const;
        completions.mark(epoch, FRIEND_ID);
        return result;
      });
      const runBackgroundCycle = () => {
        if (completions.has(epoch, FRIEND_ID)) return Promise.resolve(null);
        return coordinator.run(
          ACCOUNT_ID,
          FRIEND_ID,
          delivery,
          undefined,
          "native-background-meeting:capped-platform",
        );
      };
      const runCta = () => coordinator.run(
        ACCOUNT_ID,
        FRIEND_ID,
        delivery,
        undefined,
        "native-chat-meeting:capped-platform",
      );
      const run = (consumer: "background" | "cta") => (
        consumer === "background" ? runBackgroundCycle() : runCta()
      );

      await Promise.all([run(firstConsumer), run(secondConsumer)]);
      // Simulates a fresh screen/hook instance in the same app process.
      await runBackgroundCycle();

      expect(completions.has(epoch, FRIEND_ID)).toBe(true);
      expect(delivery).toHaveBeenCalledTimes(1);
    },
  );
});
