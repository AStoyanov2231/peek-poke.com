-- Profile media is staged in a private bucket. Public promotion is authorized
-- in Postgres before Storage publication, then completed by the durable outbox;
-- Postgres and Storage are not represented as sharing a transaction.
do $$
begin
  if pg_catalog.to_regclass('public.profile_photos') is null
     or pg_catalog.to_regclass('public.outbox_events') is null
     or pg_catalog.to_regclass('storage.buckets') is null then
    raise exception 'Profile media quarantine requires profile_photos, outbox_events, and Storage';
  end if;
end;
$$;

insert into storage.buckets (id, name, public)
values
  ('profile-media-quarantine', 'profile-media-quarantine', false),
  ('approved-profile-photos', 'approved-profile-photos', true)
on conflict (id) do update
set public = excluded.public;

-- The legacy bucket contained both approved and unapproved objects. Make it
-- private immediately; durable backfill events below move each object to the
-- bucket that matches its database state.
update storage.buckets
set public = false
where id = 'profile-photos';

alter table public.profile_photos
  add column if not exists moderation_operation_id uuid,
  add column if not exists moderation_action text,
  add column if not exists moderation_requested_at timestamptz,
  add column if not exists moderation_requested_by uuid references public.profiles(id) on delete set null,
  add column if not exists moderation_event_payload jsonb,
  add column if not exists moderation_event_payload_digest text;

alter table public.profile_photos
  drop constraint if exists profile_photos_moderation_action_check;

alter table public.profile_photos
  add constraint profile_photos_moderation_action_check
  check (moderation_action is null or moderation_action in ('approve', 'reject', 'quarantine'));

alter table public.profile_photos
  drop constraint if exists profile_photos_moderation_event_fence_check;

alter table public.profile_photos
  add constraint profile_photos_moderation_event_fence_check
  check (
    (
      moderation_action is null
      and moderation_event_payload is null
      and moderation_event_payload_digest is null
    )
    or (
      moderation_action is not null
      and moderation_operation_id is not null
      and moderation_requested_at is not null
      and coalesce(jsonb_typeof(moderation_event_payload) = 'object', false)
      and moderation_event_payload_digest = encode(
        extensions.digest(moderation_event_payload::text, 'sha256'),
        'hex'
      )
      and coalesce(
        moderation_event_payload ->> 'photo_id' = id::text
        and moderation_event_payload ->> 'operation_id' = moderation_operation_id::text
        and moderation_event_payload ->> 'owner_id' = user_id::text
        and moderation_event_payload ->> 'action' = moderation_action,
        false
      )
    )
  ) not valid;

alter table public.outbox_events
  drop constraint if exists outbox_events_profile_media_lease_check;

alter table public.outbox_events
  add constraint outbox_events_profile_media_lease_check
  check (
    event_type <> 'profile.media_moderation'
    or status in ('completed', 'dead')
    or (
      status = 'pending'
      and locked_at is null
      and locked_by is null
      and completed_at is null
    )
    or (
      status = 'processing'
      and locked_at is not null
      and nullif(btrim(locked_by), '') is not null
      and completed_at is null
    )
  ) not valid;

create unique index if not exists outbox_events_profile_media_operation_uidx
  on public.outbox_events (event_type, aggregate_id)
  where event_type = 'profile.media_moderation';

create unique index if not exists outbox_events_profile_media_live_photo_uidx
  on public.outbox_events ((payload ->> 'photo_id'))
  where event_type = 'profile.media_moderation'
    and status in ('pending', 'processing', 'dead');

create table if not exists public.profile_media_remediation_alerts (
  id uuid primary key default gen_random_uuid(),
  photo_id uuid not null,
  operation_id uuid not null,
  action text not null check (action in ('approve', 'reject', 'quarantine')),
  error_code text not null check (char_length(error_code) between 1 and 80),
  error_detail text not null check (char_length(error_detail) between 1 and 500),
  occurrence_count integer not null default 1 check (occurrence_count between 1 and 1000),
  status text not null default 'open' check (status in ('open', 'resolved')),
  first_detected_at timestamptz not null default now(),
  last_detected_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references public.profiles(id) on delete set null,
  resolution text check (resolution is null or resolution in ('reconstructed', 'decision_reset')),
  resolution_note text check (resolution_note is null or char_length(resolution_note) <= 500),
  unique (photo_id, operation_id)
);

create index if not exists profile_media_remediation_alerts_open_idx
  on public.profile_media_remediation_alerts (status, first_detected_at, photo_id)
  where status = 'open';

alter table public.profile_media_remediation_alerts enable row level security;
drop policy if exists "profile media remediation is server only"
  on public.profile_media_remediation_alerts;
create policy "profile media remediation is server only"
  on public.profile_media_remediation_alerts
  for all
  to authenticated
  using (false)
  with check (false);
revoke all on public.profile_media_remediation_alerts from anon, authenticated;
grant all on public.profile_media_remediation_alerts to service_role;

create or replace function public.ensure_profile_media_operation_event(
  p_photo_id uuid,
  p_operation_id uuid,
  p_action text
)
returns text
language plpgsql
set search_path = public
as $$
declare
  v_photo public.profile_photos%rowtype;
  v_event public.outbox_events%rowtype;
  v_live_count integer;
