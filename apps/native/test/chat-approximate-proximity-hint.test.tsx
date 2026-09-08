import { fireEvent, render } from "@testing-library/react-native";

jest.mock("lucide-react-native/icons/map-pin", () => () => null);
jest.mock("lucide-react-native/icons/x", () => () => null);
jest.mock("@/components/ui", () => {
  const { Text } = require("react-native");
  return { Body: Text, Caption: Text };
});

import { ChatApproximateProximityHint } from "@/components/chat-approximate-proximity-hint";

describe("ChatApproximateProximityHint", () => {
  it("uses approximate language, keeps a plan action, and can be dismissed", () => {
    const onPlanAgain = jest.fn();
    const result = render(
      <ChatApproximateProximityHint name="Mila" onPlanAgain={onPlanAgain} visible />,
    );

    expect(result.getByText(/same approximate area as Mila/)).toBeTruthy();
    expect(result.getByText("If you meet, each person can mark it in chat.")).toBeTruthy();
    fireEvent.press(result.getByRole("button", { name: "Make a plan with Mila" }));
    expect(onPlanAgain).toHaveBeenCalledTimes(1);
    fireEvent.press(result.getByRole("button", { name: "Dismiss approximate-area message" }));
    expect(result.queryByText(/same approximate area as Mila/)).toBeNull();
    result.rerender(
      <ChatApproximateProximityHint name="Mila" onPlanAgain={onPlanAgain} visible={false} />,
    );
    result.rerender(
      <ChatApproximateProximityHint name="Mila" onPlanAgain={onPlanAgain} visible />,
    );
    expect(result.queryByText(/same approximate area as Mila/)).toBeNull();
  });
});
