import { describe, expect, it } from "vitest";
import { createPlanMeetupAttemptRegistry } from "@/data/plan-meetup-attempts";

describe("Plan meetup confirmation attempts", () => {
  it("reuses a confirmation key for a retry and scopes it to the account and peer", () => {
    let issued = 0;
    const attempts = createPlanMeetupAttemptRegistry(() => `key-${++issued}`);

    expect(
      attempts.keyFor({ accountId: "account-a", peerId: "peer-a" }),
    ).toBe("key-1");
    expect(
      attempts.keyFor({ accountId: "account-a", peerId: "peer-a" }),
    ).toBe("key-1");
    expect(
      attempts.keyFor({ accountId: "account-a", peerId: "peer-b" }),
    ).toBe("key-2");
    expect(
      attempts.keyFor({ accountId: "account-b", peerId: "peer-a" }),
    ).toBe("key-3");
  });
});