begin
  select * into v_photo
  from public.profile_photos
  where id = p_photo_id
  for update;

  if not found
     or v_photo.moderation_operation_id is distinct from p_operation_id
     or v_photo.moderation_action is distinct from p_action
     or v_photo.moderation_event_payload is null
     or v_photo.moderation_event_payload_digest is distinct from encode(
          extensions.digest(v_photo.moderation_event_payload::text, 'sha256'),
          'hex'
        ) then
    return 'conflict';
  end if;

  select * into v_event
  from public.outbox_events event
  where event.event_type = 'profile.media_moderation'
    and event.aggregate_id = p_operation_id::text
  for update;

  select count(*) into v_live_count
  from public.outbox_events event
  where event.event_type = 'profile.media_moderation'
    and event.payload ->> 'photo_id' = p_photo_id::text
    and event.status in ('pending', 'processing', 'dead');

  if v_live_count > 1 then
    return 'conflict';
  end if;

  if found then
    if v_event.payload is distinct from v_photo.moderation_event_payload
       or v_event.payload ->> 'photo_id' is distinct from p_photo_id::text
       or v_event.payload ->> 'operation_id' is distinct from p_operation_id::text
       or v_event.payload ->> 'action' is distinct from p_action
       or (v_live_count = 1 and v_event.status not in ('pending', 'processing', 'dead')) then
      return 'conflict';
    end if;

    if v_event.status = 'processing' then
      if v_event.locked_at is not null
         and nullif(btrim(v_event.locked_by), '') is not null
         and v_event.locked_at >= now() - interval '5 minutes'
         and v_event.locked_at <= now()
         and v_event.completed_at is null then
        return 'processing';
      end if;

      update public.outbox_events
      set status = 'pending',
          available_at = now(),
          locked_at = null,
          locked_by = null,
          completed_at = null
      where id = v_event.id;
      return 'pending';
    end if;

    if v_event.status = 'pending' then
      if v_event.locked_at is not null
         or v_event.locked_by is not null
         or v_event.completed_at is not null
         or v_event.available_at > now() then
        update public.outbox_events
        set available_at = now(),
            locked_at = null,
            locked_by = null,
            completed_at = null
        where id = v_event.id;
      end if;
      return 'pending';
    end if;

    if v_event.status in ('dead', 'completed') then
      update public.outbox_events
      set status = 'pending',
          available_at = now(),
          locked_at = null,
          locked_by = null,
          completed_at = null
      where id = v_event.id;
      return 'pending';
    end if;

    return 'conflict';
  end if;

  if v_live_count <> 0 then
    return 'conflict';
  end if;

  insert into public.outbox_events (
    event_type,
    aggregate_type,
    aggregate_id,
    payload
  ) values (
    'profile.media_moderation',
    'profile_photo',
    p_operation_id,
    v_photo.moderation_event_payload
  );

  return 'pending';
exception
  when unique_violation then
    return 'conflict';
end;
$$;

create or replace function public.profile_media_operation_state(
  p_photo_id uuid,
  p_operation_id uuid,
  p_action text
)
returns text
language plpgsql
set search_path = public
as $$
declare
  v_photo public.profile_photos%rowtype;
begin
  select * into v_photo
  from public.profile_photos
  where id = p_photo_id;

  if not found then
    return 'stale';
  end if;

  if v_photo.moderation_operation_id = p_operation_id
     and v_photo.moderation_action = p_action then
    if v_photo.moderation_event_payload is null
       or v_photo.moderation_event_payload_digest is distinct from encode(
            extensions.digest(v_photo.moderation_event_payload::text, 'sha256'),
            'hex'
          ) then
      return 'stale';
    end if;
    if p_action = 'approve'
       and v_photo.approval_status = 'approved'
       and v_photo.storage_bucket = 'approved-profile-photos' then
      return 'publish';
    end if;
    return 'pending';
  end if;

  if v_photo.moderation_operation_id = p_operation_id
     and v_photo.moderation_action is null
     and (
       (p_action = 'approve' and v_photo.approval_status = 'approved')
       or (p_action = 'reject' and v_photo.approval_status = 'rejected')
       or (p_action = 'quarantine' and v_photo.approval_status in ('pending', 'rejected'))
     ) then
    return 'finalized';
  end if;

  return 'stale';
end;
$$;

create or replace function public.request_profile_media_moderation(
  p_photo_id uuid,
  p_reviewer_id uuid,
  p_action text,
  p_reason text default null
)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_photo public.profile_photos%rowtype;
  v_operation_id uuid;
  v_extension text;
  v_thumbnail_extension text;
  v_destination_bucket text;
  v_destination_path text;
  v_destination_thumbnail_path text;
  v_event_payload jsonb;
  v_queue_state text;
