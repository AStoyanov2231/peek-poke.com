import { describe, expect, it } from "vitest";
import {
  isAdultBirthDate,
  parseBirthDate,
} from "@/features/age-admission/server/age-admission";

const TODAY = new Date("2026-03-01T12:00:00.000Z");

describe("age-admission calendar decision", () => {
  it("accepts only real past calendar dates from 1900 onward", () => {
    expect(parseBirthDate("2008-02-29", TODAY)?.toISOString()).toBe("2008-02-29T00:00:00.000Z");
    expect(parseBirthDate("2007-02-29", TODAY)).toBeNull();
    expect(parseBirthDate("1899-12-31", TODAY)).toBeNull();
    expect(parseBirthDate("2026-03-02", TODAY)).toBeNull();
    expect(parseBirthDate("2026-03-01T00:00:00Z", TODAY)).toBeNull();
  });

  it("uses the server UTC calendar and a conservative Mar 1 anniversary for Feb 29", () => {
    expect(isAdultBirthDate("2008-03-01", TODAY)).toBe(true);
    expect(isAdultBirthDate("2008-03-02", TODAY)).toBe(false);
    expect(isAdultBirthDate("2008-02-29", TODAY)).toBe(true);
    expect(isAdultBirthDate("2008-02-29", new Date("2026-02-28T23:59:59.000Z"))).toBe(false);
  });
});
