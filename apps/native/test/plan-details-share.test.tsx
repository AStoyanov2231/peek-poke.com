import { Platform, Share } from "react-native";
import { render, userEvent } from "@testing-library/react-native";
import * as Clipboard from "expo-clipboard";
import type { Plan } from "@peekpoke/shared";
import { PlanDetailsShare } from "@/components/plan-details-share";

jest.mock("expo-clipboard", () => ({ setStringAsync: jest.fn(async () => true) }));

const plan: Plan = {
  id: "44444444-4444-4444-8444-444444444444",
  owner_id: "22222222-2222-4222-8222-222222222222",
  title: "Coffee & a walk", activity: "coffee", starts_at: "2026-09-09T14:00:00Z",
  place_text: "The café by the park", participant_limit: 4, member_count: 2,
  visibility: "private", circle_id: null, status: "active",
  viewer_is_member: true, viewer_is_owner: false, source_thread_id: null,
  created_at: "2026-09-09T00:00:00Z", updated_at: "2026-09-09T00:00:00Z",
};

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Share, "share").mockResolvedValue({ action: Share.sharedAction });
});
afterEach(() => jest.restoreAllMocks());

describe(`Trusted Plan details on ${Platform.OS}`, () => {
  it("previews a participant's details and copies only after a separate press", async () => {
    const screen = render(<PlanDetailsShare plan={plan} />);
    const user = userEvent.setup();
    await user.press(screen.getByRole("button", { name: "Share details", exact: true }));
    expect(screen.getByText(/Place: The café by the park/)).toBeTruthy();
    expect(Clipboard.setStringAsync).not.toHaveBeenCalled();
    expect(Share.share).not.toHaveBeenCalled();
    await user.press(screen.getByRole("button", { name: "Copy details" }));
    expect(Clipboard.setStringAsync).toHaveBeenCalledWith(expect.stringContaining("Coffee & a walk"));
    expect(screen.getByText(/^Details copied/)).toBeTruthy();
    await user.press(screen.getByRole("button", { name: "Done" }));
    expect(screen.queryByText("Share plan details")).toBeNull();
  });

  it("shares text without a join link or internal identifier", async () => {
    const screen = render(<PlanDetailsShare plan={plan} />);
    const user = userEvent.setup();
    await user.press(screen.getByRole("button", { name: "Share details", exact: true }));
    await user.press(screen.getByRole("button", { name: "Share", exact: true }));
    expect(Share.share).toHaveBeenCalledTimes(1);
    const [payload] = jest.mocked(Share.share).mock.calls[0];
    expect(payload).toMatchObject({ title: "Coffee & a walk", message: expect.stringContaining("The café by the park") });
    expect(JSON.stringify(payload)).not.toContain(plan.id);
    expect(payload).not.toHaveProperty("url");
  });

  it("retains a selectable preview when sharing fails", async () => {
    jest.mocked(Share.share).mockRejectedValueOnce(new Error("unavailable"));
    const screen = render(<PlanDetailsShare plan={plan} />);
    const user = userEvent.setup();
    await user.press(screen.getByRole("button", { name: "Share details", exact: true }));
    await user.press(screen.getByRole("button", { name: "Share", exact: true }));
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(screen.getByText(/Place: The café by the park/).props.selectable).toBe(true);
    await user.press(screen.getByRole("button", { name: "Copy details" }));
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByText(/^Details copied/)).toBeTruthy();
  });
  it("does not claim copied details when the clipboard returns false", async () => {
    jest.mocked(Clipboard.setStringAsync).mockResolvedValueOnce(false);
    const screen = render(<PlanDetailsShare plan={plan} />);
    const user = userEvent.setup();
    await user.press(screen.getByRole("button", { name: "Share details", exact: true }));
    await user.press(screen.getByRole("button", { name: "Copy details" }));
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(screen.queryByText(/^Details copied/)).toBeNull();
  });

  it.each([
    { viewer_is_member: false },
    { status: "cancelled" as const },
  ])("does not offer sharing for an unavailable Plan %j", (overrides) => {
    const screen = render(<PlanDetailsShare plan={{ ...plan, ...overrides }} />);
    expect(screen.queryByRole("button", { name: "Share details", exact: true })).toBeNull();
  });
});
