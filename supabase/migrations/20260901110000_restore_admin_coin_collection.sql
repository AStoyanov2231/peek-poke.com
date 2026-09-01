do $$
begin
  if pg_catalog.to_regclass('public.admin_coins') is null
     or pg_catalog.to_regclass('public.admin_coin_collections') is null
     or pg_catalog.to_regclass('public.user_locations') is null
     or pg_catalog.to_regclass('public.user_coins') is null
     or pg_catalog.to_regclass('public.coin_transactions') is null then
    raise exception 'The hosted coin schema baseline must be present before bot collection';
  end if;
end;
$$;

create unique index if not exists admin_coin_collections_coin_user_uidx
  on public.admin_coin_collections (coin_id, user_id);

create or replace function public.collect_admin_coin_for_user(
  p_user_id uuid,
  p_coin_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lat double precision;
  v_lng double precision;
  v_coin_lat double precision;
  v_coin_lng double precision;
  v_distance_km double precision;
  v_balance integer;
  v_claimed integer;
begin
  select location.lat, location.lng
  into v_lat, v_lng
  from public.user_locations location
  where location.user_id = p_user_id
    and location.verified_at is not null
    and location.updated_at > pg_catalog.now() - interval '10 minutes';
  if not found then
    return pg_catalog.jsonb_build_object('ok', false, 'reason', 'location_stale');
  end if;

  select coin.lat, coin.lng
  into v_coin_lat, v_coin_lng
  from public.admin_coins coin
  where coin.id = p_coin_id;
  if not found then
    return pg_catalog.jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  v_distance_km := 6371 * 2 * asin(sqrt(
    power(sin(radians((v_coin_lat - v_lat) / 2)), 2)
    + cos(radians(v_lat)) * cos(radians(v_coin_lat))
    * power(sin(radians((v_coin_lng - v_lng) / 2)), 2)
  ));
  if v_distance_km > 0.05 then
    return pg_catalog.jsonb_build_object('ok', false, 'reason', 'too_far');
  end if;

  insert into public.user_coins (user_id, balance)
  values (p_user_id, 5)
  on conflict (user_id) do nothing;

  select wallet.balance
  into v_balance
  from public.user_coins wallet
  where wallet.user_id = p_user_id
  for update;
  if v_balance is null then
    return pg_catalog.jsonb_build_object('ok', false, 'reason', 'wallet_not_found');
  end if;
  if exists (
    select 1
    from public.admin_coin_collections collection
    where collection.coin_id = p_coin_id
      and collection.user_id = p_user_id
  ) then
    return pg_catalog.jsonb_build_object('ok', false, 'reason', 'already_collected', 'balance', v_balance);
  end if;
  if v_balance >= 5 then
    return pg_catalog.jsonb_build_object('ok', false, 'reason', 'at_capacity', 'balance', v_balance);
  end if;

  insert into public.admin_coin_collections (coin_id, user_id)
  values (p_coin_id, p_user_id)
  on conflict do nothing;
  get diagnostics v_claimed = row_count;
  if v_claimed <> 1 then
    return pg_catalog.jsonb_build_object('ok', false, 'reason', 'already_collected', 'balance', v_balance);
  end if;

  update public.user_coins wallet
  set balance = pg_catalog.least(wallet.balance + 1, 5),
      updated_at = pg_catalog.now()
  where wallet.user_id = p_user_id
  returning wallet.balance into v_balance;

  insert into public.coin_transactions (user_id, amount, reason)
  values (p_user_id, 1, 'admin_coin_collected');

  return pg_catalog.jsonb_build_object('ok', true, 'balance', v_balance);
end;
$$;

revoke all on function public.collect_admin_coin_for_user(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.collect_admin_coin_for_user(uuid, uuid)
  to service_role;
