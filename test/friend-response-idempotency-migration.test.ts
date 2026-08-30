import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  FRIEND_RESPONSE_OPERATION,
  friendResponseHash,
} from "@/lib/friend-response-idempotency";

const migration = readFileSync(
  "supabase/migrations/20260807134834_atomic_friend_response_idempotency.sql",
  "utf8",
);

class ModelLock {
  private tail = Promise.resolve();

  acquire(): Promise<() => void> {
    let release = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const acquired = this.tail;
    this.tail = acquired.then(() => held);
    return acquired.then(() => release);
  }
}

function stableParticipantOrder(left: string, right: string): [string, string] {
  return left < right ? [left, right] : [right, left];
}

async function modelConcurrentAccept(
  left: string,
  right: string,
  friendCounts: Map<string, number>,
  locks: Map<string, ModelLock>,
  limit: number,
) {
  const order = stableParticipantOrder(left, right);
  const releases: Array<() => void> = [];

  try {
    for (const participant of order) {
      let lock = locks.get(participant);
      if (!lock) {
        lock = new ModelLock();
        locks.set(participant, lock);
      }
      releases.push(await lock.acquire());
    }

    const leftCount = friendCounts.get(left) ?? 0;
    const rightCount = friendCounts.get(right) ?? 0;
    if (leftCount >= limit || rightCount >= limit) {
      return { accepted: false, order };
    }

    // Yield while both identity locks are held to exercise interleaving.
    await Promise.resolve();
    friendCounts.set(left, leftCount + 1);
    friendCounts.set(right, rightCount + 1);
    return { accepted: true, order };
  } finally {
    for (const release of releases.reverse()) release();
  }
}