begin
  if p_action not in ('approve', 'reject') then
    return jsonb_build_object('error', 'INVALID_MODERATION_ACTION', 'status', 400);
  end if;

  select * into v_photo
  from public.profile_photos
  where id = p_photo_id
  for update;

  if not found then
    return jsonb_build_object('error', 'PHOTO_NOT_FOUND', 'status', 404);
  end if;

  if v_photo.moderation_action is not null then
    if v_photo.moderation_action = p_action then
      v_queue_state := public.ensure_profile_media_operation_event(
        v_photo.id,
        v_photo.moderation_operation_id,
        v_photo.moderation_action
      );
      if v_queue_state = 'conflict' then
        if exists (
          select 1
          from public.profile_media_remediation_alerts alert
          where alert.photo_id = v_photo.id
            and alert.operation_id = v_photo.moderation_operation_id
            and alert.status = 'open'
        ) then
          return jsonb_build_object(
            'error', 'MEDIA_REMEDIATION_REQUIRED',
            'status', 409,
            'operation_id', v_photo.moderation_operation_id
          );
        end if;
        return jsonb_build_object('error', 'MEDIA_EVENT_CONFLICT', 'status', 409);
      end if;
      return to_jsonb(v_photo) || jsonb_build_object('_moderation_queue_state', v_queue_state);
    end if;
    return jsonb_build_object('error', 'MODERATION_IN_PROGRESS', 'status', 409);
  end if;

  if (p_action = 'approve' and v_photo.approval_status = 'approved')
     or (p_action = 'reject' and v_photo.approval_status = 'rejected') then
    return to_jsonb(v_photo);
  end if;

  if p_action = 'approve' and v_photo.approval_status = 'rejected' then
    return jsonb_build_object('error', 'PHOTO_MEDIA_MISSING', 'status', 409);
  end if;

  v_operation_id := gen_random_uuid();
  v_extension := coalesce(substring(v_photo.storage_path from '(\.[a-z0-9]+)$'), '');
  v_thumbnail_extension := coalesce(
    substring(v_photo.thumbnail_storage_path from '(\.[a-z0-9]+)$'),
    ''
  );
  v_destination_bucket := case
    when p_action = 'reject' then null
    when v_photo.is_private then 'private-profile-photos'
    else 'approved-profile-photos'
  end;
  v_destination_path := case when v_destination_bucket is null then null
    else v_photo.user_id::text || '/' || v_operation_id::text || v_extension end;
  v_destination_thumbnail_path := case
    when v_destination_bucket is null or v_photo.thumbnail_storage_path is null then null
    else v_photo.user_id::text || '/' || v_operation_id::text || '_thumb' || v_thumbnail_extension
  end;

  v_event_payload := jsonb_build_object(
    'photo_id', v_photo.id,
    'operation_id', v_operation_id,
    'owner_id', v_photo.user_id,
    'action', p_action,
    'source_bucket', v_photo.storage_bucket,
    'source_path', v_photo.storage_path,
    'source_thumbnail_path', v_photo.thumbnail_storage_path,
    'destination_bucket', v_destination_bucket,
    'destination_path', v_destination_path,
    'destination_thumbnail_path', v_destination_thumbnail_path
  );

  if exists (
    select 1
    from public.outbox_events event
    where event.event_type = 'profile.media_moderation'
      and event.payload ->> 'photo_id' = v_photo.id::text
      and event.status in ('pending', 'processing', 'dead')
  ) then
    return jsonb_build_object('error', 'MEDIA_EVENT_CONFLICT', 'status', 409);
  end if;

  begin
    insert into public.outbox_events (
      event_type,
      aggregate_type,
      aggregate_id,
      payload
    ) values (
      'profile.media_moderation',
      'profile_photo',
      v_operation_id,
      v_event_payload
    );
  exception
    when unique_violation then
      return jsonb_build_object('error', 'MEDIA_EVENT_CONFLICT', 'status', 409);
  end;

  update public.profile_photos
  set moderation_operation_id = v_operation_id,
      moderation_action = p_action,
      moderation_requested_at = timezone('utc', now()),
      moderation_requested_by = p_reviewer_id,
      moderation_event_payload = v_event_payload,
      moderation_event_payload_digest = encode(
        extensions.digest(v_event_payload::text, 'sha256'),
        'hex'
      ),
      rejection_reason = case
        when p_action = 'reject' then nullif(btrim(p_reason), '')
        else null
      end
  where id = p_photo_id
  returning * into v_photo;

  return to_jsonb(v_photo) || jsonb_build_object('_moderation_queue_state', 'pending');
end;
$$;

create or replace function public.finalize_profile_media_moderation(
  p_photo_id uuid,
  p_operation_id uuid,
  p_action text,
  p_storage_bucket text default null,
  p_storage_path text default null,
  p_thumbnail_storage_path text default null,
  p_url text default null,
  p_thumbnail_url text default null
)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_photo public.profile_photos%rowtype;
begin
  select * into v_photo
  from public.profile_photos
  where id = p_photo_id
  for update;

  if not found then
    return jsonb_build_object('error', 'PHOTO_NOT_FOUND', 'status', 404);
  end if;

  if v_photo.moderation_operation_id = p_operation_id
     and v_photo.moderation_action is null then
    return to_jsonb(v_photo);
  end if;

  if v_photo.moderation_operation_id is distinct from p_operation_id
     or v_photo.moderation_action is distinct from p_action then
    return jsonb_build_object('error', 'STALE_MEDIA_OPERATION', 'status', 409);
  end if;

  perform 1 from public.profiles where id = v_photo.user_id for update;

  if p_action = 'approve' then
    if p_storage_bucket is null
       or p_storage_bucket not in ('approved-profile-photos', 'private-profile-photos')
       or nullif(p_storage_path, '') is null
       or nullif(p_url, '') is null then
      return jsonb_build_object('error', 'INVALID_MEDIA_DESTINATION', 'status', 400);
    end if;

    if v_photo.is_cover then
      update public.profile_photos
      set is_cover = false
      where user_id = v_photo.user_id
        and id <> v_photo.id
        and is_cover = true;
    end if;

    update public.profile_photos
    set storage_bucket = p_storage_bucket,
        storage_path = p_storage_path,
        thumbnail_storage_path = p_thumbnail_storage_path,
        url = p_url,
        thumbnail_url = p_thumbnail_url,
        approval_status = 'approved'::public.photo_approval_status,
        reviewed_by = moderation_requested_by,
        reviewed_at = timezone('utc', now()),
        rejection_reason = null,
        moderation_action = case
          -- Public Storage publication is a second durable step. Keep the
          -- operation fenced until both public objects exist.
          when p_storage_bucket = 'approved-profile-photos' then moderation_action
          else null
        end,
        moderation_event_payload = case
          when p_storage_bucket = 'approved-profile-photos' then moderation_event_payload
          else null
        end,
        moderation_event_payload_digest = case
          when p_storage_bucket = 'approved-profile-photos' then moderation_event_payload_digest
          else null
        end
    where id = p_photo_id
    returning * into v_photo;
  elsif p_action = 'reject' then
    update public.profile_photos
    set approval_status = 'rejected'::public.photo_approval_status,
        is_avatar = false,
        is_cover = false,
        reviewed_by = moderation_requested_by,
        reviewed_at = timezone('utc', now()),
        moderation_action = null,
        moderation_event_payload = null,
        moderation_event_payload_digest = null
    where id = p_photo_id
    returning * into v_photo;
  elsif p_action = 'quarantine' then
    if p_storage_bucket is null
       or p_storage_bucket <> 'profile-media-quarantine'
       or nullif(p_storage_path, '') is null
       or nullif(p_url, '') is null then
      return jsonb_build_object('error', 'INVALID_MEDIA_DESTINATION', 'status', 400);
    end if;

    update public.profile_photos
    set storage_bucket = p_storage_bucket,
        storage_path = p_storage_path,
        thumbnail_storage_path = p_thumbnail_storage_path,
        url = p_url,
        thumbnail_url = p_thumbnail_url,
        moderation_action = null,
        moderation_event_payload = null,
        moderation_event_payload_digest = null
    where id = p_photo_id
    returning * into v_photo;
  else
    return jsonb_build_object('error', 'INVALID_MODERATION_ACTION', 'status', 400);
  end if;

  return to_jsonb(v_photo);
