import { describe, expect, it } from "vitest";
import { explicitInboxTab, preferredInboxTab } from "@/lib/inbox-priority";

describe("native Inbox priority", () => {
  it("puts pending received Pokes ahead of every other Inbox surface", () => {
    expect(preferredInboxTab({ pendingReceivedPokeCount: 1, actionablePlanCount: 2 })).toBe("pokes");
  });

  it("uses active Plans only when there are no pending received Pokes", () => {
    expect(preferredInboxTab({ pendingReceivedPokeCount: 0, actionablePlanCount: 1 })).toBe("plans");
    expect(preferredInboxTab({ pendingReceivedPokeCount: 0, actionablePlanCount: 0 })).toBe("chats");
  });

  it("retains every valid explicit tab for deep links and user choices", () => {
    expect(explicitInboxTab("chats")).toBe("chats");
    expect(explicitInboxTab(["friends", "pokes"])).toBe("friends");
    expect(explicitInboxTab("unknown")).toBeNull();
  });
});
