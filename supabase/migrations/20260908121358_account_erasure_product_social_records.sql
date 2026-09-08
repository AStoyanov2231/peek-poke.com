-- Account erasure is a soft profile tombstone, so foreign-key cascades alone do
-- not remove product-social records. Keep this cleanup in the same transaction
-- as the tombstone and repair rows left by erasures before this migration.

do $product_social_erasure_baseline$
declare
  v_legacy_outbox_rows bigint;
begin
  if pg_catalog.to_regclass('public.profiles') is null
     or pg_catalog.to_regclass('public.outbox_events') is null
     or pg_catalog.to_regclass('public.user_availabilities') is null
     or pg_catalog.to_regclass('public.pokes') is null
     or pg_catalog.to_regclass('public.social_idempotency_records') is null
     or pg_catalog.to_regclass('public.idempotency_records') is null
     or pg_catalog.to_regclass('public.plans') is null
     or pg_catalog.to_regclass('public.plan_members') is null
     or pg_catalog.to_regclass('public.plan_share_tokens') is null
     or pg_catalog.to_regclass('public.plan_join_idempotency') is null
     or pg_catalog.to_regclass('public.plan_create_idempotency') is null
     or pg_catalog.to_regclass('public.meetup_acknowledgements') is null
     or pg_catalog.to_regclass('public.plan_meetup_acknowledgements') is null
     or pg_catalog.to_regclass('public.discovery_preferences') is null
     or pg_catalog.to_regclass('public.product_first_activations') is null
     or pg_catalog.to_regclass('public.product_activity_days') is null
     or pg_catalog.to_regclass('public.product_discovery_daily_activity') is null then
    raise exception 'product-social account-erasure relations must exist before this migration';
  end if;
  if exists (
    select 1
    from pg_catalog.pg_trigger trigger
    where trigger.tgrelid = 'public.profiles'::regclass
      and trigger.tgname = 'erase_product_social_records_on_tombstone'
      and not trigger.tgisinternal
  ) then
    raise exception 'refusing to replace an existing product-social account-erasure trigger';
  end if;

  -- These old outbox rows are the only backfill records without a foreign key.
  -- Refuse to erase them until an operator has captured the affected payloads.
  select count(*) into v_legacy_outbox_rows
  from public.outbox_events event
  join public.profiles profile
    on profile.deleted_at is not null
   and (
     event.payload ->> 'sender_id' = profile.id::text
     or event.payload ->> 'recipient_id' = profile.id::text
   )
  where event.event_type in ('poke.created', 'poke.accepted');
  if v_legacy_outbox_rows > 0 then
    raise exception using
      errcode = '55000',
      message = format(
        'refusing product-social account-erasure backfill: %s affected legacy Poke outbox rows need a scoped backup before cleanup',
        v_legacy_outbox_rows
      );
  end if;
end;
$product_social_erasure_baseline$;

