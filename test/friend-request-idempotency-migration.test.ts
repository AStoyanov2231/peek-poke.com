import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  FRIEND_REQUEST_CREATE_OPERATION,
  friendRequestHash,
} from "@/lib/friend-request-idempotency";

const migration = readFileSync(
  "supabase/migrations/20260807131003_atomic_friend_request_idempotency.sql",
  "utf8",
);

describe("atomic friend-request idempotency migration", () => {
  it("fails closed unless the durable workflow foundation was applied first", () => {
    expect(migration).toContain("pg_catalog.to_regclass('public.idempotency_records') is null");
    expect(migration).toContain("pg_catalog.to_regclass('public.outbox_events') is null");
    expect(migration).toContain("20260729235452_durable_workflows.sql must be applied first");
  });

  it("serializes a scoped claim and replays only the same request hash", () => {
    expect(migration).toMatch(/on conflict \(actor_id, operation, key\) do nothing;[\s\S]*for update;/);
    expect(migration).toMatch(/where record\.actor_id = p_actor_id\s+and record\.operation = p_operation\s+and record\.key = p_idempotency_key/s);
    expect(migration).toContain("if v_stored_hash is distinct from p_request_hash then");
    expect(migration).toContain("'code', 'IDEMPOTENCY_KEY_REUSED'");
    expect(migration).toMatch(/if v_stored_status is not null and v_stored_body is not null then[\s\S]*'replayed', true/);
  });

  it("locks the pair and wallet before spending and persists the exact response atomically", () => {
    const pairLock = migration.indexOf("when p_actor_id::text < p_addressee_id::text");
    const walletLock = migration.indexOf("from public.user_coins wallet", pairLock);
    const coinUpdate = migration.indexOf("update public.user_coins wallet", walletLock);
    const friendshipInsert = migration.indexOf("insert into public.friendships", coinUpdate);
    const responseUpdate = migration.indexOf("update public.idempotency_records record", friendshipInsert);
    const outboxInsert = migration.indexOf("insert into public.outbox_events", responseUpdate);

    expect(pairLock).toBeGreaterThan(-1);
    expect(walletLock).toBeGreaterThan(pairLock);
    expect(migration.indexOf("for update;", walletLock)).toBeGreaterThan(walletLock);
    expect(coinUpdate).toBeGreaterThan(walletLock);
    expect(friendshipInsert).toBeGreaterThan(coinUpdate);
    expect(responseUpdate).toBeGreaterThan(friendshipInsert);
    expect(outboxInsert).toBeGreaterThan(responseUpdate);
    expect(migration).toMatch(/set response_status = v_response_status,\s+response_body = v_response_body/s);
    expect(migration).toContain("where event_type = 'friendship.requested'");
  });

  it("keeps the privileged RPC service-only with an empty search path", () => {
    expect(migration).toMatch(/create or replace function public\.send_friend_request_idempotent\([\s\S]*language plpgsql\s+security definer\s+set search_path = ''/);
    expect(migration).toMatch(/revoke all on function public\.send_friend_request_idempotent\([\s\S]*\) from public, anon, authenticated;/);
    expect(migration).toMatch(/grant execute on function public\.send_friend_request_idempotent\([\s\S]*\) to service_role;/);
    expect(migration).not.toContain("public.send_friend_request(");
  });

  it("binds actor, operation, target, and validated body into the canonical hash", () => {
    const actorA = "11111111-1111-4111-8111-111111111111";
    const actorB = "22222222-2222-4222-8222-222222222222";
    const targetA = "33333333-3333-4333-8333-333333333333";
    const targetB = "44444444-4444-4444-8444-444444444444";

    expect(FRIEND_REQUEST_CREATE_OPERATION).toBe("friend_request:create");
    expect(friendRequestHash(actorA, { addressee_id: targetA })).toHaveLength(64);
    expect(friendRequestHash(actorA, { addressee_id: targetA })).not.toBe(
      friendRequestHash(actorB, { addressee_id: targetA }),
    );
    expect(friendRequestHash(actorA, { addressee_id: targetA })).not.toBe(
      friendRequestHash(actorA, { addressee_id: targetB }),
    );
    expect(() => friendRequestHash(actorA, {
      addressee_id: targetA,
      unvalidated: true,
    })).toThrow();
  });
});
