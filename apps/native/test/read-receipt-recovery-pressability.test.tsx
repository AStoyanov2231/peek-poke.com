import { Platform } from "react-native";
import { render, userEvent } from "@testing-library/react-native";
import { ReadReceiptRecovery } from "@/components/read-receipt-recovery";

describe(`ReadReceiptRecovery on ${Platform.OS}`, () => {
  it("exposes and executes the real retry action", async () => {
    const retry = jest.fn();
    const result = render(<ReadReceiptRecovery pending={false} onRetry={retry} />);

    expect(result.getByRole("alert")).toBeTruthy();
    expect(result.getByText("Unread status could not sync.")).toBeTruthy();
    await userEvent.setup().press(
      result.getByRole("button", { name: "Retry unread status sync" }),
    );
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it("disables duplicate presses while retry is pending", () => {
    const result = render(<ReadReceiptRecovery pending onRetry={jest.fn()} />);
    expect(result.getByRole("button", { name: "Retry unread status sync" })).toBeDisabled();
    expect(result.getByText("Retrying…")).toBeTruthy();
  });
});
