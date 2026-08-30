import { Platform } from "react-native";
import { deleteCurrentAccount } from "@/data/account-deletion";
import { apiFetch } from "@/lib/api";
import { supabase } from "@/lib/supabase";
import { router } from "expo-router";

jest.mock("@/lib/api", () => ({
  apiFetch: jest.fn(),
  jsonBody: (value: unknown) => JSON.stringify(value),
}));
jest.mock("@/lib/supabase", () => ({
  supabase: { auth: { signOut: jest.fn() } },
}));
jest.mock("expo-router", () => ({ router: { replace: jest.fn() } }));

describe(`account deletion recovery on ${Platform.OS}`, () => {
  it("preserves the local account when the atomic backend is unavailable", async () => {
    const clear = jest.fn();
    jest.mocked(apiFetch).mockRejectedValue(new Error("Account deletion is temporarily unavailable"));

    await expect(deleteCurrentAccount({ clear } as never)).rejects.toThrow(
      "Account deletion is temporarily unavailable",
    );
    expect(supabase.auth.signOut).not.toHaveBeenCalled();
    expect(clear).not.toHaveBeenCalled();
    expect(router.replace).not.toHaveBeenCalled();
  });
});
