import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, userEvent, waitFor } from "@testing-library/react-native";
import type { AgeAdmission } from "@peekpoke/shared";
import InviteScreen from "../app/invite/[inviterId]";
import { AgeAdmissionProvider } from "@/components/age-admission-context";
import { acceptInvite, fetchInvitePreview } from "@/data/social/api";
import { router } from "expo-router";

jest.mock("expo-router", () => ({
  router: { replace: jest.fn() },
  useLocalSearchParams: () => ({ inviterId: `v1.22222222-2222-4222-8222-222222222222.1999999999.${"a".repeat(43)}` }),
}));
jest.mock("@/data/social/api", () => ({ acceptInvite: jest.fn(), fetchInvitePreview: jest.fn() }));
jest.mock("@/data/social/queries", () => ({ invalidateSocialQueries: jest.fn() }));
jest.mock("@/components/ui", () => {
  const { Pressable, Text } = require("react-native");
  return { Avatar: () => null, Button: ({ children, ...props }: { children: React.ReactNode }) => <Pressable accessibilityRole="button" {...props}><Text>{children}</Text></Pressable> };
});

const clients: QueryClient[] = [];
afterEach(() => { clients.splice(0).forEach((client) => client.clear()); });
function screen(admission: AgeAdmission | null) {
  const client = new QueryClient({ defaultOptions: { queries: { gcTime: 0, retry: false }, mutations: { gcTime: 0 } } });
  clients.push(client);
  return <QueryClientProvider client={client}>
    <AgeAdmissionProvider value={{ accountId: "11111111-1111-4111-8111-111111111111", admission, refreshAdmission: async () => {} }}>
      <InviteScreen />
    </AgeAdmissionProvider>
  </QueryClientProvider>;
}

describe("invitation admission boundary", () => {
  const adult = { status: "adult", decided_at: "2026-09-08T00:00:00.000Z" } as const;
  const profile = { id: "22222222-2222-4222-8222-222222222222", username: "maria", display_name: "Maria", avatar_url: null, location_text: null, is_online: false, last_seen_at: null };
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(fetchInvitePreview).mockResolvedValue({ profile });
  });
  it.each([null, { status: "pending", decided_at: null }, { status: "blocked", decided_at: "2026-09-08T00:00:00.000Z" }] as const)("withholds Connect while admission is %s", (admission) => {
    const result = render(screen(admission));
    expect(result.queryByRole("button", { name: "Connect" })).toBeNull();
    expect(fetchInvitePreview).not.toHaveBeenCalled();
  });
  it("shows the inviter and explicit Connect only for an admitted adult, then removes it on revocation", async () => {
    const result = render(screen(adult));
    expect(await result.findByText("Connect with Maria?")).toBeTruthy();
    expect(result.getByRole("button", { name: "Connect" })).toBeTruthy();
    expect(acceptInvite).not.toHaveBeenCalled();
    result.rerender(screen(null));
    expect(result.queryByRole("button", { name: "Connect" })).toBeNull();
  });
  it("withholds Connect on failed preview and recovers through explicit retry", async () => {
    jest.mocked(fetchInvitePreview).mockRejectedValueOnce(new Error("Unavailable"));
    const result = render(screen(adult));
    expect(await result.findByText("This invite is unavailable")).toBeTruthy();
    expect(result.queryByRole("button", { name: "Connect" })).toBeNull();
    await userEvent.setup().press(result.getByRole("button", { name: "Try again" }));
    expect(await result.findByText("Connect with Maria?")).toBeTruthy();
    expect(acceptInvite).not.toHaveBeenCalled();
  });
  it("does not navigate after a pending acceptance outlives admission", async () => {
    let resolve!: (value: { profile_id: string }) => void;
    jest.mocked(acceptInvite).mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
    const result = render(screen(adult));
    await userEvent.setup().press(await result.findByRole("button", { name: "Connect" }));
    await waitFor(() => expect(acceptInvite).toHaveBeenCalledTimes(1));
    result.rerender(screen(null));
    await act(async () => { resolve({ profile_id: profile.id }); });
    expect(router.replace).not.toHaveBeenCalled();
  });
});