end;
$$;

create or replace function public.complete_profile_media_publication(
  p_photo_id uuid,
  p_operation_id uuid
)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_photo public.profile_photos%rowtype;
begin
  select * into v_photo
  from public.profile_photos
  where id = p_photo_id
  for update;

  if not found then
    return jsonb_build_object('error', 'PHOTO_NOT_FOUND', 'status', 404);
  end if;

  if v_photo.moderation_operation_id = p_operation_id
     and v_photo.moderation_action is null
     and v_photo.approval_status = 'approved'
     and v_photo.storage_bucket = 'approved-profile-photos' then
    return to_jsonb(v_photo);
  end if;

  if v_photo.moderation_operation_id is distinct from p_operation_id
     or v_photo.moderation_action is distinct from 'approve'
     or v_photo.approval_status is distinct from 'approved'::public.photo_approval_status
     or v_photo.storage_bucket is distinct from 'approved-profile-photos' then
    return jsonb_build_object('error', 'STALE_MEDIA_OPERATION', 'status', 409);
  end if;

  update public.profile_photos
  set moderation_action = null,
      moderation_event_payload = null,
      moderation_event_payload_digest = null
  where id = p_photo_id
  returning * into v_photo;

  return to_jsonb(v_photo);
end;
$$;

create or replace function public.repair_missing_profile_media_events(
  p_limit integer default 100
)
returns integer
language plpgsql
set search_path = public
as $$
declare
  v_photo public.profile_photos%rowtype;
  v_queue_state text;
  v_repaired integer := 0;
  v_error_code text;
  v_error_detail text;
begin
  if p_limit < 1 or p_limit > 1000 then
    raise exception 'Invalid profile media repair limit';
  end if;

  for v_photo in
    select photo.*
    from public.profile_photos photo
    where photo.moderation_action is not null
      and not exists (
        select 1
        from public.profile_media_remediation_alerts alert
        where alert.photo_id = photo.id
          and alert.operation_id = photo.moderation_operation_id
          and alert.status = 'open'
      )
      and (
        photo.moderation_event_payload is null
        or photo.moderation_event_payload_digest is distinct from encode(
             extensions.digest(photo.moderation_event_payload::text, 'sha256'),
             'hex'
           )
        or not exists (
          select 1
          from public.outbox_events event
          where event.event_type = 'profile.media_moderation'
            and event.aggregate_id = photo.moderation_operation_id::text
            and event.payload = photo.moderation_event_payload
            and (
              (
                event.status = 'pending'
                and event.locked_at is null
                and event.locked_by is null
                and event.completed_at is null
              )
              or (
                event.status = 'processing'
                and event.locked_at >= now() - interval '5 minutes'
                and event.locked_at <= now()
                and nullif(btrim(event.locked_by), '') is not null
                and event.completed_at is null
              )
            )
        )
      )
    order by photo.moderation_requested_at asc nulls first, photo.id
    for update skip locked
    limit p_limit
  loop
    v_error_code := null;
    v_error_detail := null;
    begin
      v_queue_state := public.ensure_profile_media_operation_event(
        v_photo.id,
        v_photo.moderation_operation_id,
        v_photo.moderation_action
      );
    exception
      when others then
        v_queue_state := 'conflict';
        v_error_code := 'MEDIA_REPAIR_EXCEPTION';
        v_error_detail := left(sqlstate || ': ' || sqlerrm, 500);
    end;

    if v_queue_state = 'conflict' then
      v_error_code := coalesce(v_error_code, 'MEDIA_EVENT_CONFLICT');
      v_error_detail := coalesce(
        v_error_detail,
        'Active moderation operation is missing an exact recoverable event snapshot'
      );

      -- Quarantine only this operation. Its decision, photo row, and every
      -- surviving payload remain intact for an explicit operator resolution.
      begin
        perform pg_catalog.set_config(
          'peekpoke.profile_media_remediation_operation',
          v_photo.moderation_operation_id::text,
          true
        );
        update public.outbox_events event
        set status = 'dead',
            available_at = now(),
            locked_at = null,
            locked_by = null,
            last_error = left(v_error_code || ': ' || v_error_detail, 1000),
            completed_at = null
        where event.event_type = 'profile.media_moderation'
          and (
            event.aggregate_id = v_photo.moderation_operation_id::text
            or event.payload ->> 'photo_id' = v_photo.id::text
          )
          and event.status <> 'dead';
      exception
        when others then
          v_error_detail := left(
            v_error_detail || '; quarantine failed ' || sqlstate || ': ' || sqlerrm,
            500
          );
      end;

      -- Alert persistence is isolated from queue progress. A database warning
      -- remains if the evidence table itself is unavailable, while unrelated
      -- outbox work still proceeds.
      begin
        insert into public.profile_media_remediation_alerts (
          photo_id,
          operation_id,
          action,
          error_code,
          error_detail
        ) values (
          v_photo.id,
          v_photo.moderation_operation_id,
          v_photo.moderation_action,
          v_error_code,
          left(v_error_detail, 500)
        )
        on conflict (photo_id, operation_id) do update
        set action = excluded.action,
            error_code = excluded.error_code,
            error_detail = excluded.error_detail,
            occurrence_count = least(
              public.profile_media_remediation_alerts.occurrence_count + 1,
              1000
            ),
            status = 'open',
            last_detected_at = now(),
            resolved_at = null,
            resolved_by = null,
            resolution = null,
            resolution_note = null;
      exception
        when others then
          raise warning '%', jsonb_build_object(
            'event', 'profile_media_remediation_alert_failed',
            'photo_id', v_photo.id,
            'operation_id', v_photo.moderation_operation_id,
            'error_code', v_error_code,
            'persistence_error', left(sqlstate || ': ' || sqlerrm, 300)
          )::text;
      end;
      continue;
    end if;
    v_repaired := v_repaired + 1;
  end loop;

  return v_repaired;
