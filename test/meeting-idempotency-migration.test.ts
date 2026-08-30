import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20260807190000_idempotent_coin_meetings.sql",
  "utf8",
).toLowerCase();

describe("idempotent meeting migration", () => {
  it("claims and locks a stable attempt before invoking the authoritative core", () => {
    const claim = migration.indexOf("insert into public.idempotency_records");
    const claimLock = migration.indexOf("for update", claim);
    const replay = migration.indexOf("'response_body', v_stored_body", claimLock);
    const core = migration.indexOf("public.record_meeting_for_user(p_actor_id, p_friend_id)", replay);
    const outbox = migration.indexOf("insert into public.outbox_events", core);
    const stored = migration.indexOf("update public.idempotency_records", outbox);

    expect(claim).toBeGreaterThan(-1);
    expect(claimLock).toBeGreaterThan(claim);
    expect(replay).toBeGreaterThan(claimLock);
    expect(core).toBeGreaterThan(replay);
    expect(outbox).toBeGreaterThan(core);
    expect(stored).toBeGreaterThan(outbox);
    expect(migration).not.toContain("p_distance");
    expect(migration).not.toContain("p_lat");
    expect(migration).not.toContain("p_lng");
  });

  it("stores exact public success and deterministic location/proximity errors", () => {
    expect(migration).toContain("'coin_meeting:record'");
    expect(migration).toContain("'location_stale'");
    expect(migration).toContain("'too_far'");
    expect(migration).toContain("'already_met', true");
    expect(migration).toContain("'balance', (v_meeting ->> 'balance_user')::integer");
    expect(migration).toContain("outbox_events_coin_meeting_awarded_uidx");
    expect(migration).toMatch(
      /on conflict \(event_type, aggregate_id\)\s+where event_type = 'coin\.meeting_awarded'\s+do nothing/,
    );
  });

  it("keeps the RPC service-only and fails migration-first", () => {
    expect(migration).toContain("to_regprocedure('public.record_meeting_for_user(uuid,uuid)') is null");
    expect(migration).toContain("to_regprocedure('public.record_meeting(uuid,uuid)') is null");
    expect(migration).toContain("security definer");
    expect(migration).toContain("set search_path = ''");
    expect(migration).toContain("from public, anon, authenticated");
    expect(migration).toContain("to service_role");
    expect(migration).toMatch(
      /revoke all on function public\.record_meeting\(uuid, uuid\)\s+from public, anon, authenticated/,
    );
    expect(migration).toMatch(
      /revoke all on function public\.record_meeting_for_user\(uuid, uuid\)\s+from public, anon, authenticated/,
    );
  });
});
