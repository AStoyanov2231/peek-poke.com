import { describe, expect, it } from "vitest";
import { planShareDetails } from "@peekpoke/shared";

const plan = {
  title: "Coffee & a walk",
  activity: "coffee",
  starts_at: "2026-09-09T14:00:00Z",
  place_text: "The café by the park",
  member_count: 2,
  id: "private-plan-id",
  owner_id: "private-account-id",
  source_thread_id: "private-thread-id",
};

describe("Plan details shared with a trusted person", () => {
  it("includes date, local time with zone, place, and count without internal identifiers", () => {
    const text = planShareDetails(plan, { locale: "en-GB", timeZone: "Europe/Sofia" });
    expect(text).toContain("Coffee & a walk");
    expect(text).toContain("9 September 2026");
    expect(text).toContain("17:00");
    expect(text).toMatch(/EEST|GMT\+3/);
    expect(text).toContain("Place: The café by the park");
    expect(text).toContain("2 people going");
    expect(text).not.toContain("private-");
    expect(text).not.toContain("/plan/");
  });

  it("uses activity when the title is absent and formats a single participant", () => {
    const text = planShareDetails({ ...plan, title: null, member_count: 1 }, { locale: "en-GB", timeZone: "UTC" });
    expect(text.startsWith("coffee\n")).toBe(true);
    expect(text).toContain("14:00");
    expect(text).toContain("1 person going");
  });
});
