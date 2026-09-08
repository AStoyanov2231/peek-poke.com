/* eslint-disable import/first -- Jest mocks must load before the subject component. */
import { StyleSheet } from "react-native";
import { render, userEvent } from "@testing-library/react-native";

jest.mock("lucide-react-native/icons/calendar-plus", () => () => null);
jest.mock("lucide-react-native/icons/sparkles", () => () => null);
jest.mock("@/data/chat-suggestions", () => ({
  nativeChatSuggestionFallback: () => [
    { id: "time", text: "What time would work for you?" },
    { id: "place", text: "Want to choose a general area?" },
  ],
}));

import { ChatMomentumActions } from "@/components/chat-momentum-actions";

describe("ChatMomentumActions", () => {
  it("places a selected reply in the editable composer callback without sending", async () => {
    const chooseReply = jest.fn();
    const makePlan = jest.fn();
    const result = render(
      <ChatMomentumActions
        hasMessages={false}
        isError={false}
        isLoading={false}
        onChooseReply={chooseReply}
        onMakePlan={makePlan}
        suggestions={[
          { id: "time", text: "What time works for you?" },
          { id: "plan", text: "Make a coffee plan" },
        ]}
      />,
    );

    const reply = result.getByRole("button", {
      name: "Use reply suggestion: What time works for you?",
    });
    expect(StyleSheet.flatten(reply.props.style)).toMatchObject({ minHeight: 44 });
    await userEvent.setup().press(reply);
    expect(chooseReply).toHaveBeenCalledWith("What time works for you?");
    expect(makePlan).not.toHaveBeenCalled();

    await userEvent.setup().press(
      result.getByRole("button", { name: "Make a coffee plan" }),
    );
    expect(makePlan).toHaveBeenCalledTimes(1);
  });

  it("keeps an honest recovery message when the authorized endpoint fails", () => {
    const result = render(
      <ChatMomentumActions
        hasMessages
        isError
        isLoading={false}
        onChooseReply={jest.fn()}
        onMakePlan={jest.fn()}
      />,
    );

    expect(result.getByText(
      "Suggestions are unavailable. You can still write your own message.",
    )).toBeTruthy();
  });
});