end;
$$;

create or replace function public.resolve_profile_media_remediation(
  p_photo_id uuid,
  p_operation_id uuid,
  p_operator_id uuid,
  p_resolution text,
  p_note text default null
)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_photo public.profile_photos%rowtype;
  v_alert public.profile_media_remediation_alerts%rowtype;
  v_payload jsonb;
  v_queue_state text;
  v_owner_prefix text;
  v_destination_bucket text;
begin
  if p_resolution not in ('reconstruct', 'reset') then
    return jsonb_build_object('error', 'INVALID_REMEDIATION_RESOLUTION', 'status', 400);
  end if;
  if p_resolution = 'reset' and nullif(btrim(p_note), '') is null then
    return jsonb_build_object('error', 'REMEDIATION_NOTE_REQUIRED', 'status', 400);
  end if;

  select * into v_photo
  from public.profile_photos
  where id = p_photo_id
  for update;
  if not found then
    return jsonb_build_object('error', 'PHOTO_NOT_FOUND', 'status', 404);
  end if;

  select * into v_alert
  from public.profile_media_remediation_alerts
  where photo_id = p_photo_id
    and operation_id = p_operation_id
  for update;
  if not found then
    return jsonb_build_object('error', 'REMEDIATION_NOT_FOUND', 'status', 404);
  end if;

  -- A retry after a lost HTTP response serializes on the same alert row and
  -- returns the already-committed result. It never creates another event.
  if v_alert.status = 'resolved' then
    if p_resolution = 'reset'
       and v_alert.resolution = 'decision_reset'
       and v_photo.moderation_operation_id = p_operation_id
       and v_photo.moderation_action is null then
      return to_jsonb(v_photo) || jsonb_build_object(
        '_remediation_state', 'decision_reset',
        '_remediation_replayed', true
      );
    end if;

    if p_resolution = 'reconstruct'
       and v_alert.resolution = 'reconstructed'
       and v_photo.moderation_operation_id = p_operation_id then
      v_queue_state := public.profile_media_operation_state(
        p_photo_id,
        p_operation_id,
        v_alert.action
      );
      if v_queue_state = 'pending' then
        v_queue_state := public.ensure_profile_media_operation_event(
          p_photo_id,
          p_operation_id,
          v_alert.action
        );
      end if;
      if v_queue_state in ('pending', 'processing', 'publish', 'finalized') then
        return to_jsonb(v_photo) || jsonb_build_object(
          '_moderation_queue_state', v_queue_state,
          '_remediation_state', 'reconstructed',
          '_remediation_replayed', true
        );
      end if;
    end if;

    return jsonb_build_object('error', 'REMEDIATION_ALREADY_RESOLVED', 'status', 409);
  end if;

  if v_photo.moderation_operation_id is distinct from p_operation_id
     or v_photo.moderation_action is distinct from v_alert.action then
    return jsonb_build_object('error', 'STALE_MEDIA_OPERATION', 'status', 409);
  end if;

  if p_resolution = 'reset' then
    update public.profile_photos
    set moderation_action = null,
        moderation_event_payload = null,
        moderation_event_payload_digest = null
    where id = p_photo_id
    returning * into v_photo;

    update public.outbox_events event
    set event_type = 'profile.media_moderation.remediation',
        status = 'dead',
        available_at = now(),
        locked_at = null,
        locked_by = null,
        last_error = left('Operator reset: ' || btrim(p_note), 1000),
        completed_at = null
    where event.event_type = 'profile.media_moderation'
      and (
        event.aggregate_id = p_operation_id::text
        or event.payload ->> 'photo_id' = p_photo_id::text
      );

    update public.profile_media_remediation_alerts
    set status = 'resolved',
        resolved_at = now(),
        resolved_by = p_operator_id,
        resolution = 'decision_reset',
        resolution_note = left(btrim(p_note), 500)
    where id = v_alert.id;

    return to_jsonb(v_photo) || jsonb_build_object('_remediation_state', 'decision_reset');
  end if;

  if v_photo.moderation_event_payload is null
     or v_photo.moderation_event_payload_digest is null then
    return jsonb_build_object('error', 'REMEDIATION_SNAPSHOT_MISSING', 'status', 409);
  end if;
  if v_photo.moderation_event_payload_digest is distinct from encode(
       extensions.digest(v_photo.moderation_event_payload::text, 'sha256'),
       'hex'
     ) then
    return jsonb_build_object('error', 'REMEDIATION_SNAPSHOT_DIGEST_MISMATCH', 'status', 409);
  end if;

  -- Only the immutable photo-row snapshot is authoritative. Quarantined event
  -- payloads are evidence and are never promoted back into executable work.
  v_payload := v_photo.moderation_event_payload;
  v_owner_prefix := v_photo.user_id::text || '/';
  v_destination_bucket := v_payload ->> 'destination_bucket';
  if jsonb_typeof(v_payload) is distinct from 'object'
     or v_payload ->> 'photo_id' is distinct from v_photo.id::text
     or v_payload ->> 'operation_id' is distinct from p_operation_id::text
     or v_payload ->> 'owner_id' is distinct from v_photo.user_id::text
     or v_payload ->> 'action' is distinct from v_photo.moderation_action
     or (
       v_payload ->> 'source_bucket' is null
       or v_payload ->> 'source_bucket' not in (
         'profile-media-quarantine',
         'profile-photos',
         'approved-profile-photos',
         'private-profile-photos'
       )
     )
     or nullif(v_payload ->> 'source_path', '') is null
     or left(v_payload ->> 'source_path', char_length(v_owner_prefix)) <> v_owner_prefix
     or position('..' in v_payload ->> 'source_path') > 0
     or position(E'\\' in v_payload ->> 'source_path') > 0
     or (
       v_payload ->> 'source_thumbnail_path' is not null
       and (
         left(v_payload ->> 'source_thumbnail_path', char_length(v_owner_prefix)) <> v_owner_prefix
         or position('..' in v_payload ->> 'source_thumbnail_path') > 0
         or position(E'\\' in v_payload ->> 'source_thumbnail_path') > 0
       )
     )
     or (
       v_photo.moderation_action = 'reject'
       and (
         v_destination_bucket is not null
         or v_payload ->> 'destination_path' is not null
         or v_payload ->> 'destination_thumbnail_path' is not null
       )
     )
     or (
       v_photo.moderation_action = 'approve'
       and (
         v_destination_bucket is distinct from case
           when v_photo.is_private then 'private-profile-photos'
           else 'approved-profile-photos'
         end
         or nullif(v_payload ->> 'destination_path', '') is null
       )
     )
     or (
       v_photo.moderation_action = 'quarantine'
       and (
         v_destination_bucket is distinct from 'profile-media-quarantine'
         or nullif(v_payload ->> 'destination_path', '') is null
       )
     )
     or (
       v_destination_bucket is not null
       and (
         left(v_payload ->> 'destination_path', char_length(v_owner_prefix)) <> v_owner_prefix
         or position('..' in v_payload ->> 'destination_path') > 0
         or position(E'\\' in v_payload ->> 'destination_path') > 0
         or (
           (v_payload ->> 'source_thumbnail_path' is null)
             is distinct from
           (v_payload ->> 'destination_thumbnail_path' is null)
         )
         or (
           v_payload ->> 'destination_thumbnail_path' is not null
           and (
             left(v_payload ->> 'destination_thumbnail_path', char_length(v_owner_prefix)) <> v_owner_prefix
             or position('..' in v_payload ->> 'destination_thumbnail_path') > 0
             or position(E'\\' in v_payload ->> 'destination_thumbnail_path') > 0
           )
         )
       )
     ) then
    return jsonb_build_object('error', 'REMEDIATION_PAYLOAD_INVALID', 'status', 409);
  end if;

  perform pg_catalog.set_config(
    'peekpoke.profile_media_remediation_operation',
    p_operation_id::text,
    true
  );

  -- Preserve every corrupt/live payload as terminal remediation evidence,
  -- then create a fresh exact event solely from the immutable snapshot.
  update public.outbox_events event
  set event_type = 'profile.media_moderation.remediation',
      status = 'dead',
      available_at = now(),
      locked_at = null,
      locked_by = null,
      last_error = 'Superseded by exact operator reconstruction',
      completed_at = null
  where event.event_type = 'profile.media_moderation'
    and (
      event.aggregate_id = p_operation_id::text
      or (
        event.payload ->> 'photo_id' = p_photo_id::text
        and event.status in ('pending', 'processing', 'dead')
      )
    );

  insert into public.outbox_events (
    event_type,
    aggregate_type,
    aggregate_id,
    payload
  ) values (
    'profile.media_moderation',
    'profile_photo',
    p_operation_id,
    v_payload
  );

  update public.profile_media_remediation_alerts
  set status = 'resolved',
      resolved_at = now(),
      resolved_by = p_operator_id,
      resolution = 'reconstructed',
      resolution_note = left(nullif(btrim(p_note), ''), 500)
  where id = v_alert.id;

  v_queue_state := public.ensure_profile_media_operation_event(
    p_photo_id,
    p_operation_id,
    v_photo.moderation_action
  );
  if v_queue_state = 'conflict' then
    raise exception 'Exact remediation reconstruction failed'
      using errcode = '23514';
  end if;

  return to_jsonb(v_photo) || jsonb_build_object(
    '_moderation_queue_state', v_queue_state,
    '_remediation_state', 'reconstructed'
  );
