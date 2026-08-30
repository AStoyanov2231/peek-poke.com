import { Platform } from "react-native";
import { render, userEvent } from "@testing-library/react-native";
import { InboxDataRecovery } from "@/components/inbox-data-recovery";

describe(`InboxDataRecovery on ${Platform.OS}`, () => {
  it("shows stale unread qualification and executes the real retry action", async () => {
    const retry = jest.fn();
    const result = render(<InboxDataRecovery pending={false} onRetry={retry} />);

    expect(result.getByRole("alert")).toHaveTextContent(/unread status may be outdated/i);
    await userEvent.setup().press(
      result.getByRole("button", { name: "Retry inbox sync" }),
    );
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it("disables duplicate presses while retry is pending", () => {
    const result = render(<InboxDataRecovery pending onRetry={jest.fn()} />);
    expect(result.getByRole("button", { name: "Retry inbox sync" })).toBeDisabled();
    expect(result.getByText("Retrying…")).toBeTruthy();
  });
});
