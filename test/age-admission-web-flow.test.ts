import { describe, expect, it } from "vitest";
import { ageAdmissionRedirect, afterAgeAdmissionPath } from "@/lib/age-admission-redirect";
import { birthDateRequest, birthDateReview } from "@/features/auth/age-admission-form";

describe("web age-admission flow", () => {
  it("preserves a safe deep link but rejects auth loops and external destinations", () => {
    expect(afterAgeAdmissionPath("/plans/11111111-1111-4111-8111-111111111111?source=chat")).toBe("/plans/11111111-1111-4111-8111-111111111111?source=chat");
    expect(afterAgeAdmissionPath("/age-gate?redirectTo=/now")).toBe("/now");
    expect(afterAgeAdmissionPath("https://attacker.example")).toBe("/now");
    expect(ageAdmissionRedirect("/invite/11111111-1111-4111-8111-111111111111")).toContain("invite=11111111-1111-4111-8111-111111111111");
  });

  it("requires a complete numeric date before review and never decides eligibility in the browser", () => {
    expect(birthDateRequest({ day: "4", month: "3", year: "2000" })).toBe("2000-03-04");
    expect(birthDateReview({ day: "4", month: "3", year: "2000" })).toBe("4 March 2000");
    expect(birthDateRequest({ day: "4", month: "3", year: "00" })).toBeNull();
    // A calendar-invalid but complete declaration stays server-validated.
    expect(birthDateRequest({ day: "31", month: "2", year: "2000" })).toBe("2000-02-31");
  });
});