end;
$$;

create or replace function public.guard_active_profile_media_event()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_payload jsonb;
  v_claim_worker text;
  v_remediation_operation text;
begin
  if old.event_type <> 'profile.media_moderation' then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  if tg_op = 'UPDATE' and new.event_type = 'profile.media_moderation' then
    if new.status = 'pending'
       and (
         new.locked_at is not null
         or new.locked_by is not null
         or new.completed_at is not null
       ) then
      raise exception 'Pending profile media work cannot retain a processing lease'
        using errcode = '23514';
    end if;

    if new.status = 'processing' then
      v_claim_worker := current_setting('peekpoke.outbox_worker_id', true);
      if new.locked_at is null
         or nullif(btrim(new.locked_by), '') is null
         or new.locked_at > now()
         or new.completed_at is not null
         or v_claim_worker is distinct from new.locked_by then
        raise exception 'Profile media processing requires a valid worker lease'
          using errcode = '23514';
      end if;

      if old.status = 'processing'
         and old.locked_at is not null
         and nullif(btrim(old.locked_by), '') is not null
         and old.locked_at >= now() - interval '5 minutes'
         and old.locked_at <= now()
         and (
           new.locked_at is distinct from old.locked_at
           or new.locked_by is distinct from old.locked_by
         ) then
        raise exception 'Cannot replace an unexpired profile media worker lease'
          using errcode = '23514';
      end if;
    end if;
  end if;

  select photo.moderation_event_payload into v_payload
  from public.profile_photos photo
  where photo.moderation_action is not null
    and photo.moderation_operation_id::text = old.aggregate_id
  for update;

  if not found then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    raise exception 'Cannot delete the event for an active profile media operation'
      using errcode = '23503';
  end if;

  v_remediation_operation := current_setting(
    'peekpoke.profile_media_remediation_operation',
    true
  );
  if new.status = 'dead'
     and v_remediation_operation = old.aggregate_id
     and new.event_type in (old.event_type, 'profile.media_moderation.remediation')
     and new.aggregate_id = old.aggregate_id
     and new.payload = old.payload
     and new.locked_at is null
     and new.locked_by is null
     and new.completed_at is null then
    return new;
  end if;

  if new.event_type is distinct from old.event_type
     or new.aggregate_id is distinct from old.aggregate_id
     or new.payload is distinct from v_payload
     or new.status not in ('pending', 'processing') then
    raise exception 'Cannot invalidate the event for an active profile media operation'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create or replace function public.guard_active_profile_media_snapshot()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.moderation_action is null then
    return new;
  end if;

  if old.moderation_event_payload is not null
     and old.moderation_event_payload_digest is null
     and new.moderation_operation_id = old.moderation_operation_id
     and new.moderation_action = old.moderation_action
     and new.moderation_event_payload = old.moderation_event_payload
     and new.moderation_event_payload_digest = encode(
       extensions.digest(old.moderation_event_payload::text, 'sha256'),
       'hex'
     ) then
    return new;
  end if;

  if new.moderation_operation_id is distinct from old.moderation_operation_id
     or (
       new.moderation_action is not null
       and (
         new.moderation_action is distinct from old.moderation_action
         or new.moderation_event_payload is distinct from old.moderation_event_payload
         or new.moderation_event_payload_digest
              is distinct from old.moderation_event_payload_digest
       )
     )
     or (
       new.moderation_action is null
       and (
         new.moderation_event_payload is not null
         or new.moderation_event_payload_digest is not null
       )
     ) then
    raise exception 'Cannot mutate an active profile media operation snapshot'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists guard_active_profile_media_snapshot_change
  on public.profile_photos;
