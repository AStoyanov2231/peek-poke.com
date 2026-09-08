-- Exact discovery coordinates have a short retention window. This worker-facing
-- function is intentionally bounded so a delayed scheduler cannot lock or
-- delete an unbounded portion of the table in one run.
do $$
begin
  if pg_catalog.to_regclass('public.user_locations') is null then
    raise exception 'user_locations baseline must be applied first';
  end if;
end;
$$;

create or replace function public.purge_stale_user_locations(
  p_batch_size integer default 1000
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_batch_size integer := greatest(1, least(coalesce(p_batch_size, 1000), 1000));
  v_deleted integer;
begin
  with locked_stale_locations as (
    select location.user_id
    from public.user_locations location
    where location.updated_at < pg_catalog.now() - interval '10 minutes'
    order by location.updated_at asc, location.user_id asc
    for update skip locked
    limit v_batch_size
  ), deleted as (
    delete from public.user_locations location
    using locked_stale_locations stale
    where location.user_id = stale.user_id
    returning 1
  )
  select count(*)::integer into v_deleted from deleted;

  return v_deleted;
end;
$$;

revoke all on function public.purge_stale_user_locations(integer) from public, anon, authenticated;
grant execute on function public.purge_stale_user_locations(integer) to service_role;
