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
    expect(pgTapSql.stmts.length).toBeGreaterThan(30);
  });

  it("keeps the executable database behavior fixture parseable", async () => {
    const parsed = await parse(pgTap);
    expect(parsed.stmts.length).toBeGreaterThan(30);
  });
});
