import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";

const root = resolve(import.meta.dirname, "../..");
const migration = await readFile(resolve(root, "supabase/migrations/20260908125054_account_age_admission.sql"), "utf8");
const sql = migration.split("-- BEGIN AGE GROUP_DETAIL\n")[1]?.split("-- END AGE GROUP_DETAIL")[0];
assert.ok(sql, "age migration must contain the group-detail reader");
const actor = "00000000-0000-4000-8000-000000000001";
const hidden = "00000000-0000-4000-8000-000000000200";
const groupId = "10000000-0000-4000-8000-000000000001";
const newestHidden = "20000000-0000-4000-8000-000000000003";
const newestEligible = "20000000-0000-4000-8000-000000000002";
const oldestEligible = "20000000-0000-4000-8000-000000000001";

const db = await PGlite.create();
try {
  await db.exec(`
    create role anon;
    create role authenticated;
    create role service_role;
    create table public.profiles(
      id uuid primary key,
      username text,
      display_name text,
      avatar_url text,
      location_text text,
      is_online boolean,
      last_seen_at timestamptz,
      deleted_at timestamptz
    );
    create table public.shared_groups(
      id uuid primary key,
      created_at timestamptz not null
    );
    create table public.shared_group_members(
      group_id uuid not null,
      user_id uuid not null,
      last_read_sequence bigint not null default 0
    );
    create table public.shared_group_messages(
      id uuid primary key,
      group_id uuid not null,
      sender_id uuid not null,
      client_id uuid,
      sequence bigint not null,
      content text,
      message_type text not null default 'text',
      media_url text,
      media_thumbnail_url text,
      is_read boolean not null default false,
      is_edited boolean not null default false,
      is_deleted boolean not null default false,
      created_at timestamptz not null
    );
    create function public.require_adult_social_admission_v1(uuid) returns void language plpgsql as $$ begin end; $$;
    create function public.can_users_interact_v1(p_user_a uuid, p_user_b uuid) returns boolean language sql stable as $$
      select p_user_a <> p_user_b and p_user_b <> '${hidden}'::uuid
    $$;
  `);
  await db.exec(sql);
  await db.query("insert into public.shared_groups(id,created_at) values($1,'2026-09-08T10:00:00Z')", [groupId]);
  for (let index = 1; index <= 200; index += 1) {
    const userId = `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
    await db.query(
      "insert into public.profiles(id,username,display_name,is_online) values($1,$2,$3,false)",
      [userId, `member_${index}`, `Member ${index}`],
    );
    await db.query(
      "insert into public.shared_group_members(group_id,user_id,last_read_sequence) values($1,$2,0)",
      [groupId, userId],
    );
  }
  await db.query(`
    insert into public.shared_group_messages(id,group_id,sender_id,client_id,sequence,content,message_type,is_read,is_edited,is_deleted,created_at)
    values
      ($1,$2,$3,$4,1,'old eligible','text',false,false,false,'2026-09-08T10:01:00Z'),
      ($5,$2,$3,$6,2,'new eligible','text',false,false,false,'2026-09-08T10:02:00Z'),
      ($7,$2,$8,$9,3,'pending author must stay private','text',false,false,false,'2026-09-08T10:03:00Z')
  `, [oldestEligible, groupId, actor, "30000000-0000-4000-8000-000000000001", newestEligible, "30000000-0000-4000-8000-000000000002", newestHidden, hidden, "30000000-0000-4000-8000-000000000003"]);

  const first = await db.query(
    "select public.get_shared_group_detail_for_user_v1($1,$2,null,null,1) detail",
    [groupId, actor],
  );
  const firstDetail = first.rows[0].detail;
  assert.equal(firstDetail.group.member_count, 199, "one pending member is excluded from a 200-member group");
  assert.equal(firstDetail.group.last_message_preview, "new eligible");
  assert.deepEqual(firstDetail.messages.map((message) => message.sequence), [2, 1]);
  assert.doesNotMatch(JSON.stringify(firstDetail), /pending author must stay private/);
  assert.equal(firstDetail.messages[0].sender.username, "member_1");

  const second = await db.query(
    "select public.get_shared_group_detail_for_user_v1($1,$2,2,$3,1) detail",
    [groupId, actor, newestEligible],
  );
  const secondDetail = second.rows[0].detail;
  assert.deepEqual(secondDetail.messages.map((message) => message.sequence), [1], "cursor advances over eligible messages only");
  assert.doesNotMatch(JSON.stringify(secondDetail), /pending author must stay private/);

  const grants = await db.query(`
    select
      has_function_privilege('authenticated', 'public.get_shared_group_detail_for_user_v1(uuid,uuid,bigint,uuid,integer)', 'execute') as authenticated_can_read,
      has_function_privilege('service_role', 'public.get_shared_group_detail_for_user_v1(uuid,uuid,bigint,uuid,integer)', 'execute') as service_can_read
  `);
  assert.deepEqual(grants.rows[0], { authenticated_can_read: false, service_can_read: true });
  process.stdout.write("age group detail SQL validation passed: 200-member filtering, pagination, and service-only grants\n");
} finally {
  await db.close();
}