create trigger guard_active_profile_media_snapshot_change
before update of moderation_operation_id, moderation_action, moderation_event_payload,
  moderation_event_payload_digest
on public.profile_photos
for each row execute function public.guard_active_profile_media_snapshot();

drop trigger if exists guard_active_profile_media_event_change
  on public.outbox_events;
create trigger guard_active_profile_media_event_change
before update or delete on public.outbox_events
for each row execute function public.guard_active_profile_media_event();

-- Every worker claim repairs legacy/missing active operations in the same
-- transaction before selecting work, so a repaired event is immediately
-- claimable without relying on another moderator request.
create or replace function public.claim_outbox_events(
  p_limit integer,
  p_worker_id text
)
returns setof public.outbox_events
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_limit < 1 or p_limit > 100 or nullif(btrim(p_worker_id), '') is null then
    raise exception 'Invalid outbox claim';
  end if;

  perform public.repair_missing_profile_media_events(p_limit);
  perform pg_catalog.set_config('peekpoke.outbox_worker_id', p_worker_id, true);

  return query
  with claimable as (
    select event.id
    from public.outbox_events event
    where (
      event.status = 'pending'
      or (
        event.status = 'processing'
        and (
          event.locked_at is null
          or nullif(btrim(event.locked_by), '') is null
          or event.locked_at < now() - interval '5 minutes'
          or event.locked_at > now()
        )
      )
    )
      and not exists (
        select 1
        from public.profile_media_remediation_alerts alert
        where alert.status = 'open'
          and event.event_type = 'profile.media_moderation'
          and (
            alert.operation_id::text = event.aggregate_id
            or alert.photo_id::text = event.payload ->> 'photo_id'
          )
      )
      and event.available_at <= now()
    order by event.available_at asc, event.created_at asc
    for update skip locked
    limit p_limit
  )
  update public.outbox_events event
  set
    status = 'processing',
    attempts = event.attempts + 1,
    locked_at = now(),
    locked_by = p_worker_id
  from claimable
  where event.id = claimable.id
  returning event.*;
end;
$$;

