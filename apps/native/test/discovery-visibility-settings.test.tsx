import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, userEvent } from "@testing-library/react-native";
import { useState } from "react";
import { Pressable, Text } from "react-native";
import { SettingsSheet } from "@/components/profile-overlays";
import { DiscoveryVisibilitySettings } from "@/components/discovery-visibility-settings";

jest.mock("lucide-react-native/icons/chevron-left", () => () => null);
jest.mock("lucide-react-native/icons/chevron-right", () => () => null);
jest.mock("lucide-react-native/icons/circle-question-mark", () => () => null);
jest.mock("lucide-react-native/icons/copy", () => () => null);
jest.mock("lucide-react-native/icons/file-text", () => () => null);
jest.mock("lucide-react-native/icons/trash-2", () => () => null);
jest.mock("lucide-react-native/icons/share-2", () => () => null);
jest.mock("lucide-react-native/icons/x", () => () => null);
jest.mock("lucide-react-native/icons/map-pin", () => () => null);
jest.mock("expo-clipboard", () => ({ setStringAsync: jest.fn() }));
jest.mock("expo-linking", () => ({ openURL: jest.fn() }));
jest.mock("expo-constants", () => ({ expoConfig: { version: "0.1.0" } }));
jest.mock("expo-status-bar", () => ({ StatusBar: () => null }));
jest.mock("expo-image", () => ({ Image: () => null }));
jest.mock("react-native-qrcode-svg", () => () => null);
jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ bottom: 0 }) }));
jest.mock("@/components/ui", () => ({ IconGlyph: () => null }));
jest.mock("@/data/social/api", () => ({ fetchInviteLink: jest.fn() }));
jest.mock("@/data/discovery-preferences", () => ({
  fetchDiscoveryPreference: jest.fn(),
  saveDiscoveryPreference: jest.fn(),
}));

const preferenceApi = jest.requireMock("@/data/discovery-preferences") as {
  fetchDiscoveryPreference: jest.Mock;
  saveDiscoveryPreference: jest.Mock;
};

function settingsSheet(client: QueryClient, open = true) {
  return render(
    <QueryClientProvider client={client}>
      <SettingsSheet open={open} onClose={jest.fn()} onDeleteAccount={jest.fn()} onSignOut={jest.fn()} />
    </QueryClientProvider>,
  );
}

function FreshPreferenceHarness() {
  const [audience, setAudience] = useState<"everyone" | "friends">("everyone");
  return <>
    <DiscoveryVisibilitySettings audience={audience} onSave={async () => undefined} />
    <Pressable accessibilityRole="button" onPress={() => setAudience("friends")}><Text>Refresh preference</Text></Pressable>
  </>;
}

let resolveDelayedSave: (() => void) | null = null;

function DelayedSaveHarness() {
  const [audience, setAudience] = useState<"everyone" | "friends" | "hidden">("everyone");
  return <>
    <DiscoveryVisibilitySettings
      audience={audience}
      onSave={() => new Promise<void>((resolve) => { resolveDelayedSave = resolve; })}
    />
    <Pressable accessibilityRole="button" onPress={() => setAudience("friends")}><Text>Acknowledge Friends</Text></Pressable>
    <Pressable accessibilityRole="button" onPress={() => setAudience("hidden")}><Text>Receive Hidden</Text></Pressable>
  </>;
}

