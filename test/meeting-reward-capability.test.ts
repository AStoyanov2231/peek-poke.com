import { describe, expect, it } from "vitest";
import { canAttemptMeetingReward } from "@peekpoke/shared";

describe("meeting reward capability", () => {
  it("does not permit speculative claims when no server-issued attestation is available", () => {
    expect(canAttemptMeetingReward()).toBe(false);
  });

  it("keeps an explicit capability seam for a future attested flow", () => {
    expect(canAttemptMeetingReward({
      kind: "server-attested-location",
      token: "attestation-token-1234",
    })).toBe(true);
  });
});
