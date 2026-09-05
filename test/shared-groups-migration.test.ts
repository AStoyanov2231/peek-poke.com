import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parse, parsePlPgSQL } from "@libpg-query/parser";

const migration = readFileSync("supabase/migrations/20260814000000_shared_qr_groups.sql", "utf8");
const pgTap = readFileSync("supabase/tests/shared_qr_groups.test.sql", "utf8");
const lowerMigration = migration.toLowerCase();
const joinFunction = lowerMigration.slice(
  lowerMigration.indexOf("create or replace function public.create_or_join_shared_group"),
  lowerMigration.indexOf("create or replace function public.get_shared_groups"),
);
const sendFunction = lowerMigration.slice(
  lowerMigration.indexOf("create or replace function public.send_shared_group_message_transactional"),
  lowerMigration.indexOf("create or replace function public.mark_shared_group_read"),
);

describe("shared QR group migration", () => {
  it("parses PostgreSQL DDL and both transactional functions", async () => {
    const [ddl, join, send, pgTapSql] = await Promise.all([
      parse(migration),
      parsePlPgSQL(joinFunction),
      parsePlPgSQL(sendFunction),
      parse(pgTap),
    ]);
    expect(Math.floor(ddl.version / 10_000)).toBe(17);
    expect(ddl.stmts.length).toBeGreaterThan(15);
    expect(join.plpgsql_funcs.length).toBe(1);
    expect(send.plpgsql_funcs.length).toBe(1);
    expect(Math.floor(pgTapSql.version / 10_000)).toBe(17);
    expect(pgTap).toContain("select plan(26)");
  });

  it("keeps QR identity exact, bounded, opaque, atomic, and server-only", () => {
    expect(lowerMigration).toContain("qr_content_hash text not null unique");
    expect(lowerMigration).toContain("extensions.digest(pg_catalog.convert_to(p_qr_content, 'utf8'), 'sha256')");
    expect(lowerMigration).toContain("on conflict (qr_content_hash) do nothing");
    expect(joinFunction).toContain("select * into v_group");
    expect(joinFunction).toContain("for update");
    expect(joinFunction).toContain("on conflict (group_id, user_id) do nothing");
    expect(lowerMigration).toContain("raw text is never persisted");
    expect(lowerMigration).toContain("revoke all on function public.create_or_join_shared_group(uuid, text)");
    expect(lowerMigration).toContain("grant execute on function public.create_or_join_shared_group(uuid, text) to service_role");
  });

  it("authorizes every message, serializes the sequence, and emits a sanitized outbox hint", () => {
    expect(sendFunction).toContain("for update");
    expect(sendFunction).toContain("shared_group_members member");
    expect(lowerMigration).toContain("unique (group_id, client_id)");
    expect(sendFunction).toContain("idempotency_key_reused");
    expect(sendFunction).toContain("next_message_sequence = group_row.next_message_sequence + 1");
    expect(sendFunction).toContain("'shared_group.message.changed'");
    expect(sendFunction).toContain("'message_id', v_message.id");
    expect(sendFunction).not.toContain("p_qr_content");
  });
});
