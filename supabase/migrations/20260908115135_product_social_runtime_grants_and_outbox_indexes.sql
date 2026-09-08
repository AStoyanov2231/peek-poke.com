-- Correct production-only assumptions discovered after the product-social migrations were applied.
-- This migration is forward-only and intentionally leaves the deployed migration SQL unchanged.

-- Each ON CONFLICT inference clause in create_poke/respond_to_poke needs its own
-- matching partial unique index because the legacy outbox baseline has no global
-- (event_type, aggregate_id) uniqueness constraint and no Poke event indexes.
do $outbox_poke_index_name_guard$
begin
  if pg_catalog.to_regclass('public.outbox_events_poke_created_aggregate_id_uidx') is not null
     or pg_catalog.to_regclass('public.outbox_events_poke_accepted_aggregate_id_uidx') is not null then
    raise exception 'refusing to create Poke outbox indexes because an expected index name already exists';
  end if;
end;
$outbox_poke_index_name_guard$;

create unique index outbox_events_poke_created_aggregate_id_uidx
  on public.outbox_events (event_type, aggregate_id)
  where event_type = 'poke.created';

create unique index outbox_events_poke_accepted_aggregate_id_uidx
  on public.outbox_events (event_type, aggregate_id)
  where event_type = 'poke.accepted';

-- Server-only routes and the outbox worker use the service role directly.
-- Browser roles remain revoked and every table already has RLS enabled.
grant select, insert, update, delete on table
  public.user_availabilities,
  public.pokes,
  public.social_idempotency_records,
  public.plans,
  public.plan_members,
  public.plan_share_tokens,
  public.plan_join_idempotency,
  public.plan_create_idempotency
  to service_role;

grant execute on function public.authorize_poke_delivery(uuid, text, uuid, uuid, uuid)
  to service_role;

-- Owner, profile-cascade, and meetup pair lookups need simple leading-key indexes.
create index if not exists plans_owner_id_idx on public.plans (owner_id);
create index if not exists meetup_acknowledgements_user_b_id_idx on public.meetup_acknowledgements (user_b_id);
create index if not exists plan_meetup_acknowledgements_user_a_id_idx on public.plan_meetup_acknowledgements (user_a_id);
create index if not exists plan_meetup_acknowledgements_user_b_id_idx on public.plan_meetup_acknowledgements (user_b_id);
