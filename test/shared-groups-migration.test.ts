import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parse } from "@libpg-query/parser";

const migration = readFileSync("supabase/migrations/20260814000000_shared_qr_groups.sql", "utf8");
const pgTap = readFileSync("supabase/tests/shared_qr_groups.test.sql", "utf8");

describe("shared QR group SQL", () => {
  it("is accepted by the PostgreSQL parser", () => {
    expect(() => parse(migration)).not.toThrow();
    expect(() => parse(pgTap)).not.toThrow();
  });
});
