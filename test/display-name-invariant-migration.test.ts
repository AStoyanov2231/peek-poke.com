import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { parse, parsePlPgSQL } from "@libpg-query/parser";
import { beforeAll, describe, expect, it } from "vitest";

const migrationPath = fileURLToPath(new URL(
  "../supabase/migrations/20260807221500_enforce_display_name_invariant.sql",
  import.meta.url,
));
const pgTapPath = fileURLToPath(new URL(
  "../supabase/tests/display_name_invariant.test.sql",
  import.meta.url,
));

let migration = "";
let pgTap = "";

beforeAll(async () => {
  [migration, pgTap] = await Promise.all([
    readFile(migrationPath, "utf8"),
    readFile(pgTapPath, "utf8"),
  ]);
});

describe("display-name invariant migration", () => {
  it("parses every migration statement with the real PostgreSQL 17 libpg_query parser", async () => {
    const parsed = await parse(migration);
    const statementTypes = parsed.stmts.map((statement) => Object.keys(statement.stmt)[0]);

    expect(Math.floor(parsed.version / 10_000)).toBe(17);
    expect(statementTypes).toEqual(["LockStmt", "DoStmt", "AlterTableStmt"]);
  });

  it("parses the incompatibility preflight with the real PL/pgSQL parser", async () => {
    const parsed = await parsePlPgSQL(migration);
    const tree = JSON.stringify(parsed);

    expect(parsed.plpgsql_funcs).toHaveLength(1);
    expect(tree).toContain("PLpgSQL_stmt_if");
    expect(tree).toContain("PLpgSQL_stmt_raise");
    expect(tree).toContain("check_violation");
    expect(tree).toContain("Sample profile ids");
    expect(tree).toContain("no values were rewritten");
  });

  it("locks writes, fails clearly on incompatible rows, and never silently rewrites profile data", () => {
    expect(migration).toMatch(/lock table public\.profiles in share row exclusive mode/i);
    expect(migration).toMatch(/Cannot enforce profiles display-name invariant/i);
    expect(migration).toMatch(/limit 10/i);
    expect(migration).not.toMatch(/\b(?:update|insert into|delete from)\s+public\.profiles\b/i);
    expect(migration).not.toMatch(/create\s+(?:or\s+replace\s+)?function/i);
    expect(migration).not.toMatch(/\bgrant\b/i);
  });

  it("uses only schema-qualified immutable catalog operations for the check", () => {
    expect(migration).toContain("pg_catalog.char_length(display_name) between 1 and 50");
    expect(migration).toContain("pg_catalog.btrim(");
    expect(migration).toContain("pg_catalog.normalize(display_name, 'NFC')");
    expect(migration).toContain("display_name is null");
    expect(migration).toContain("profiles_display_name_canonical_check");
  });

  it("enumerates JavaScript Unicode trim characters and every forbidden control/bidi range", () => {
    for (const escape of [
      "\\0009", "\\000A", "\\000B", "\\000C", "\\000D", "\\0020",
      "\\00A0", "\\1680", "\\2000", "\\200A", "\\2028", "\\2029",
      "\\202F", "\\205F", "\\3000", "\\FEFF",
    ]) {
      expect(migration).toContain(escape);
    }
    expect(migration).toContain("\\0001-\\001F");
    expect(migration).toContain("\\007F-\\009F");
    expect(migration).toContain("\\061C");
    expect(migration).toContain("\\200B\\200C\\200E\\200F");
    expect(migration).toContain("\\202A-\\202E");
    expect(migration).toContain("\\2066-\\2069");
  });

  it("parses the adversarial pgTAP fixture with PostgreSQL 17 libpg_query", async () => {
    const parsed = await parse(pgTap);

    expect(Math.floor(parsed.version / 10_000)).toBe(17);
    expect(parsed.stmts.length).toBeGreaterThan(20);
    expect(pgTap).toContain("select plan(20)");
    expect(pgTap).toContain("repeat('😀', 50)");
    expect(pgTap).toContain("repeat('😀', 51)");
    for (const escape of [
      "\\0301", "\\0001", "\\009F", "\\061C", "\\200B", "\\200E",
      "\\200F", "\\2028", "\\202E", "\\2066", "\\200D",
    ]) {
      expect(pgTap).toContain(escape);
    }
  });
});
