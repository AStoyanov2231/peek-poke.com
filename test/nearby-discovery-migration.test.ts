import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  LOCATION_ACK_FRESHNESS_TTL_MS,
  LOCATION_SERVER_FRESHNESS_WINDOW_MS,
} from "@peekpoke/shared";

const migration = readFileSync(
  "supabase/migrations/20260807182907_bounded_nearby_discovery.sql",
  "utf8",
);

describe("bounded nearby discovery migration", () => {
  it("fails closed when its hosted baseline dependencies are absent", () => {
    expect(migration).toContain("to_regclass('public.user_locations')");
    expect(migration).toContain("to_regclass('public.profiles')");
    expect(migration).toContain("to_regclass('public.profile_photos')");
    expect(migration).toContain("to_regclass('public.user_blocks')");
  });

  it("returns the exact online-aware public row and quantizes stranger coordinates", () => {
    expect(migration).toMatch(/returns table\([\s\S]*is_online boolean,[\s\S]*last_seen_at timestamptz,[\s\S]*lat double precision,[\s\S]*lng double precision/);
    expect(migration).toContain("round(candidate.lat::numeric, 3)::double precision as lat");
    expect(migration).toContain("round(candidate.lng::numeric, 3)::double precision as lng");
    expect(migration).toContain("photo.approval_status = 'approved'");
    expect(migration).toContain("photo.is_private = false");
    expect(migration).toContain("photo.is_avatar = true");
  });

  it("enforces freshness, self, block, deletion, onboarding, radius, ordering, and a database limit", () => {
    expect(migration).toContain("candidate.user_id <> p_user_id");
    expect(migration).toMatch(/center[\s\S]*updated_at > now\(\) - interval '10 minutes'/);
    expect(migration).toMatch(/candidate\.updated_at > now\(\) - interval '10 minutes'/);
    expect(migration).toContain("profile.deleted_at is null");
    expect(migration).toContain("profile.onboarding_completed = true");
    expect(migration).toContain("from public.user_blocks block");
    expect(migration).toContain("greatest(0.1, least(p_radius_km, 5))");
    expect(migration).toContain("order by candidates.distance_km, candidates.user_id");
    expect(migration).toMatch(/order by candidates\.distance_km, candidates\.user_id\s+limit 100;/);
  });

  it("keeps the shared client acknowledgement TTL safely inside the server window", () => {
    expect(LOCATION_SERVER_FRESHNESS_WINDOW_MS).toBe(10 * 60_000);
    expect(LOCATION_ACK_FRESHNESS_TTL_MS).toBeLessThan(LOCATION_SERVER_FRESHNESS_WINDOW_MS);
    expect(migration).toContain("interval '10 minutes'");
  });

  it("keeps the discovery RPC server-only with an empty search path", () => {
    expect(migration).toMatch(/language sql\s+security invoker\s+set search_path = ''/);
    expect(migration).toMatch(/revoke all on function public\.nearby_users_for_user\(uuid, double precision\)[\s\S]*from public, anon, authenticated;/);
    expect(migration).toMatch(/grant execute on function public\.nearby_users_for_user\(uuid, double precision\)[\s\S]*to service_role;/);
  });
});