describe("atomic friend-response idempotency migration", () => {
  it("fails closed unless the durable-workflow foundation exists", () => {
    expect(migration).toContain("pg_catalog.to_regclass('public.idempotency_records') is null");
    expect(migration).toContain("pg_catalog.to_regclass('public.outbox_events') is null");
    expect(migration).not.toContain("pg_catalog.to_regprocedure('public.respond_friend_request");
  });

  it("atomically claims, hash-checks, and replays sequential or concurrent same-key calls", () => {
    expect(migration).toMatch(
      /on conflict \(actor_id, operation, key\) do nothing;[\s\S]*for update;/,
    );
    expect(migration).toContain("if v_stored_hash is distinct from p_request_hash then");
    expect(migration).toContain("'code', 'IDEMPOTENCY_KEY_REUSED'");
    expect(migration).toMatch(
      /if v_stored_status is not null and v_stored_body is not null then[\s\S]*'replayed', true/,
    );
    expect(migration).toContain("if v_claimed <> 1 then");
  });

  it("locks both participant identities in stable order before pair and row locks", () => {
    const stableOrder = migration.indexOf("v_requester_id::text < v_addressee_id::text");
    const firstParticipantLock = migration.indexOf(
      "'friend-limit:' || v_first_participant_id::text",
      stableOrder,
    );
    const secondParticipantLock = migration.indexOf(
      "'friend-limit:' || v_second_participant_id::text",
      firstParticipantLock,
    );
    const pairLock = migration.indexOf("v_requester_id::text || ':'", secondParticipantLock);
    const rowLock = migration.indexOf("for update;", pairLock);
    const pendingGate = migration.indexOf("v_friendship.status <> 'pending'", rowLock);
    const mutation = migration.indexOf("update public.friendships friendship", pendingGate);

    expect(stableOrder).toBeGreaterThan(-1);
    expect(firstParticipantLock).toBeGreaterThan(stableOrder);
    expect(secondParticipantLock).toBeGreaterThan(firstParticipantLock);
    expect(pairLock).toBeGreaterThan(secondParticipantLock);
    expect(rowLock).toBeGreaterThan(pairLock);
    expect(pendingGate).toBeGreaterThan(rowLock);
    expect(mutation).toBeGreaterThan(pendingGate);
    expect(migration).not.toContain("public.respond_friend_request(");
    expect(migration).toContain("'FRIEND_REQUEST_ALREADY_RESPONDED'");
    expect(migration).toContain("v_friendship.addressee_id <> p_actor_id");
    expect(migration).toContain("friend response did not persist declined state");
  });

  it("checks both participant limits under identity locks immediately before acceptance", () => {
    const secondParticipantLock = migration.indexOf(
      "'friend-limit:' || v_second_participant_id::text",
    );
    const requesterCount = migration.indexOf("into v_requester_friend_count", secondParticipantLock);
    const addresseeCount = migration.indexOf("into v_addressee_friend_count", requesterCount);
    const addresseeLimit = migration.indexOf("if v_addressee_friend_count >=", addresseeCount);
    const requesterLimit = migration.indexOf("elsif v_requester_friend_count >=", addresseeLimit);
    const acceptance = migration.indexOf("update public.friendships friendship", requesterLimit);

    expect(requesterCount).toBeGreaterThan(secondParticipantLock);
    expect(addresseeCount).toBeGreaterThan(requesterCount);
    expect(addresseeLimit).toBeGreaterThan(addresseeCount);
    expect(requesterLimit).toBeGreaterThan(addresseeLimit);
    expect(acceptance).toBeGreaterThan(requesterLimit);
    expect(migration).toContain("then 100 else 20 end");
    expect(migration).toContain("'FRIEND_LIMIT_REACHED'");
    expect(migration).toContain("'REQUESTER_LIMIT_REACHED'");
    expect(migration).toContain("'You have reached your friend limit.'");
    expect(migration).toContain("'The requester has reached their friend limit.'");
  });

  it("models concurrent accepts sharing a participant without exceeding the limit", async () => {
    const shared = "22222222-2222-4222-8222-222222222222";
    const friendCounts = new Map<string, number>([[shared, 19]]);
    const locks = new Map<string, ModelLock>();

    expect(stableParticipantOrder(
      "33333333-3333-4333-8333-333333333333",
      shared,
    )).toEqual(stableParticipantOrder(
      shared,
      "33333333-3333-4333-8333-333333333333",
    ));

    const results = await Promise.all([
      modelConcurrentAccept(
        "11111111-1111-4111-8111-111111111111",
        shared,
        friendCounts,
        locks,
        20,
      ),
      modelConcurrentAccept(
        shared,
        "33333333-3333-4333-8333-333333333333",
        friendCounts,
        locks,
        20,
      ),
    ]);

    expect(results.filter((result) => result.accepted)).toHaveLength(1);
    expect(results.filter((result) => !result.accepted)).toHaveLength(1);
    expect(friendCounts.get(shared)).toBe(20);
    for (const result of results) {
      expect(result.order).toEqual([...result.order].sort());
    }
  });

  it("persists the exact response before emitting one durable event", () => {
    const responseUpdate = migration.indexOf("update public.idempotency_records record");
    const outboxInsert = migration.indexOf("insert into public.outbox_events", responseUpdate);

    expect(responseUpdate).toBeGreaterThan(-1);
    expect(outboxInsert).toBeGreaterThan(responseUpdate);
    expect(migration).toMatch(
      /set response_status = v_response_status,\s+response_body = v_response_body/s,
    );
    expect(migration).toContain("where event_type = 'friendship.responded'");
    expect(migration).toContain("'friendship.responded'");
    expect(migration).toMatch(
      /insert into public\.outbox_events[\s\S]*on conflict \(event_type, aggregate_id\)\s+where event_type = 'friendship\.responded'\s+do nothing;/,
    );
    expect(migration).toContain("'status', 'accepted'");
    expect(migration).toContain("'status', 'declined'");
  });

  it("keeps the privileged RPC service-role-only with an empty search path", () => {
    expect(migration).toMatch(
      /create or replace function public\.respond_friend_request_idempotent\([\s\S]*language plpgsql\s+security definer\s+set search_path = ''/,
    );
    expect(migration).toMatch(
      /revoke all on function public\.respond_friend_request_idempotent\([\s\S]*\) from public, anon, authenticated;/,
    );
    expect(migration).toMatch(
      /grant execute on function public\.respond_friend_request_idempotent\([\s\S]*\) to service_role;/,
    );
  });

  it("binds actor, operation, friendship, action, and validated body in the hash", () => {
    const actorA = "11111111-1111-4111-8111-111111111111";
    const actorB = "22222222-2222-4222-8222-222222222222";
    const friendshipA = "33333333-3333-4333-8333-333333333333";
    const friendshipB = "44444444-4444-4444-8444-444444444444";

    expect(FRIEND_RESPONSE_OPERATION).toBe("friend_request:respond");
    const accepted = friendResponseHash(actorA, friendshipA, { status: "accepted" });
    expect(accepted).toHaveLength(64);
    expect(accepted).not.toBe(friendResponseHash(actorB, friendshipA, { status: "accepted" }));
    expect(accepted).not.toBe(friendResponseHash(actorA, friendshipB, { status: "accepted" }));
    expect(accepted).not.toBe(friendResponseHash(actorA, friendshipA, { status: "declined" }));
    expect(() => friendResponseHash(actorA, friendshipA, {
      status: "accepted",
      unvalidated: true,
    })).toThrow();
  });
});
