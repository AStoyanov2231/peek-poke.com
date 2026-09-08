/* eslint-disable import/first -- Jest mocks must load before the hook. */
import { type PropsWithChildren } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react-native";

jest.mock("expo-router", () => ({
  useFocusEffect: (callback: () => void | (() => void)) => jest.requireActual<typeof import("react")>("react").useEffect(callback, [callback]),
}));
jest.mock("@/lib/api", () => ({ apiFetch: jest.fn() }));
import { apiFetch } from "@/lib/api";
import { useConversationAccess } from "@/hooks/use-conversation-access";

const account = "11111111-1111-4111-8111-111111111111";
const thread = "22222222-2222-4222-8222-222222222222";
const nextAccount = "33333333-3333-4333-8333-333333333333";
const api = jest.mocked(apiFetch);
let client: QueryClient;
function wrapper({ children }: PropsWithChildren) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
function access(milliseconds: number | null = null) {
  return { version: "v1", account_id: account, thread_id: thread, basis: milliseconds === null ? "friendship" : "poke", expires_at: milliseconds === null ? null : new Date(Date.now() + milliseconds).toISOString(), server_now: new Date().toISOString() };
}

beforeEach(() => {
  jest.useFakeTimers();
  api.mockReset();
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});
afterEach(() => { client.clear(); jest.useRealTimers(); });

it("closes an active window on the monotonic timer and reopens only after refreshed acceptance", async () => {
  api.mockResolvedValue(access(2_000));
  const result = renderHook(() => useConversationAccess(thread, account), { wrapper });
  await waitFor(() => expect(result.result.current.canInteract).toBe(true));
  await act(async () => { jest.advanceTimersByTime(2_100); });
  expect(result.result.current.expired).toBe(true);
  expect(result.result.current.canInteract).toBe(false);
  api.mockResolvedValue(access(86_400_000));
  await act(async () => { await result.result.current.refetch(); });
  await waitFor(() => expect(result.result.current.canInteract).toBe(true));
});

it("fails closed during access errors despite previously cached ongoing permission", async () => {
  api.mockResolvedValue(access());
  const result = renderHook(() => useConversationAccess(thread, account), { wrapper });
  await waitFor(() => expect(result.result.current.canInteract).toBe(true));
  api.mockRejectedValue(new Error("Unavailable"));
  await act(async () => { await result.result.current.refetch(); });
  await waitFor(() => expect(result.result.current.isError).toBe(true));
  expect(result.result.current.canInteract).toBe(false);
});

it("does not carry the previous account's permission into an unresolved account", async () => {
  api.mockResolvedValue(access());
  const result = renderHook(({ actor }: { actor: string | undefined }) => useConversationAccess(thread, actor), { wrapper, initialProps: { actor: account as string | undefined } });
  await waitFor(() => expect(result.result.current.canInteract).toBe(true));
  result.rerender({ actor: undefined });
  expect(result.result.current.canInteract).toBe(false);
  api.mockImplementation(() => new Promise(() => {}));
  result.rerender({ actor: nextAccount });
  expect(result.result.current.canInteract).toBe(false);
  expect(result.result.current.data).toBeUndefined();
});