revoke all on function public.ensure_profile_media_operation_event(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.profile_media_operation_state(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.request_profile_media_moderation(uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function public.finalize_profile_media_moderation(uuid, uuid, text, text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.complete_profile_media_publication(uuid, uuid) from public, anon, authenticated;
revoke all on function public.repair_missing_profile_media_events(integer) from public, anon, authenticated;
revoke all on function public.resolve_profile_media_remediation(uuid, uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function public.guard_active_profile_media_event() from public, anon, authenticated;
revoke all on function public.guard_active_profile_media_snapshot() from public, anon, authenticated;
revoke all on function public.claim_outbox_events(integer, text) from public, anon, authenticated;
grant execute on function public.ensure_profile_media_operation_event(uuid, uuid, text) to service_role;
grant execute on function public.profile_media_operation_state(uuid, uuid, text) to service_role;
grant execute on function public.request_profile_media_moderation(uuid, uuid, text, text) to service_role;
grant execute on function public.finalize_profile_media_moderation(uuid, uuid, text, text, text, text, text, text) to service_role;
grant execute on function public.complete_profile_media_publication(uuid, uuid) to service_role;
grant execute on function public.repair_missing_profile_media_events(integer) to service_role;
grant execute on function public.resolve_profile_media_remediation(uuid, uuid, uuid, text, text) to service_role;
grant execute on function public.claim_outbox_events(integer, text) to service_role;

-- Existing rejected objects are deleted before their already-rejected state is
-- considered converged. Existing pending objects are copied out of the legacy
-- bucket. Existing approved public objects are promoted to the new public-only
-- bucket. The legacy bucket was made private above before any event can run.
with candidates as (
  select
    photo.id,
    photo.user_id,
    photo.storage_bucket,
    photo.storage_path,
    photo.thumbnail_storage_path,
    photo.approval_status,
    photo.is_private,
    gen_random_uuid() as operation_id
  from public.profile_photos photo
  where (photo.approval_status = 'approved' and photo.storage_bucket = 'profile-photos')
     or (photo.approval_status = 'pending' and photo.storage_bucket <> 'profile-media-quarantine')
     or photo.approval_status = 'rejected'
), prepared as (
  select
    candidate.*,
    case
      when candidate.approval_status = 'approved' then 'approve'
      when candidate.approval_status = 'rejected' then 'reject'
      else 'quarantine'
    end as action,
    case
      when candidate.approval_status = 'rejected' then null
      when candidate.approval_status = 'approved' and candidate.is_private then 'private-profile-photos'
      when candidate.approval_status = 'approved' then 'approved-profile-photos'
      else 'profile-media-quarantine'
    end as destination_bucket
  from candidates candidate
), payloads as (
  select
    prepared.*,
    jsonb_build_object(
      'photo_id', prepared.id,
      'operation_id', prepared.operation_id,
      'owner_id', prepared.user_id,
      'action', prepared.action,
      'source_bucket', prepared.storage_bucket,
      'source_path', prepared.storage_path,
      'source_thumbnail_path', prepared.thumbnail_storage_path,
      'destination_bucket', prepared.destination_bucket,
      'destination_path', case when prepared.destination_bucket is null then null
        else prepared.user_id::text || '/' || prepared.operation_id::text
          || coalesce(substring(prepared.storage_path from '(\.[a-z0-9]+)$'), '') end,
      'destination_thumbnail_path', case
        when prepared.destination_bucket is null or prepared.thumbnail_storage_path is null then null
        else prepared.user_id::text || '/' || prepared.operation_id::text || '_thumb'
          || coalesce(substring(prepared.thumbnail_storage_path from '(\.[a-z0-9]+)$'), '') end
    ) as event_payload
  from prepared
), queued as (
  update public.profile_photos photo
  set moderation_operation_id = payloads.operation_id,
      moderation_action = payloads.action,
      moderation_requested_at = timezone('utc', now()),
      moderation_event_payload = payloads.event_payload,
      moderation_event_payload_digest = encode(
        extensions.digest(payloads.event_payload::text, 'sha256'),
        'hex'
      )
  from payloads
  where photo.id = payloads.id
    and photo.moderation_action is null
  returning
    photo.id,
    photo.moderation_operation_id as operation_id,
    photo.moderation_event_payload as event_payload
)
insert into public.outbox_events (
  event_type,
  aggregate_type,
  aggregate_id,
  payload
)
select
  'profile.media_moderation',
  'profile_photo',
  queued.operation_id,
  queued.event_payload
from queued;

-- Digest only independently preserved snapshots. Event payloads are never used
-- to reconstruct missing authoritative photo state.
update public.profile_photos photo
set moderation_event_payload_digest = encode(
  extensions.digest(photo.moderation_event_payload::text, 'sha256'),
  'hex'
)
where photo.moderation_action is not null
  and photo.moderation_event_payload is not null
  and photo.moderation_event_payload_digest is null;

-- Normalize malformed legacy leases without discarding retry/error audit. A
-- valid unexpired processing lease is left untouched for its current worker.
update public.outbox_events
set status = 'pending',
    available_at = now(),
    locked_at = null,
    locked_by = null,
    completed_at = null
where event_type = 'profile.media_moderation'
  and status = 'processing'
  and (
    locked_at is null
    or nullif(btrim(locked_by), '') is null
    or locked_at < now() - interval '5 minutes'
    or locked_at > now()
    or completed_at is not null
  );

update public.outbox_events
set available_at = now(),
    locked_at = null,
    locked_by = null,
    completed_at = null
where event_type = 'profile.media_moderation'
  and status = 'pending'
  and (
    locked_at is not null
    or locked_by is not null
    or completed_at is not null
  );

select public.repair_missing_profile_media_events(1000);

alter table public.profile_photos
  validate constraint profile_photos_moderation_event_fence_check;

alter table public.outbox_events
  validate constraint outbox_events_profile_media_lease_check;
