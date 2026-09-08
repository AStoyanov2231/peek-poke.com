import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

const root = new URL("../..", import.meta.url);
const migration = await readFile(
  new URL("supabase/migrations/20260908140000_legacy_sql_special_forms.sql", root),
  "utf8",
);
const db = await PGlite.create();
try {
  await db.exec(`
    create role authenticated;
    create function public.list_chat_room_summaries(
      p_limit integer default 101,
      p_cursor_at timestamptz default null,
      p_cursor_id uuid default null
    ) returns integer
    language plpgsql security definer set search_path = '' as $$
    begin
      perform pg_catalog.coalesce(p_limit, 101);
      return pg_catalog.least(pg_catalog.greatest(pg_catalog.coalesce(p_limit, 101), 1), pg_catalog.nullif(101, 0));
    end;
    $$;
    revoke all on function public.list_chat_room_summaries(integer, timestamptz, uuid) from public;
    grant execute on function public.list_chat_room_summaries(integer, timestamptz, uuid) to authenticated;
  `);

  let rejected = false;
  try {
    await db.query("select public.list_chat_room_summaries(null, null, null)");
  } catch (error) {
    rejected = String(error).includes("pg_catalog.coalesce");
  }
  if (!rejected) throw new Error("fixture must reproduce the qualified special-form failure");

  await db.exec(migration);
  await db.exec(migration);
  const result = await db.query("select public.list_chat_room_summaries(null, null, null) value");
  if (result.rows[0].value !== 101) throw new Error("migration must restore special-form execution");
  const grants = await db.query("select has_function_privilege('authenticated', 'public.list_chat_room_summaries(integer, timestamptz, uuid)', 'execute') allowed");
  if (grants.rows[0].allowed !== true) throw new Error("CREATE OR REPLACE must preserve existing function grants");
  const security = await db.query("select prosecdef, proconfig from pg_proc where oid = 'public.list_chat_room_summaries(integer, timestamptz, uuid)'::regprocedure");
  if (!security.rows[0].prosecdef || !security.rows[0].proconfig.includes('search_path=""')) throw new Error("migration must preserve the function security context");
  process.stdout.write("legacy SQL special-form correction passed\n");
} finally {
  await db.close();
}
