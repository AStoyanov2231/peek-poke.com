import { render } from "@testing-library/react-native";
import { ChatMeetingAction } from "@/components/chat-meeting-action";

jest.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ setQueryData: jest.fn() }),
}));
jest.mock("@/data/api", () => ({
  recordMeeting: jest.fn(),
  discardMeetingAttempt: jest.fn(() => true),
  unsubscribeMeetingAttempt: jest.fn(() => true),
}));
jest.mock("@/lib/location", () => ({ markDeviceLocationStale: jest.fn() }));

describe("ChatMeetingAction reward capability", () => {
  it("hides the reward action when no server attestation capability exists", () => {
    const result = render(
      <ChatMeetingAction
        accountId="11111111-1111-4111-8111-111111111111"
        friendId="22222222-2222-4222-8222-222222222222"
        meetingEligible
        threadId="33333333-3333-4333-8333-333333333333"
      />,
    );

    expect(result.queryByRole("button")).toBeNull();
  });
});
