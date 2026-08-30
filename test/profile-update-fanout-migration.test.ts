import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { parse, parsePlPgSQL } from "@libpg-query/parser";
import { beforeAll, describe, expect, it } from "vitest";

const migrationPath = fileURLToPath(new URL(
  "../supabase/migrations/20260807193532_durable_profile_update_fanout.sql",
  import.meta.url,
));
const pgTapPath = fileURLToPath(new URL(
  "../supabase/tests/profile_update_fanout.test.sql",
  import.meta.url,
));
const explainFixturePath = fileURLToPath(new URL(
  "../supabase/tests/profile_update_fanout_explain.sql",
  import.meta.url,
));

let migration = "";
let pgTap = "";
let explainFixture = "";

beforeAll(async () => {
  [migration, pgTap, explainFixture] = await Promise.all([
    readFile(migrationPath, "utf8"),
    readFile(pgTapPath, "utf8"),
    readFile(explainFixturePath, "utf8"),
  ]);
});

describe("durable profile update fanout migration", () => {
  it("parses SQL and every PL/pgSQL body with PostgreSQL 17", async () => {
    const sql = await parse(migration);
    const plpgsql = await parsePlPgSQL(migration);

    expect(Math.floor(sql.version / 10_000)).toBe(17);
    expect(sql.stmts).toHaveLength(15);
    expect(plpgsql.plpgsql_funcs).toHaveLength(4);
  });

  it("atomically enqueues only a sanitized profile id for real public-field changes", () => {
    expect(migration).toContain("after update of username, display_name, bio, avatar_url, cover_image_url, location_text");
    expect(migration).toContain("old.deleted_at is null");
    expect(migration).toContain("new.deleted_at is null");
    expect(migration).toContain("is distinct from");
    expect(migration).toContain("'profile.updated'");
    expect(migration).toContain("jsonb_build_object('profile_id', new.id)");
    expect(migration).not.toMatch(/to_jsonb\s*\(\s*new\s*\)/i);
    expect(migration).not.toMatch(/'balance'|'auth_user_id'|'stripe_customer_id'/i);
  });

  it("dedupes owner, pending/accepted friendship, and DM audiences into bounded durable pages", () => {
    expect(migration).toContain("friendships_profile_fanout_requester_idx");
    expect(migration).toContain("on public.friendships (requester_id, addressee_id)");
    expect(migration).toContain("friendships_profile_fanout_addressee_idx");
    expect(migration).toContain("on public.friendships (addressee_id, requester_id)");
    expect(migration.match(/where status in \('pending', 'accepted'\);/g)).toHaveLength(2);
    expect(migration).toContain("profiles_pkey");
    expect(migration).toContain("user_blocks_blocker_id_blocked_id_key");
    expect(migration).toContain("dm_threads_participant_1_last_message_cursor_idx");
    expect(migration).toContain("dm_threads_participant_2_last_message_cursor_idx");
    expect(migration).toContain("dm_threads_participants_unique");
    expect(migration).toContain("friendship.status in ('pending', 'accepted')");
    expect(migration).toContain("thread.participant_1_id = v_profile_id");
    expect(migration).toContain("thread.participant_2_id = v_profile_id");
    expect(migration).toMatch(/limit 101/i);
    expect(migration).toContain("v_recipient_page[1:100]");
    expect(migration).toContain("'profile.updated.page'");
    expect(migration).toContain("'after_recipient_id', v_recipient_page[100]");
    expect(migration).toContain("outbox_events_profile_hint_recipient_uidx");
    expect(migration).toContain("outbox_events_profile_page_cursor_uidx");
  });

  it("filters deleted and mutually blocked recipients both at expansion and immediately before delivery", () => {
    expect(migration).toContain("join public.profiles recipient_profile");
    expect(migration).toContain("recipient_profile.deleted_at is null");
    expect(migration).toContain("block.blocker_id = v_profile_id");
    expect(migration).toContain("block.blocked_id = v_profile_id");
    expect(migration).toContain("public.can_deliver_profile_updated_hint");
    expect(migration).toContain("source_profile.deleted_at is null");
    expect(migration).toContain("p_profile_id = p_recipient_id");
    expect(migration).toContain("friendship.status in ('pending', 'accepted')");
    expect(migration).toContain("friendship.requester_id = p_profile_id");
    expect(migration).toContain("friendship.addressee_id = p_profile_id");
    expect(migration).toContain("thread.participant_1_id = p_profile_id");
    expect(migration).toContain("thread.participant_2_id = p_profile_id");
  });

  it("keeps the expansion RPC service-only and lease-bound", () => {
    expect(migration).toContain("event.status = 'processing'");
    expect(migration).toContain("event.locked_by = p_worker_id");
    expect(migration).toMatch(/revoke all on function public\.expand_profile_updated_event\(uuid, text\)[\s\S]*from public, anon, authenticated/i);
    expect(migration).toMatch(/grant execute on function public\.expand_profile_updated_event\(uuid, text\)[\s\S]*to service_role/i);
    expect(migration).toMatch(/revoke all on function public\.can_deliver_profile_updated_hint\(uuid, uuid\)[\s\S]*from public, anon, authenticated/i);
    expect(migration).toMatch(/grant execute on function public\.can_deliver_profile_updated_hint\(uuid, uuid\)[\s\S]*to service_role/i);
  });

  it("parses the pgTAP replay, dedupe, privacy, and trigger fixture with PostgreSQL 17", async () => {
    const parsed = await parse(pgTap);

    expect(Math.floor(parsed.version / 10_000)).toBe(17);
    expect(parsed.stmts.length).toBeGreaterThan(25);
    expect(pgTap).toContain("select plan(40)");
    expect(pgTap).toContain("nonrecipient receives no hint row");
    expect(pgTap).toContain("replay inserts no duplicate recipient hints");
    expect(pgTap).toContain("a block committed after expansion suppresses delivery");
    expect(pgTap).toContain("a deletion committed after expansion suppresses delivery");
    expect(pgTap).toContain("a declined or removed friendship without a DM suppresses delivery");
    expect(pgTap).toContain("a removed friendship remains deliverable when a current DM exists");
    expect(pgTap).toContain("an unrelated live recipient is not deliverable");
    expect(pgTap).toContain("requester-first fanout index covers the pair and active statuses");
    expect(pgTap).toContain("addressee-first fanout index covers the pair and active statuses");
  });

  it("ships a PostgreSQL 17 EXPLAIN gate for representative disposable staging data", async () => {
    const sql = await parse(explainFixture);
    const plpgsql = await parsePlPgSQL(explainFixture);

    expect(Math.floor(sql.version / 10_000)).toBe(17);
    expect(sql.stmts).toHaveLength(4);
    expect(plpgsql.plpgsql_funcs).toHaveLength(2);
    expect(explainFixture).toContain("profile_fanout_explain_min_rows");
    expect(explainFixture).toContain("10000");
    expect(explainFixture).toContain("explain (format json, costs off)");
    expect(explainFixture).toContain("jsonb_path_query");
    expect(explainFixture).toContain("node ->> 'Node Type' = 'Seq Scan'");
    expect(explainFixture).toContain("'Index Scan'");
    expect(explainFixture).toContain("'Index Only Scan'");
    expect(explainFixture).toContain("'Bitmap Heap Scan'");
    expect(explainFixture).toContain("BitmapOr/Bitmap Index Scan");
    expect(explainFixture).toContain("requester-first friendship expansion");
    expect(explainFixture).toContain("addressee-first friendship expansion");
    expect(explainFixture).toContain("direct friendship delivery membership guard");
    expect(explainFixture).toContain("reverse friendship delivery membership guard");
    expect(explainFixture).toContain("participant-one DM expansion");
    expect(explainFixture).toContain("participant-two DM expansion");
    expect(explainFixture).toContain("direct DM delivery membership guard");
    expect(explainFixture).toContain("reverse DM delivery membership guard");
    expect(explainFixture).toContain("bilateral block OR guard");
    expect(explainFixture).toContain("live profile lookup");
    expect(explainFixture).toContain("exact compound profile delivery guard");
    expect(explainFixture).not.toContain("enable_seqscan");
  });
});
