import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260908113140_free_social_graph_and_coarse_nearby.sql"),
  "utf8",
);

function functionBody(name: string) {
  const start = migration.indexOf(`function public.${name}(`);
  expect(start).toBeGreaterThanOrEqual(0);
  const end = migration.indexOf("\n$$;", start);
  expect(end).toBeGreaterThan(start);
  return migration.slice(start, end);
}

describe("free social graph migration", () => {
  it("uses valid PostgreSQL special-expression syntax", () => {
    expect(migration).not.toMatch(/pg_catalog\.(least|greatest|coalesce)\s*\(/);
  });

  it("makes new friend requests explicitly zero-cost while preserving legacy escrow refunds", () => {
    const request = functionBody("send_friend_request_idempotent");
    const removal = functionBody("friendship_removal_core");

    expect(request).toContain("insert into public.friendship_request_charges");
    expect(request).toContain("values (v_friendship.id, 0)");
    expect(request).not.toContain("update public.user_coins");
    expect(request).not.toContain("insert into public.coin_transactions");
    expect(removal).toContain("if v_charge_amount is null then");
    expect(removal).toContain("request_cancelled_refund");
    expect(removal).toContain("on conflict (friendship_id) do nothing");
  });

  it("keeps direct-message creation and nearby output free of payment and precise coordinates", () => {
    const threads = functionBody("create_or_find_thread");
    const nearby = functionBody("nearby_users_for_user");

    expect(threads).not.toContain("update public.user_coins");
    expect(threads).not.toContain("insert into public.coin_transactions");
    expect(nearby).toContain("round(candidate.lat::numeric, 2)");
    expect(nearby).toContain("round(candidate.lng::numeric, 2)");
    expect(nearby).toContain("public.user_blocks");
    expect(nearby).toContain("updated_at > now() - interval '10 minutes'");
  });
});
