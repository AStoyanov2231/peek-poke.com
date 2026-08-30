import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parse, parsePlPgSQL } from "@libpg-query/parser";

const migration = readFileSync(
  new URL("../supabase/migrations/20260807210828_harden_dm_read_receipts.sql", import.meta.url),
  "utf8",
).toLowerCase();
const pgTap = readFileSync(
  new URL("../supabase/tests/dm_read_receipts.test.sql", import.meta.url),
  "utf8",
).toLowerCase();

type LegacyMessage = { sequence: number; senderId: string; unread: boolean };

function derivedSafeCursor(
  nextSequence: number,
  userId: string,
  messages: LegacyMessage[],
) {
  const earliestIncomingUnread = messages
    .filter((message) => message.senderId !== userId && message.unread)
    .reduce<number | null>(
      (earliest, message) => earliest === null
        ? message.sequence
        : Math.min(earliest, message.sequence),
      null,
    );
  return Math.max(0, Math.min(nextSequence, earliestIncomingUnread === null
    ? nextSequence
    : earliestIncomingUnread - 1));
}

function mergeExistingCursor(existing: number | null, derived: number, nextSequence: number) {
  if (existing !== null && (existing < 0 || existing > nextSequence)) {
    throw new Error("invalid existing cursor");
  }
  return Math.max(existing ?? derived, derived);
}

describe("transactional DM read-receipt migration", () => {
  it("parses the migration and pgTAP fixture with PostgreSQL 17", async () => {
    const [migrationSql, migrationPlPgSql, pgTapSql] = await Promise.all([
      parse(migration),
      parsePlPgSQL(migration),
      parse(pgTap),
    ]);
    expect(Math.floor(migrationSql.version / 10_000)).toBe(17);
    expect(migrationSql.stmts).toHaveLength(30);
    expect(migrationPlPgSql.plpgsql_funcs).toHaveLength(6);
    expect(Math.floor(pgTapSql.version / 10_000)).toBe(17);
    expect(pgTap).toContain("select plan(30)");
  });

  it("monotonically repairs every real participant from message history before enforcing coverage", () => {
    const repairStart = migration.indexOf("create or replace function public.repair_dm_thread_member_cursors");
    const backfill = migration.indexOf("insert into public.dm_thread_members");
    const invokeRepair = migration.indexOf("select public.repair_dm_thread_member_cursors();");
    const repairEnd = migration.indexOf("\n$$;", repairStart);
    const repairBody = migration.slice(repairStart, repairEnd);
    const preflight = migration.indexOf("member.last_read_sequence < 0", repairStart);
    expect(backfill).toBeGreaterThan(-1);
    expect(migration).toContain("values (thread.participant_1_id), (thread.participant_2_id)");
    expect(migration).toContain("select min(message.sequence) - 1");
    expect(migration).toContain("message.sender_id <> participant.user_id");
    expect(migration).toContain("message.is_read = false");
    expect(preflight).toBeGreaterThan(repairStart);
    expect(preflight).toBeLessThan(backfill);
    expect(migration).toContain("greatest(\n      coalesce(dm_thread_members.last_read_sequence, excluded.last_read_sequence),");
    expect(migration).toContain("dm_thread_members.last_read_sequence < excluded.last_read_sequence");
    expect(migration).toContain("updated_at = now()");
    expect(invokeRepair).toBeGreaterThan(repairEnd);
    expect(migration).toContain("dm_thread_members coverage is incomplete or ambiguous");
    expect(migration).toContain("dm_thread_members contains invalid ownership or cursor state");
    expect(repairBody).not.toContain("outbox_events");
    expect(repairBody).not.toContain("message.changed");
  });

  it("models stale, greater, null, invalid, and per-participant legacy histories", () => {
    const participantA = "participant-a";
    const participantB = "participant-b";
    const messages: LegacyMessage[] = [
      { sequence: 1, senderId: participantA, unread: false },
      { sequence: 2, senderId: participantB, unread: false },
      { sequence: 3, senderId: participantA, unread: true },
      { sequence: 4, senderId: participantB, unread: true },
    ];
    const derivedA = derivedSafeCursor(4, participantA, messages);
    const derivedB = derivedSafeCursor(4, participantB, messages);

    expect(derivedA).toBe(3);
    expect(derivedB).toBe(2);
    expect(mergeExistingCursor(0, derivedA, 4)).toBe(3);
    expect(mergeExistingCursor(3, derivedB, 4)).toBe(3);
    expect(mergeExistingCursor(null, derivedA, 4)).toBe(3);
    expect(() => mergeExistingCursor(-1, derivedA, 4)).toThrow("invalid existing cursor");
    expect(() => mergeExistingCursor(5, derivedA, 4)).toThrow("invalid existing cursor");
  });

  it("derives membership and cursor from the server-owned thread member row under a lock", () => {
    expect(migration).toContain("join public.dm_thread_members member");
    expect(migration).toContain("member.user_id = p_user_id");
    expect(migration).toContain("thread.id = p_thread_id");
    expect(migration).toContain("coalesce(member.last_read_sequence, 0)");
    expect(migration).toContain("for update of member");
    expect(migration).toContain("if not found then");
    expect(migration).toContain("'error', 'thread_not_found'");
  });

  it("advances and publishes only when the durable cursor moves", () => {
    const conditional = migration.indexOf("if v_sequence > v_last_read_sequence then");
    const update = migration.indexOf("update public.dm_thread_members");
    const outbox = migration.indexOf("insert into public.outbox_events");
    const end = migration.indexOf("end if;", conditional);
    expect(conditional).toBeGreaterThan(-1);
    expect(update).toBeGreaterThan(conditional);
    expect(outbox).toBeGreaterThan(update);
    expect(end).toBeGreaterThan(outbox);
    expect(migration).toContain("'last_read_sequence', v_sequence");
  });

  it("exposes the privileged RPC only to the backend service role", () => {
    expect(migration).toContain("security definer");
    expect(migration).toContain("set search_path = ''");
    expect(migration).toContain("from public, anon, authenticated");
    expect(migration).toContain("to service_role");
  });

  it("ships runtime gates for cursor creation, replay, ownership, bounds, and privileges", () => {
    expect(pgTap).toContain("a new thread has exactly two cursor rows");
    expect(pgTap).toContain("a lost-response retry returns the exact durable result");
    expect(pgTap).toContain("a no-op retry emits no duplicate read hint");
    expect(pgTap).toContain("a nonparticipant cursor row is rejected");
    expect(pgTap).toContain("a cursor cannot advance beyond the durable thread sequence");
    expect(pgTap).toContain("thread participants cannot drift away from durable cursor ownership");
    expect(pgTap).toContain("a non-null zero cursor advances to the safe incoming-message prefix while own messages are ignored");
    expect(pgTap).toContain("an existing cursor greater than the derived safe prefix is preserved");
    expect(pgTap).toContain("a null partial-rollout cursor is repaired from message history");
    expect(pgTap).toContain("repair rejects an existing cursor ahead of the real thread sequence");
    expect(pgTap).toContain("cursor repair emits no read outbox or broadcast hint");
    expect(pgTap).toContain("service_role can execute the read rpc");
  });
});
