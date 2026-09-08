import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";

export const actor = "11111111-1111-4111-8111-111111111111";
export const peer = "22222222-2222-4222-8222-222222222222";
export const outsider = "33333333-3333-4333-8333-333333333333";
export const blocked = "44444444-4444-4444-8444-444444444444";
export const thread = "55555555-5555-4555-8555-555555555555";
export const legacy = "66666666-6666-4666-8666-666666666666";
export const call = "77777777-7777-4777-8777-777777777777";
export const message = "88888888-8888-4888-8888-888888888888";

export const lifecycleFixtureSql = `
    create role anon; create role authenticated; create role service_role;
    create schema app_private;
    create table public.profiles(id uuid primary key, deleted_at timestamptz, onboarding_completed boolean default true);
    create table public.dm_threads(id uuid primary key, participant_1_id uuid, participant_2_id uuid);
    create table public.dm_thread_members(thread_id uuid, user_id uuid);
    create table public.user_blocks(blocker_id uuid, blocked_id uuid);
    create table public.friendships(requester_id uuid, addressee_id uuid, status text);
    create table public.pokes(id uuid primary key default gen_random_uuid(), thread_id uuid, status text, responded_at timestamptz);
    create table public.dm_messages(id uuid primary key default gen_random_uuid(), thread_id uuid, sender_id uuid,
      content text, message_type text default 'text', media_url text, media_thumbnail_url text, reply_to_id uuid,
      is_deleted boolean default false, is_read boolean default false);
    create table public.call_sessions(id uuid primary key default gen_random_uuid(), thread_id uuid, caller_id uuid, callee_id uuid, state text, expires_at timestamptz);
    create function public.is_adult_social_admitted_v1(id uuid) returns boolean language sql as $$ select id <> '${blocked}'::uuid $$;
    create function public.require_adult_social_admission_v1(id uuid) returns void language plpgsql as $$ begin
      if not public.is_adult_social_admitted_v1(id) then raise exception 'Admission required' using errcode = '42501'; end if;
    end $$;
    create function public.can_users_interact_v1(a uuid,b uuid) returns boolean language sql as $$
      select public.is_adult_social_admitted_v1(a) and public.is_adult_social_admitted_v1(b)
        and (select count(*) from public.profiles where id in (a,b) and deleted_at is null) = 2;
    $$;
    insert into profiles(id) values('${actor}'),('${peer}'),('${outsider}'),('${blocked}');
    insert into dm_threads values('${thread}','${actor}','${peer}'),('${legacy}','${actor}','${outsider}');
    insert into dm_thread_members values('${thread}','${actor}'),('${thread}','${peer}');
    insert into pokes(thread_id,status,responded_at) values('${thread}','accepted',now()-interval '25 hours');
    insert into dm_messages(id,thread_id,sender_id,content) values('${message}','${thread}','${peer}','Retained history');
    insert into call_sessions(id,thread_id,caller_id,callee_id,state,expires_at)
      values('${call}','${thread}','${actor}','${peer}','invited',now()+interval '1 minute');
  `;

// Exact production RPC bodies from the deployed age migration, verified by
// pg_proc.prosrc hashes before this harness was added.
const source = await readFile(new URL("../../supabase/migrations/20260908134739_account_age_admission.sql", import.meta.url), "utf8");
export const rpcDefinitions = ["send_message_transactional", "mutate_dm_message_idempotent", "begin_call_session", "advance_call_session"].map((name) => {
  const start = source.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`);
  const end = source.indexOf("$function$;", source.indexOf("AS $function$", start)) + "$function$;".length;
  assert.ok(start >= 0 && end > start, `Missing RPC ${name}`);
  return source.slice(start, end);
}).join("\n");

export const rpcFixtureSql = `
  create type public.message_type as enum ('text','image','system');
  alter table public.profiles add column username text default 'fixture', add column display_name text,
    add column avatar_url text, add column location_text text, add column is_online boolean default false, add column last_seen_at timestamptz;
  alter table public.dm_threads add column next_message_sequence bigint default 0;
  alter table public.dm_thread_members add column last_read_sequence bigint default 0, add column updated_at timestamptz default now();
  alter table public.dm_messages add column client_id uuid, add column sequence bigint default 0,
    add column is_edited boolean default false, add column created_at timestamptz default now(), add column updated_at timestamptz default now();
  create unique index dm_messages_client_id on public.dm_messages(thread_id,client_id);
  create table public.outbox_events(id uuid primary key default gen_random_uuid(), event_type text, aggregate_type text, aggregate_id text, payload jsonb);
  create unique index outbox_events_call_invite_uidx on public.outbox_events(event_type,aggregate_id) where event_type='call.invite';
  create table public.idempotency_records(actor_id uuid, operation text, key text, request_hash text, response_status int, response_body jsonb,
    expires_at timestamptz default now()+interval '24 hours', primary key(actor_id,operation,key));
  alter table public.call_sessions add column capability uuid default gen_random_uuid(), add column last_sequence bigint default 0,
    add column created_at timestamptz default now(), add column updated_at timestamptz default now();
  create table public.call_signal_commands(call_id uuid, command_id uuid, sender_id uuid, recipient_id uuid, event_type text,
    payload_hash text, sequence bigint, expires_at timestamptz, created_at timestamptz default now(), primary key(call_id,command_id));
`;
