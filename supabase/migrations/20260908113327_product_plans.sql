-- Product Plans vertical slice.
-- Review and apply this additive migration through the team's normal Supabase
-- migration workflow. It is intentionally not executed by the application.
-- Existing required relations: public.profiles, public.friendships,
-- public.user_blocks, public.shared_group_members.

create extension if not exists pgcrypto;

create table if not exists public.plans (
  id uuid primary key default extensions.gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  activity text not null check (char_length(activity) between 1 and 48),
  title text check (title is null or char_length(title) between 1 and 96),
  starts_at timestamptz not null,
  place_text text not null check (char_length(place_text) between 1 and 160),
  visibility text not null check (visibility in ('private', 'friends', 'circle', 'open')),
  circle_id uuid null,
  participant_limit smallint not null default 8 check (participant_limit between 2 and 50),
  status text not null default 'active' check (status in ('active', 'cancelled')),
  source_thread_id uuid null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((visibility = 'circle') = (circle_id is not null))
);

create table if not exists public.plan_members (
  plan_id uuid not null references public.plans(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null check (role in ('owner', 'member')),
  joined_at timestamptz not null default now(),
  primary key (plan_id, user_id)
);
create unique index if not exists plan_members_one_owner_idx on public.plan_members(plan_id) where role = 'owner';
create index if not exists plans_status_starts_at_idx on public.plans(status, starts_at);
create index if not exists plan_members_user_id_idx on public.plan_members(user_id, plan_id);

create table if not exists public.plan_share_tokens (
  id uuid primary key default extensions.gen_random_uuid(),
  plan_id uuid not null references public.plans(id) on delete cascade,
  token_hash bytea not null unique,
  expires_at timestamptz null,
  created_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists plan_share_tokens_plan_expiry_idx on public.plan_share_tokens(plan_id, expires_at);

create table if not exists public.plan_join_idempotency (
  actor_id uuid not null references public.profiles(id) on delete cascade,
  idempotency_key text not null check (char_length(idempotency_key) between 16 and 128),
  request_hash text not null check (request_hash ~ '^[0-9a-f]{64}$'),
  response_body jsonb not null,
  created_at timestamptz not null default now(),
  primary key (actor_id, idempotency_key)
);

create table if not exists public.plan_create_idempotency (
  actor_id uuid not null references public.profiles(id) on delete cascade,
  idempotency_key text not null check (char_length(idempotency_key) between 16 and 128),
  request_hash text not null check (request_hash ~ '^[0-9a-f]{64}$'),
  response_body jsonb not null,
  created_at timestamptz not null default now(),
  primary key (actor_id, idempotency_key)
);

alter table public.plans enable row level security;
alter table public.plan_members enable row level security;
alter table public.plan_share_tokens enable row level security;
alter table public.plan_join_idempotency enable row level security;
alter table public.plan_create_idempotency enable row level security;

-- No direct client mutation. Route-only service calls use the functions below.
revoke all on public.plans, public.plan_members, public.plan_share_tokens, public.plan_join_idempotency, public.plan_create_idempotency from anon, authenticated;

-- API response helpers. These are SECURITY DEFINER because the server uses a
-- service role and needs a single transactional authorization decision.
-- They are explicitly revoked from browser roles below.
create or replace function public.plan_is_blocked_v1(p_actor_id uuid, p_peer_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.user_blocks b
    where (b.blocker_id = p_actor_id and b.blocked_id = p_peer_id)
       or (b.blocker_id = p_peer_id and b.blocked_id = p_actor_id)
  );
$$;

create or replace function public.plan_has_blocked_member_v1(p_actor_id uuid, p_plan_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.plan_members m
    where m.plan_id = p_plan_id and public.plan_is_blocked_v1(p_actor_id, m.user_id)
  );
$$;

create or replace function public.plan_viewable_v1(p_actor_id uuid, p_plan public.plans)
returns boolean language plpgsql stable security definer set search_path = '' as $$
begin
  if p_actor_id = p_plan.owner_id then return true; end if;
  if public.plan_has_blocked_member_v1(p_actor_id, p_plan.id) then return false; end if;
  if exists (select 1 from public.plan_members m where m.plan_id = p_plan.id and m.user_id = p_actor_id) then return true; end if;
  if p_plan.status <> 'active' then return false; end if;
  if p_plan.visibility = 'open' then return true; end if;
  if p_plan.visibility = 'friends' then
    return exists (select 1 from public.friendships f where f.status = 'accepted' and ((f.requester_id = p_actor_id and f.addressee_id = p_plan.owner_id) or (f.addressee_id = p_actor_id and f.requester_id = p_plan.owner_id)));
  end if;
  if p_plan.visibility = 'circle' then
    return exists (select 1 from public.shared_group_members gm where gm.group_id = p_plan.circle_id and gm.user_id = p_actor_id);
  end if;
  return false;
end;
$$;

create or replace function public.plan_payload_v1(p_actor_id uuid, p_plan_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_plan public.plans; v_count integer; v_is_member boolean; v_is_owner boolean;
begin
  select * into v_plan from public.plans where id = p_plan_id;
  if not found or not public.plan_viewable_v1(p_actor_id, v_plan) then return jsonb_build_object('error', 'NOT_FOUND'); end if;
  select count(*) into v_count from public.plan_members where plan_id = v_plan.id;
  v_is_member := exists(select 1 from public.plan_members where plan_id = v_plan.id and user_id = p_actor_id);
  v_is_owner := v_plan.owner_id = p_actor_id;
  return jsonb_build_object('plan', jsonb_build_object(
    'id', v_plan.id, 'owner_id', v_plan.owner_id, 'activity', v_plan.activity, 'title', v_plan.title,
    'starts_at', v_plan.starts_at, 'place_text', v_plan.place_text, 'visibility', v_plan.visibility,
    'circle_id', v_plan.circle_id, 'participant_limit', v_plan.participant_limit, 'member_count', v_count,
    'status', v_plan.status, 'created_at', v_plan.created_at, 'updated_at', v_plan.updated_at,
    'viewer_is_member', v_is_member, 'viewer_is_owner', v_is_owner,
    'source_thread_id', case when v_plan.source_thread_id is not null and exists (select 1 from public.dm_thread_members tm where tm.thread_id = v_plan.source_thread_id and tm.user_id = p_actor_id) then v_plan.source_thread_id else null end
  ), 'members', coalesce((select jsonb_agg(jsonb_build_object('user_id', m.user_id, 'role', m.role, 'joined_at', m.joined_at, 'display_name', profile.display_name, 'avatar_url', profile.avatar_url) order by m.joined_at) from public.plan_members m join public.profiles profile on profile.id = m.user_id and profile.deleted_at is null where m.plan_id = v_plan.id), '[]'::jsonb));
end;
$$;

create or replace function public.plan_create_finish_v1(p_actor_id uuid, p_idempotency_key text, p_request_hash text, p_response jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  insert into public.plan_create_idempotency(actor_id, idempotency_key, request_hash, response_body)
  values (p_actor_id, p_idempotency_key, p_request_hash, p_response);
  return p_response;
end;
$$;

create or replace function public.plan_create_v1(p_actor_id uuid, p_activity text, p_title text, p_starts_at timestamptz, p_place_text text, p_visibility text, p_circle_id uuid, p_participant_limit smallint, p_source_thread_id uuid, p_idempotency_key text, p_request_hash text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_plan_id uuid; v_payload jsonb; v_existing public.plan_create_idempotency;
begin
  perform pg_advisory_xact_lock(hashtext(p_actor_id::text || ':plan:create:' || p_idempotency_key));
  select * into v_existing from public.plan_create_idempotency where actor_id = p_actor_id and idempotency_key = p_idempotency_key for update;
  if found then
    if v_existing.request_hash <> p_request_hash then return jsonb_build_object('error', 'IDEMPOTENCY_CONFLICT'); end if;
    return v_existing.response_body || jsonb_build_object('replayed', true);
  end if;
  if not exists (select 1 from public.profiles where id = p_actor_id and deleted_at is null) then return public.plan_create_finish_v1(p_actor_id,p_idempotency_key,p_request_hash,jsonb_build_object('error', 'FORBIDDEN')); end if;
  if p_activity is null or char_length(btrim(p_activity)) not between 1 and 48 or p_place_text is null or char_length(btrim(p_place_text)) not between 1 and 160 or p_title is not null and char_length(btrim(p_title)) not between 1 and 96 or p_starts_at <= now() or p_visibility not in ('private','friends','circle','open') or p_participant_limit not between 2 and 50 or ((p_visibility = 'circle') <> (p_circle_id is not null)) then return public.plan_create_finish_v1(p_actor_id,p_idempotency_key,p_request_hash,jsonb_build_object('error', 'INVALID')); end if;
  if p_visibility = 'circle' and not exists (select 1 from public.shared_group_members where group_id = p_circle_id and user_id = p_actor_id) then return public.plan_create_finish_v1(p_actor_id,p_idempotency_key,p_request_hash,jsonb_build_object('error', 'FORBIDDEN')); end if;
  if p_source_thread_id is not null and not exists (select 1 from public.dm_thread_members where thread_id = p_source_thread_id and user_id = p_actor_id) then return public.plan_create_finish_v1(p_actor_id,p_idempotency_key,p_request_hash,jsonb_build_object('error', 'FORBIDDEN')); end if;
  insert into public.plans(owner_id, activity, title, starts_at, place_text, visibility, circle_id, participant_limit, source_thread_id) values (p_actor_id, btrim(p_activity), nullif(btrim(p_title), ''), p_starts_at, btrim(p_place_text), p_visibility, p_circle_id, p_participant_limit, p_source_thread_id) returning id into v_plan_id;
  insert into public.plan_members(plan_id, user_id, role) values (v_plan_id, p_actor_id, 'owner');
  v_payload := public.plan_payload_v1(p_actor_id, v_plan_id);
  v_payload := jsonb_build_object('plan', v_payload->'plan', 'replayed', false);
  return public.plan_create_finish_v1(p_actor_id, p_idempotency_key, p_request_hash, v_payload);
end;
$$;

create or replace function public.plans_list_v1(p_actor_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('plans', coalesce(jsonb_agg(payload.plan order by payload.plan->>'starts_at', payload.plan->>'id'), '[]'::jsonb))
  from (
    select (public.plan_payload_v1(p_actor_id, p.id)->'plan') as plan
    from public.plans p
    where p.status = 'active' and p.starts_at > now() and public.plan_viewable_v1(p_actor_id, p)
    order by p.starts_at asc, p.id asc limit 100
  ) payload;
$$;

create or replace function public.plan_read_v1(p_actor_id uuid, p_plan_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$ select public.plan_payload_v1(p_actor_id, p_plan_id); $$;

create or replace function public.plan_update_v1(p_actor_id uuid, p_plan_id uuid, p_patch jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_plan public.plans; v_visibility text; v_circle_id uuid; v_limit smallint; v_starts timestamptz;
begin
  select * into v_plan from public.plans where id = p_plan_id for update;
  if not found then return jsonb_build_object('error', 'NOT_FOUND'); end if;
  if v_plan.owner_id <> p_actor_id then return jsonb_build_object('error', 'FORBIDDEN'); end if;
  if v_plan.status <> 'active' then return jsonb_build_object('error', 'CANCELLED'); end if;
  v_visibility := coalesce(p_patch->>'visibility', v_plan.visibility); v_circle_id := case when p_patch ? 'circle_id' then nullif(p_patch->>'circle_id','')::uuid else v_plan.circle_id end; v_limit := coalesce((p_patch->>'participant_limit')::smallint, v_plan.participant_limit); v_starts := coalesce((p_patch->>'starts_at')::timestamptz, v_plan.starts_at);
  if v_starts <= now() or v_limit < (select count(*) from public.plan_members where plan_id = p_plan_id) or ((v_visibility = 'circle') <> (v_circle_id is not null)) or (p_patch ? 'activity' and char_length(btrim(p_patch->>'activity')) not between 1 and 48) or (p_patch ? 'title' and p_patch->>'title' is not null and char_length(btrim(p_patch->>'title')) not between 1 and 96) or (p_patch ? 'place_text' and char_length(btrim(p_patch->>'place_text')) not between 1 and 160) then return jsonb_build_object('error', 'INVALID'); end if;
  if v_visibility = 'circle' and not exists (select 1 from public.shared_group_members where group_id = v_circle_id and user_id = p_actor_id) then return jsonb_build_object('error', 'FORBIDDEN'); end if;
  update public.plans set activity = case when p_patch ? 'activity' then btrim(p_patch->>'activity') else activity end, title = case when p_patch ? 'title' then nullif(btrim(p_patch->>'title'),'') else title end, starts_at = v_starts, place_text = case when p_patch ? 'place_text' then btrim(p_patch->>'place_text') else place_text end, visibility = v_visibility, circle_id = v_circle_id, participant_limit = v_limit, updated_at = now() where id = p_plan_id;
  return public.plan_payload_v1(p_actor_id, p_plan_id);
end;
$$;

create or replace function public.plan_cancel_v1(p_actor_id uuid, p_plan_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_owner uuid;
begin
  select owner_id into v_owner from public.plans where id = p_plan_id for update;
  if not found then return jsonb_build_object('error','NOT_FOUND'); end if;
  if v_owner <> p_actor_id then return jsonb_build_object('error','FORBIDDEN'); end if;
  update public.plans set status = 'cancelled', updated_at = now() where id = p_plan_id;
  -- The owner may always read their own cancellation state.
  return public.plan_payload_v1(p_actor_id, p_plan_id);
end;
$$;

create or replace function public.plan_join_finish_v1(p_actor_id uuid, p_idempotency_key text, p_request_hash text, p_response jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  insert into public.plan_join_idempotency(actor_id, idempotency_key, request_hash, response_body)
  values (p_actor_id, p_idempotency_key, p_request_hash, p_response);
  return p_response;
end;
$$;

create or replace function public.plan_join_v1(p_actor_id uuid, p_plan_id uuid, p_idempotency_key text, p_request_hash text, p_share_token text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_existing public.plan_join_idempotency; v_plan public.plans; v_payload jsonb; v_count integer; v_token_valid boolean;
begin
  -- A row lock cannot protect an absent idempotency record. This bounded,
  -- transaction-scoped advisory lock serializes the same actor/key pair.
  perform pg_advisory_xact_lock(hashtext(p_actor_id::text || ':' || p_idempotency_key));
  select * into v_existing from public.plan_join_idempotency where actor_id = p_actor_id and idempotency_key = p_idempotency_key for update;
  if found then
    if v_existing.request_hash <> p_request_hash then return jsonb_build_object('error','IDEMPOTENCY_CONFLICT'); end if;
    return v_existing.response_body;
  end if;
  select * into v_plan from public.plans where id = p_plan_id for update;
  if not found then return public.plan_join_finish_v1(p_actor_id, p_idempotency_key, p_request_hash, jsonb_build_object('error','NOT_FOUND')); end if;
  if public.plan_has_blocked_member_v1(p_actor_id, v_plan.id) then return public.plan_join_finish_v1(p_actor_id, p_idempotency_key, p_request_hash, jsonb_build_object('error','NOT_FOUND')); end if;
  if v_plan.status <> 'active' then return public.plan_join_finish_v1(p_actor_id, p_idempotency_key, p_request_hash, jsonb_build_object('error','CANCELLED')); end if;
  if v_plan.starts_at <= now() then return public.plan_join_finish_v1(p_actor_id, p_idempotency_key, p_request_hash, jsonb_build_object('error','EXPIRED')); end if;
  v_token_valid := p_share_token is not null and exists (select 1 from public.plan_share_tokens st where st.plan_id = v_plan.id and st.token_hash = extensions.digest(p_share_token, 'sha256') and (st.expires_at is null or st.expires_at > now()));
  if not public.plan_viewable_v1(p_actor_id, v_plan) and not v_token_valid then return public.plan_join_finish_v1(p_actor_id, p_idempotency_key, p_request_hash, jsonb_build_object('error','NOT_FOUND')); end if;
  if exists (select 1 from public.plan_members where plan_id = v_plan.id and user_id = p_actor_id) then
    v_payload := jsonb_build_object('plan', public.plan_payload_v1(p_actor_id, v_plan.id)->'plan', 'joined', false);
  else
    select count(*) into v_count from public.plan_members where plan_id = v_plan.id;
    if v_count >= v_plan.participant_limit then return public.plan_join_finish_v1(p_actor_id, p_idempotency_key, p_request_hash, jsonb_build_object('error','FULL')); end if;
    insert into public.plan_members(plan_id, user_id, role) values (v_plan.id, p_actor_id, 'member');
    v_payload := jsonb_build_object('plan', public.plan_payload_v1(p_actor_id, v_plan.id)->'plan', 'joined', true);
  end if;
  return public.plan_join_finish_v1(p_actor_id, p_idempotency_key, p_request_hash, v_payload);
end;
$$;

create or replace function public.plan_leave_v1(p_actor_id uuid, p_plan_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_plan public.plans;
begin
  select * into v_plan from public.plans where id = p_plan_id for update;
  if not found then return jsonb_build_object('error','NOT_FOUND'); end if;
  if v_plan.owner_id = p_actor_id then return jsonb_build_object('error','FORBIDDEN'); end if;
  delete from public.plan_members where plan_id = p_plan_id and user_id = p_actor_id;
  if not found then return jsonb_build_object('error','NOT_FOUND'); end if;
  return jsonb_build_object('left', true);
end;
$$;

create or replace function public.plan_share_create_v1(p_actor_id uuid, p_plan_id uuid, p_expires_at timestamptz)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_token text;
begin
  if not exists (select 1 from public.plans where id = p_plan_id and owner_id = p_actor_id and status = 'active') then return jsonb_build_object('error','NOT_FOUND'); end if;
  if p_expires_at is not null and p_expires_at <= now() then return jsonb_build_object('error','INVALID'); end if;
  v_token := translate(trim(trailing '=' from encode(extensions.gen_random_bytes(32), 'base64')), '+/', '-_');
  insert into public.plan_share_tokens(plan_id, token_hash, expires_at, created_by) values (p_plan_id, extensions.digest(v_token, 'sha256'), p_expires_at, p_actor_id);
  return jsonb_build_object('token', v_token, 'expires_at', p_expires_at);
end;
$$;

create or replace function public.plan_share_revoke_v1(p_actor_id uuid, p_plan_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.plans where id = p_plan_id and owner_id = p_actor_id) then return jsonb_build_object('error','NOT_FOUND'); end if;
  delete from public.plan_share_tokens where plan_id = p_plan_id;
  return jsonb_build_object('revoked', true);
end;
$$;

create or replace function public.plan_public_preview_v1(p_token text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_plan public.plans; v_count integer;
begin
  select p.* into v_plan from public.plan_share_tokens st join public.plans p on p.id = st.plan_id where st.token_hash = extensions.digest(p_token, 'sha256') and (st.expires_at is null or st.expires_at > now()) limit 1;
  if not found or v_plan.status <> 'active' then return jsonb_build_object('error','NOT_FOUND'); end if;
  select count(*) into v_count from public.plan_members where plan_id = v_plan.id;
  return jsonb_build_object('plan', jsonb_build_object('id',v_plan.id,'activity',v_plan.activity,'title',v_plan.title,'starts_at',v_plan.starts_at,'place_text',v_plan.place_text,'participant_limit',v_plan.participant_limit,'member_count',v_count), 'can_join', v_plan.starts_at > now() and v_count < v_plan.participant_limit);
end;
$$;

revoke all on function public.plan_is_blocked_v1(uuid, uuid), public.plan_has_blocked_member_v1(uuid, uuid), public.plan_viewable_v1(uuid, public.plans), public.plan_payload_v1(uuid, uuid), public.plan_create_finish_v1(uuid, text, text, jsonb), public.plan_create_v1(uuid, text, text, timestamptz, text, text, uuid, smallint, uuid, text, text), public.plans_list_v1(uuid), public.plan_read_v1(uuid, uuid), public.plan_update_v1(uuid, uuid, jsonb), public.plan_cancel_v1(uuid, uuid), public.plan_join_finish_v1(uuid, text, text, jsonb), public.plan_join_v1(uuid, uuid, text, text, text), public.plan_leave_v1(uuid, uuid), public.plan_share_create_v1(uuid, uuid, timestamptz), public.plan_share_revoke_v1(uuid, uuid), public.plan_public_preview_v1(text) from public, anon, authenticated;
grant execute on function public.plan_create_v1(uuid, text, text, timestamptz, text, text, uuid, smallint, uuid, text, text), public.plans_list_v1(uuid), public.plan_read_v1(uuid, uuid), public.plan_update_v1(uuid, uuid, jsonb), public.plan_cancel_v1(uuid, uuid), public.plan_join_v1(uuid, uuid, text, text, text), public.plan_leave_v1(uuid, uuid), public.plan_share_create_v1(uuid, uuid, timestamptz), public.plan_share_revoke_v1(uuid, uuid), public.plan_public_preview_v1(text) to service_role;
