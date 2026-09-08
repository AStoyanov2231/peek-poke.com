import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(resolve(process.cwd(), "supabase/migrations/20260908113317_product_social_intent.sql"), "utf8");

describe("product social intent migration", () => {
  it("uses expiry, block gates, and atomic response-to-thread creation", () => {
    expect(sql).toContain("create table if not exists public.user_availabilities");
    expect(sql).toContain("expires_at timestamptz not null");
    expect(sql).toContain("create table if not exists public.pokes");
    expect(sql).toContain("for update");
    expect(sql).toContain("insert into public.dm_threads(participant_1_id, participant_2_id)");
    expect(sql).toContain("charging either participant");
    expect(sql).toContain("public.user_blocks");
    expect(sql).toContain("revoke all on public.user_availabilities, public.pokes");
  });

  it("keeps location server-only and records the baseline assumptions", () => {
    expect(sql).toContain("no ordered Supabase schema history");
    expect(sql).toContain("Do not grant direct table access to app clients");
    expect(sql).toContain("round(vl.lat::numeric, 2)");
    expect(sql).toContain("vl.lat");
    expect(sql).toContain("other.lng");
    expect(sql).toContain("ceil(candidate.snapped_distance_km / 2.0) * 2");
  });
});