describe("Discovery visibility persistence", () => {
  beforeEach(() => jest.clearAllMocks());

  it("updates the real query cache so closing and reopening settings uses the saved audience", async () => {
    let persistedAudience = "everyone";
    preferenceApi.fetchDiscoveryPreference.mockImplementation(async () => ({ audience: persistedAudience }));
    preferenceApi.saveDiscoveryPreference.mockImplementation(async ({ audience }) => {
      persistedAudience = audience;
      return { audience };
    });
    const client = new QueryClient({ defaultOptions: { queries: { gcTime: 0, retry: false } } });
    const result = settingsSheet(client);
    const user = userEvent.setup();

    await user.press(result.getByRole("button", { name: "Discovery visibility" }));
    await result.findByRole("radio", { checked: true, name: "Everyone" });
    await user.press(result.getByRole("radio", { name: "Friends" }));
    await user.press(result.getByRole("button", { name: "Save visibility" }));

    expect(preferenceApi.saveDiscoveryPreference).toHaveBeenCalledWith({ audience: "friends" });
    expect(client.getQueryData(["discovery-preferences"])).toEqual({ audience: "friends" });
    expect(result.getByRole("button", { name: "Save visibility", disabled: true })).toBeTruthy();

    await user.press(result.getByRole("button", { name: "Close" }));
    persistedAudience = "hidden";
    result.rerender(
      <QueryClientProvider client={client}>
        <SettingsSheet open={false} onClose={jest.fn()} onDeleteAccount={jest.fn()} onSignOut={jest.fn()} />
      </QueryClientProvider>,
    );
    result.rerender(
      <QueryClientProvider client={client}>
        <SettingsSheet open onClose={jest.fn()} onDeleteAccount={jest.fn()} onSignOut={jest.fn()} />
      </QueryClientProvider>,
    );

    await user.press(result.getByRole("button", { name: "Discovery visibility" }));
    expect(await result.findByRole("radio", { checked: true, name: "Hidden" })).toBeTruthy();
    expect(result.getByRole("button", { name: "Save visibility", disabled: true })).toBeTruthy();
    result.unmount();
    client.clear();
  });

  it("keeps an unsaved selection for a retry after a failed save", async () => {
    const save = jest.fn().mockRejectedValueOnce(new Error("offline"));
    const result = render(<DiscoveryVisibilitySettings audience="everyone" onSave={save} />);
    const user = userEvent.setup();

    await user.press(result.getByRole("radio", { name: "Friends" }));
    await user.press(result.getByRole("button", { name: "Save visibility" }));
    expect(await result.findByRole("alert")).toHaveTextContent("Couldn’t save visibility. Try again.");
    expect(result.getByRole("radio", { checked: true, name: "Friends" })).toBeTruthy();
    expect(result.getByRole("button", { name: "Retry save" })).toBeTruthy();

    save.mockResolvedValueOnce(undefined);
    await act(async () => user.press(result.getByRole("button", { name: "Retry save" })));
    expect(save).toHaveBeenCalledTimes(2);
  });

  it("preserves an unsaved draft while fresh server data arrives", async () => {
    const result = render(<FreshPreferenceHarness />);
    const user = userEvent.setup();

    await user.press(result.getByRole("radio", { name: "Hidden" }));
    await user.press(result.getByRole("button", { name: "Refresh preference" }));

    expect(result.getByRole("radio", { checked: true, name: "Hidden" })).toBeTruthy();
    expect(result.getByRole("button", { name: "Save visibility", disabled: false })).toBeTruthy();
  });

  it("does not let a delayed save acknowledgement overwrite a newer server audience", async () => {
    resolveDelayedSave = null;
    const result = render(<DelayedSaveHarness />);
    const user = userEvent.setup();

    await user.press(result.getByRole("radio", { name: "Friends" }));
    await user.press(result.getByRole("button", { name: "Save visibility" }));
    await user.press(result.getByRole("button", { name: "Acknowledge Friends" }));
    expect(await result.findByRole("radio", { checked: true, name: "Friends" })).toBeTruthy();
    await user.press(result.getByRole("button", { name: "Receive Hidden" }));
    expect(await result.findByRole("radio", { checked: true, name: "Hidden" })).toBeTruthy();

    await act(async () => resolveDelayedSave?.());
    expect(result.getByRole("radio", { checked: true, name: "Hidden" })).toBeTruthy();
    expect(result.getByRole("button", { name: "Save visibility", disabled: true })).toBeTruthy();
  });
});
