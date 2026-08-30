import { Platform } from "react-native";
import { render, userEvent } from "@testing-library/react-native";
import { ErrorRecovery } from "@/components/error-recovery";

jest.mock("@/lib/session-recovery", () => ({
  recoverUnauthorizedSession: jest.fn(async () => undefined),
}));
jest.mock("@/components/ui", () => {
  const React = jest.requireActual<typeof import("react")>("react");
  const { Pressable, Text } = jest.requireActual<typeof import("react-native")>("react-native");
  return {
    Button: ({ children, ...props }: { children: string; onPress: () => void }) => (
      <Pressable {...props} accessibilityLabel={children} accessibilityRole="button">
        <Text>{children}</Text>
      </Pressable>
    ),
  };
});

const mockedSessionRecovery = jest.requireMock("@/lib/session-recovery") as {
  recoverUnauthorizedSession: jest.Mock;
};

describe(`ErrorRecovery on ${Platform.OS}`, () => {
  beforeEach(() => jest.clearAllMocks());

  it("routes a real Session expired action through unauthorized recovery", async () => {
    const retry = jest.fn();
    const result = render(
      <ErrorRecovery error={{ status: 401 }} onRetry={retry} />,
    );

    expect(result.getByText("Session expired")).toBeTruthy();
    await userEvent.setup().press(result.getByRole("button", { name: "Sign in again" }));

    expect(mockedSessionRecovery.recoverUnauthorizedSession).toHaveBeenCalledTimes(1);
    expect(retry).not.toHaveBeenCalled();
  });
});
