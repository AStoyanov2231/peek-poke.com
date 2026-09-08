import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260908070000_discovery_audience_preferences.sql"),
  "utf8",
);

describe("discovery audience migration", () => {
  it("keeps preferences service-only and filters both discovery feeds through one predicate", () => {
    expect(migration).toContain("create type public.discovery_audience as enum");
    expect(migration).toContain("default 'everyone'");
    expect(migration).toContain("public.discovery_subject_visible_to_viewer(p_user_id, candidate.user_id)");
    expect(migration).toContain("public.discovery_subject_visible_to_viewer(p_viewer_id, p.id)");
    expect(migration).toContain("interval '10 minutes'");
    expect(migration).not.toContain("interval '15 minutes'");
    expect(migration).toContain("grant execute on function public.update_discovery_preference(uuid, public.discovery_audience) to service_role");
  });
});
