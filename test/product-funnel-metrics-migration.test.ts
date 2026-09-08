import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260908113529_private_product_funnel_metrics.sql"),
  "utf8",
);

describe("private product funnel metrics migration", () => {
  it("uses bounded, service-only aggregates without sensitive payload columns", () => {
    expect(migration).toContain("p_end_day - p_start_day > 30");
    expect(migration).toContain("first_activation");
    expect(migration).toContain("current_availability_records_created");
    expect(migration).toContain("availability.created_at >= (p_start_day::timestamp at time zone 'UTC')");
    expect(migration).toContain("plans_from_pokes_counts");
    expect(migration).toContain("plan_join_idempotency");
    expect(migration).toContain("meetup_acknowledgements");
    expect(migration).toContain("product_weekly_social_activity_metrics");
    expect(migration).toContain("repeat_week_socially_active_accounts");
    expect(migration).toContain("Passive reads are intentionally excluded.");
    expect(migration).toContain("grant execute on function public.product_daily_funnel_metrics(date, date) to service_role");
    expect(migration).not.toContain("poke.note");
    expect(migration).not.toContain("location.lat");
  });
});