create function public.purge_erased_account_product_social_records(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Poke notification payloads retain participant identifiers on a legacy table.
  delete from public.outbox_events event
  where event.event_type in ('poke.created', 'poke.accepted')
    and (
      event.payload ->> 'sender_id' = p_user_id::text
      or event.payload ->> 'recipient_id' = p_user_id::text
    );

  -- Peer idempotency snapshots can retain a Poke note or an owned Plan after
  -- the account's rows are removed. Delete only responses that reference this
  -- account or one of its Plans before deleting the referenced row.
  delete from public.social_idempotency_records record
  where record.actor_id = p_user_id
     or record.response -> 'poke' ->> 'senderId' = p_user_id::text
     or record.response -> 'poke' ->> 'recipientId' = p_user_id::text;

  delete from public.plan_join_idempotency record
  using public.plans plan
  where plan.owner_id = p_user_id
    and record.response_body -> 'plan' ->> 'id' = plan.id::text;
  delete from public.plan_join_idempotency record where record.actor_id = p_user_id;
  delete from public.plan_create_idempotency record where record.actor_id = p_user_id;

  delete from public.idempotency_records record
  where record.actor_id = p_user_id
     or record.response_body -> 'friendship' ->> 'requester_id' = p_user_id::text
     or record.response_body -> 'friendship' ->> 'addressee_id' = p_user_id::text
     or record.response_body -> 'meetup' ->> 'peerId' = p_user_id::text
     or record.response_body @> jsonb_build_object(
       'acknowledgements',
       jsonb_build_array(jsonb_build_object('peerId', p_user_id))
     );

  -- Removing an owned Plan cascades its members, share tokens, and Plan meetups.
  delete from public.plans plan where plan.owner_id = p_user_id;
  delete from public.plan_members member where member.user_id = p_user_id;
  delete from public.plan_share_tokens token where token.created_by = p_user_id;
  delete from public.plan_meetup_acknowledgements acknowledgement
  where acknowledgement.user_a_id = p_user_id or acknowledgement.user_b_id = p_user_id;

  delete from public.pokes poke where poke.sender_id = p_user_id or poke.recipient_id = p_user_id;
  delete from public.user_availabilities availability where availability.user_id = p_user_id;
  delete from public.meetup_acknowledgements acknowledgement
  where acknowledgement.user_a_id = p_user_id or acknowledgement.user_b_id = p_user_id;
  delete from public.discovery_preferences preference where preference.user_id = p_user_id;
  delete from public.product_first_activations activation where activation.user_id = p_user_id;
  delete from public.product_activity_days activity where activity.user_id = p_user_id;
  delete from public.product_discovery_daily_activity activity where activity.user_id = p_user_id;
end;
$$;

revoke all on function public.purge_erased_account_product_social_records(uuid)
  from public, anon, authenticated, service_role;

create function public.erase_product_social_records_on_profile_tombstone()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.deleted_at is not null and old.deleted_at is null then
    perform public.purge_erased_account_product_social_records(new.id);
  end if;
  return new;
end;
$$;

revoke all on function public.erase_product_social_records_on_profile_tombstone()
  from public, anon, authenticated, service_role;

create trigger erase_product_social_records_on_tombstone
before update of deleted_at on public.profiles
for each row
when (old.deleted_at is null and new.deleted_at is not null)
execute function public.erase_product_social_records_on_profile_tombstone();

-- Erasures completed before the trigger existed remain soft-deleted profiles.
-- Lock each tombstone so the scoped cleanup cannot race a concurrent profile update.
do $product_social_erasure_backfill$
declare
  v_user_id uuid;
begin
  for v_user_id in
    select profile.id
    from public.profiles profile
    where profile.deleted_at is not null
    for update
  loop
    perform public.purge_erased_account_product_social_records(v_user_id);
  end loop;
end;
$product_social_erasure_backfill$;

-- Every product-social write must reject a profile already tombstoned. This
-- closes the check-then-insert race between a service RPC and the profile
-- tombstone trigger without changing any RPC response contract.
create function public.reject_tombstoned_product_social_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_ids uuid[];
  v_user_id uuid;
  v_deleted_at timestamptz;
begin
  -- Acquire profile locks in a canonical order. A concurrent tombstone waits
  -- for this write then purges it, or commits first and makes this write fail.
  select array_agg(distinct user_id order by user_id)
  into v_user_ids
  from (
    select (to_jsonb(new) ->> column_name)::uuid as user_id
    from unnest(tg_argv) as argument(column_name)
  ) referenced
  where user_id is not null;

  foreach v_user_id in array coalesce(v_user_ids, '{}'::uuid[]) loop
    select profile.deleted_at into v_deleted_at
    from public.profiles profile
    where profile.id = v_user_id
    for share;
    if not found or v_deleted_at is not null then
      raise exception using
        errcode = '23514',
        message = 'cannot write product-social data for a deleted account';
    end if;
  end loop;
  return new;
end;
$$;

revoke all on function public.reject_tombstoned_product_social_profile()
  from public, anon, authenticated, service_role;

create function public.reject_tombstoned_poke_outbox_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_ids uuid[];
  v_user_id uuid;
  v_deleted_at timestamptz;
begin
  if new.event_type not in ('poke.created', 'poke.accepted') then
    return new;
  end if;

  select array_agg(distinct user_id order by user_id)
  into v_user_ids
  from unnest(array[
    (new.payload ->> 'sender_id')::uuid,
    (new.payload ->> 'recipient_id')::uuid
  ]) as referenced(user_id)
  where user_id is not null;

  foreach v_user_id in array coalesce(v_user_ids, '{}'::uuid[]) loop
    select profile.deleted_at into v_deleted_at
    from public.profiles profile
    where profile.id = v_user_id
    for share;
    if not found or v_deleted_at is not null then
      raise exception using
        errcode = '23514',
        message = 'cannot queue a Poke event for a deleted account';
    end if;
  end loop;
  return new;
end;
$$;

revoke all on function public.reject_tombstoned_poke_outbox_event()
  from public, anon, authenticated, service_role;

create trigger product_social_active_availability_profile
before insert or update on public.user_availabilities
for each row execute function public.reject_tombstoned_product_social_profile('user_id');
create trigger product_social_active_poke_profiles
before insert or update on public.pokes
for each row execute function public.reject_tombstoned_product_social_profile('sender_id', 'recipient_id');
create trigger product_social_active_social_idempotency_profile
before insert or update on public.social_idempotency_records
for each row execute function public.reject_tombstoned_product_social_profile('actor_id');
create trigger product_social_active_plan_owner
before insert or update on public.plans
for each row execute function public.reject_tombstoned_product_social_profile('owner_id');
create trigger product_social_active_plan_member
before insert or update on public.plan_members
for each row execute function public.reject_tombstoned_product_social_profile('user_id');
create trigger product_social_active_plan_share_creator
before insert or update on public.plan_share_tokens
for each row execute function public.reject_tombstoned_product_social_profile('created_by');
create trigger product_social_active_plan_join_idempotency_profile
before insert or update on public.plan_join_idempotency
for each row execute function public.reject_tombstoned_product_social_profile('actor_id');
create trigger product_social_active_plan_create_idempotency_profile
before insert or update on public.plan_create_idempotency
for each row execute function public.reject_tombstoned_product_social_profile('actor_id');
create trigger product_social_active_meetup_profiles
before insert or update on public.meetup_acknowledgements
for each row execute function public.reject_tombstoned_product_social_profile('user_a_id', 'user_b_id');
create trigger product_social_active_plan_meetup_profiles
before insert or update on public.plan_meetup_acknowledgements
for each row execute function public.reject_tombstoned_product_social_profile('user_a_id', 'user_b_id');
create trigger product_social_active_discovery_preference_profile
before insert or update on public.discovery_preferences
for each row execute function public.reject_tombstoned_product_social_profile('user_id');
create trigger product_social_active_first_activation_profile
before insert or update on public.product_first_activations
for each row execute function public.reject_tombstoned_product_social_profile('user_id');
create trigger product_social_active_activity_day_profile
before insert or update on public.product_activity_days
for each row execute function public.reject_tombstoned_product_social_profile('user_id');
create trigger product_social_active_discovery_daily_activity_profile
before insert or update on public.product_discovery_daily_activity
for each row execute function public.reject_tombstoned_product_social_profile('user_id');
create trigger product_social_active_poke_outbox_event
before insert or update on public.outbox_events
for each row execute function public.reject_tombstoned_poke_outbox_event();
