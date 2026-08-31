import { QueryClient } from "@tanstack/react-query";
import { Platform } from "react-native";
import { refreshNativeProfileReferences } from "@/data/profile/cache";
import { nativeQueryKeys } from "@/data/query-keys";

const VIEWER_ID = "60000000-0000-4000-8000-000000000001";
const PROFILE_ID = "60000000-0000-4000-8000-000000000002";
const UNRELATED_ID = "60000000-0000-4000-8000-000000000003";

describe(`profile convergence on ${Platform.OS}`, () => {
  it("invalidates owner/counterpart references and preserves an unrelated user's cache", async () => {
    const client = new QueryClient();
    client.setQueryData(nativeQueryKeys.profile.current, { id: VIEWER_ID });
    const targetPublic = nativeQueryKeys.profile.public(PROFILE_ID);
    const unrelatedPublic = nativeQueryKeys.profile.public(UNRELATED_ID);
    const search = [...nativeQueryKeys.discovery.userSearch, "peer"] as const;
    client.setQueryData(targetPublic, { profile: { id: PROFILE_ID } });
    client.setQueryData(unrelatedPublic, { profile: { id: UNRELATED_ID } });
    client.setQueryData(search, [{ id: PROFILE_ID }]);

    await expect(refreshNativeProfileReferences(
      client,
      VIEWER_ID,
      PROFILE_ID,
      { refetch: false },
    )).resolves.toBe(true);

    [targetPublic, search].forEach((key) => {
      expect(client.getQueryState(key)?.isInvalidated).toBe(true);
    });
    expect(client.getQueryState(unrelatedPublic)?.isInvalidated).toBe(false);
    expect(client.getQueryState(nativeQueryKeys.profile.current)?.isInvalidated).toBe(false);
    client.clear();
  });
});
