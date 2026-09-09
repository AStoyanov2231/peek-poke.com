import { Platform } from "react-native";
import { render, userEvent } from "@testing-library/react-native";
import { router } from "expo-router";
import { PlanParticipantRow } from "@/components/plan-participant-row";

jest.mock("expo-router", () => ({ router: { push: jest.fn() } }));
jest.mock("lucide-react-native/icons/chevron-right", () => () => null);

const member = {
  user_id: "22222222-2222-4222-8222-222222222222",
  display_name: "Mila",
  avatar_url: null,
  role: "member" as const,
  joined_at: "2026-09-09T00:00:00Z",
};

beforeEach(() => jest.clearAllMocks());

describe(`Plan participant navigation on ${Platform.OS}`, () => {
  it("opens the selected participant's profile only after a press", async () => {
    const screen = render(<PlanParticipantRow member={member} />);
    expect(router.push).not.toHaveBeenCalled();
    await userEvent.setup().press(screen.getByRole("link", { name: "View Mila's profile" }));
    expect(router.push).toHaveBeenCalledWith(`/(app)/profile/${member.user_id}`);
    expect(router.push).toHaveBeenCalledTimes(1);
  });

  it("opens the viewer's own profile directly", async () => {
    const screen = render(<PlanParticipantRow member={member} viewerId={member.user_id} />);
    await userEvent.setup().press(screen.getByRole("link", { name: "View Mila's profile" }));
    expect(router.push).toHaveBeenCalledWith("/(app)/profile");
  });

  it("keeps unnamed participants reachable", async () => {
    const screen = render(<PlanParticipantRow member={{ ...member, display_name: null }} />);
    await userEvent.setup().press(screen.getByRole("link", { name: "View Plan member's profile" }));
    expect(router.push).toHaveBeenCalledWith(`/(app)/profile/${member.user_id}`);
  });
});
