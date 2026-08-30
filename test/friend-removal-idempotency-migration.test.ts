import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { blockUserHash, USER_BLOCK_OPERATION } from "@/lib/block-user-idempotency";

const migration = readFileSync(resolve(
  process.cwd(),
  "supabase/migrations/20260807141926_atomic_friend_removal_idempotency.sql",
), "utf8").toLowerCase();

describe("atomic friendship removal migration", () => {
  it("fails migration-first and scopes a durable refund claim by friendship", () => {
    expect(migration).toContain("to_regclass('public.idempotency_records') is null");
    expect(migration).toContain("to_regclass('public.outbox_events') is null");
    expect(migration).toContain("to_regclass('public.friendship_mutation_rate_limits') is null");
    expect(migration).toContain("create table if not exists public.friendship_refunds");
    expect(migration).toMatch(/friendship_id uuid primary key/);
    expect(migration).toContain("coin_transaction_id uuid unique");
  });

  it("serializes DELETE, block, request, and response on the normalized pair", () => {
    const core = migration.indexOf("create or replace function public.friendship_removal_core");
    const block = migration.indexOf("create or replace function public.block_user_with_friendship_fence");
    const idempotent = migration.indexOf("create or replace function public.remove_friendship_idempotent");
    expect(core).toBeGreaterThan(-1);
    expect(block).toBeGreaterThan(core);
    expect(idempotent).toBeGreaterThan(block);
    expect(migration.slice(core, block)).toContain("pg_advisory_xact_lock");
    expect(migration.slice(core, block)).toContain("for update");
    expect(migration.slice(block, idempotent)).toContain("pg_advisory_xact_lock");
    expect(migration.slice(block, idempotent)).toContain("public.friendship_removal_core");
  });

  it("claims refund before one wallet/ledger write and deletes in the same transaction", () => {
    const coreStart = migration.indexOf("create or replace function public.friendship_removal_core");
    const coreEnd = migration.indexOf("revoke all on function public.friendship_removal_core", coreStart);
    const core = migration.slice(coreStart, coreEnd);
    const claim = core.indexOf("insert into public.friendship_refunds");
    const guardedLedger = core.indexOf("if v_refund_claimed = 1 then");
    const ledger = core.indexOf("insert into public.coin_transactions", guardedLedger);
    const deletion = core.indexOf("delete from public.friendships", ledger);
    const outbox = core.indexOf("insert into public.outbox_events", deletion);
    expect(claim).toBeGreaterThan(-1);
    expect(guardedLedger).toBeGreaterThan(claim);
    expect(ledger).toBeGreaterThan(guardedLedger);
    expect(deletion).toBeGreaterThan(ledger);
    expect(outbox).toBeGreaterThan(deletion);
  });

  it("refunds the immutable requester before deletion regardless of the winning participant", () => {
    const coreStart = migration.indexOf("create or replace function public.friendship_removal_core");
    const coreEnd = migration.indexOf("revoke all on function public.friendship_removal_core", coreStart);
    const core = migration.slice(coreStart, coreEnd);
    const immutablePairRead = core.indexOf(
      "select friendship.requester_id, friendship.addressee_id",
    );
    const pairLock = core.indexOf("perform pg_catalog.pg_advisory_xact_lock", immutablePairRead);
    const lockedRowRead = core.indexOf("select friendship.*", pairLock);
    const rowLock = core.indexOf("for update", lockedRowRead);
    const authorization = core.indexOf(
      "p_actor_id not in (v_friendship.requester_id, v_friendship.addressee_id)",
      rowLock,
    );
    const pendingEligibility = core.indexOf("if v_friendship.status = 'pending' then", authorization);
    const claim = core.indexOf("insert into public.friendship_refunds", pendingEligibility);
    const walletLock = core.indexOf("where wallet.user_id = v_friendship.requester_id", claim);
    const guardedLedger = core.indexOf("if v_refund_claimed = 1 then", walletLock);
    const ledger = core.indexOf("insert into public.coin_transactions", guardedLedger);
    const deletion = core.indexOf("delete from public.friendships", ledger);
    const outbox = core.indexOf("insert into public.outbox_events", deletion);

    expect(immutablePairRead).toBeGreaterThan(-1);
    expect(pairLock).toBeGreaterThan(immutablePairRead);
    expect(lockedRowRead).toBeGreaterThan(pairLock);
    expect(rowLock).toBeGreaterThan(lockedRowRead);
    expect(authorization).toBeGreaterThan(rowLock);
    expect(pendingEligibility).toBeGreaterThan(authorization);
    expect(claim).toBeGreaterThan(pendingEligibility);
    expect(walletLock).toBeGreaterThan(claim);
    expect(guardedLedger).toBeGreaterThan(walletLock);
    expect(ledger).toBeGreaterThan(guardedLedger);
    expect(deletion).toBeGreaterThan(ledger);
    expect(outbox).toBeGreaterThan(deletion);

    const eligibility = core.slice(pendingEligibility, claim);
    expect(eligibility).not.toContain("requester_id = p_actor_id");
    expect(core).toMatch(
      /insert into public\.user_coins[\s\S]*values \(v_friendship\.requester_id, 5\)/,
    );
    expect(core).toMatch(
      /insert into public\.coin_transactions[\s\S]*values \(\s*v_friendship\.requester_id,/,
    );
  });

  it("keeps refund ownership private when the addressee wins removal", () => {
    const coreStart = migration.indexOf("create or replace function public.friendship_removal_core");
    const coreEnd = migration.indexOf("revoke all on function public.friendship_removal_core", coreStart);
    const core = migration.slice(coreStart, coreEnd);
    const publicOwnership = core.indexOf(
      "v_refunded := p_actor_id = v_friendship.requester_id",
    );
    const deletion = core.indexOf("delete from public.friendships", publicOwnership);
    const response = core.indexOf("return pg_catalog.jsonb_build_object", deletion);

    expect(publicOwnership).toBeGreaterThan(-1);
    expect(deletion).toBeGreaterThan(publicOwnership);
    expect(response).toBeGreaterThan(deletion);
    expect(core.slice(response)).toContain(
      "'balance', case when v_refunded then v_balance else null end",
    );
    expect(core).toContain("'refund_applied', v_refund_applied");
    expect(core).toMatch(
      /'refund_owner_id', case\s+when v_refund_applied then v_friendship\.requester_id\s+else null\s+end/,
    );
    expect(core).not.toMatch(/'refund_(?:amount|balance)'/);
  });

  it("atomically claims/replays exact responses and does not persist unexpected 500s", () => {
    const rpcStart = migration.indexOf("create or replace function public.remove_friendship_idempotent");
    const rpc = migration.slice(rpcStart);
    const claim = rpc.indexOf("insert into public.idempotency_records");
    const claimLock = rpc.indexOf("for update", claim);
    const exactReplay = rpc.indexOf("'response_body', v_stored_body", claimLock);
    const mutation = rpc.indexOf("public.friendship_removal_core", exactReplay);
    const stored = rpc.indexOf("update public.idempotency_records", mutation);
    expect(claim).toBeGreaterThan(-1);
    expect(claimLock).toBeGreaterThan(claim);
    expect(exactReplay).toBeGreaterThan(claimLock);
    expect(mutation).toBeGreaterThan(exactReplay);
    expect(stored).toBeGreaterThan(mutation);
    expect(rpc).not.toContain("when others");
  });

  it("bounds block denial before claim while preserving claimed-key replay", () => {
    const start = migration.indexOf("create or replace function public.block_user_idempotent");
    const rpc = migration.slice(start);
    const initialLookup = rpc.indexOf("record.request_hash");
    const limiterLock = rpc.indexOf("'friendship-rate:'", initialLookup);
    const secondLookup = rpc.indexOf("record.request_hash", limiterLock);
    const denial = rpc.indexOf("if v_rate_count >= v_rate_limit then", secondLookup);
    const deniedReturn = rpc.indexOf("'response_status', 429", denial);
    const claim = rpc.indexOf("insert into public.idempotency_records", deniedReturn);
    const targetCheck = rpc.indexOf("from public.profiles profile", claim);
    const mutation = rpc.indexOf("public.block_user_with_friendship_fence", targetCheck);
    const storedRetry = rpc.indexOf("response_retry_after_seconds = v_retry_after_seconds", mutation);
    expect(start).toBeGreaterThan(-1);
    expect(initialLookup).toBeGreaterThan(-1);
    expect(limiterLock).toBeGreaterThan(initialLookup);
    expect(secondLookup).toBeGreaterThan(limiterLock);
    expect(denial).toBeGreaterThan(secondLookup);
    expect(deniedReturn).toBeGreaterThan(denial);
    expect(claim).toBeGreaterThan(deniedReturn);
    expect(targetCheck).toBeGreaterThan(claim);
    expect(mutation).toBeGreaterThan(targetCheck);
    expect(storedRetry).toBeGreaterThan(mutation);
    expect(rpc.match(/insert into public\.idempotency_records/g)).toHaveLength(1);
    expect(rpc).toContain("v_rate_limit integer := 20");
    expect(rpc).toContain("v_rate_window_seconds integer := 86400");
    expect(rpc).toContain("denied_response_body = v_bucket_denied_body");
    expect(rpc).toContain("denied_retry_after_seconds = v_bucket_denied_retry_after_seconds");
    expect(rpc).toContain("rejected keys are deliberately unclaimed");
    const denialSegment = rpc.slice(denial, claim);
    expect(denialSegment).toContain("'error', 'too many block requests'");
    expect(denialSegment).toContain("'message', 'too many block requests'");
    expect(denialSegment).toContain("'code', 'rate_limited'");
    expect(denialSegment).toContain("'request_id', null");
    expect(rpc).toContain("'retry_after_seconds', v_stored_retry_after_seconds");
    expect(rpc).not.toContain("when others");
  });

  it("binds allowed block claims to actor, operation, and target", () => {
    const actorA = "11111111-1111-4111-8111-111111111111";
    const actorB = "22222222-2222-4222-8222-222222222222";
    const targetA = "33333333-3333-4333-8333-333333333333";
    const targetB = "44444444-4444-4444-8444-444444444444";

    expect(USER_BLOCK_OPERATION).toBe("user:block");
    expect(blockUserHash(actorA, targetA)).toHaveLength(64);
    expect(blockUserHash(actorA, targetA)).not.toBe(blockUserHash(actorB, targetA));
    expect(blockUserHash(actorA, targetA)).not.toBe(blockUserHash(actorA, targetB));
  });

  it("keeps every privileged function service-only with an empty search path", () => {
    for (const signature of [
      "public.friendship_removal_core(uuid, uuid, text)",
      "public.unfriend(uuid, uuid)",
      "public.block_user_with_friendship_fence(uuid, uuid)",
      "public.block_user(uuid, uuid)",
      "public.remove_friendship_idempotent(\n  uuid, uuid, text, text, text, text\n)",
      "public.block_user_idempotent(\n  uuid, uuid, text, text, text, text\n)",
    ]) {
      expect(migration).toContain(`revoke all on function ${signature}`);
    }
    expect(migration.match(/security definer/g)?.length).toBe(5);
    expect(migration.match(/set search_path = ''/g)?.length).toBe(6);
  });

  it("deduplicates the durable removed event by friendship aggregate", () => {
    expect(migration).toContain("outbox_events_friendship_removed_uidx");
    expect(migration).toContain("where event_type = 'friendship.removed'");
    expect(migration).toMatch(
      /on conflict \(event_type, aggregate_id\)\s+where event_type = 'friendship\.removed'\s+do nothing;/,
    );
  });

  it("deduplicates a durable block convergence event by the persistent block row", () => {
    expect(migration).toContain("outbox_events_user_blocked_uidx");
    expect(migration).toMatch(/'user\.blocked',[\s\S]*v_block_id::text/);
    expect(migration).toMatch(
      /on conflict \(event_type, aggregate_id\)\s+where event_type = 'user\.blocked'\s+do nothing;/,
    );
    expect(migration).toContain("pg_catalog.coalesce(v_friendship_id, v_block_id)");
  });
});
