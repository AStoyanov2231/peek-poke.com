-- Run only on a disposable staging branch after loading release-representative
-- data and ANALYZE. Override the default floor with:
--   set app.profile_fanout_explain_min_rows = '25000';
-- The script fails on a sequential scan of a relevant table or when any
-- relevant relation lacks an index/index-only/bitmap-heap access node.

begin;

create function pg_temp.assert_profile_fanout_indexed_plan(
  p_query text,
  p_label text,
  p_relations text[]
)
returns void
language plpgsql
set search_path = ''
as $function$
declare
  v_plan jsonb;
  v_relation text;
begin
  execute 'explain (format json, costs off) ' || p_query into v_plan;

  foreach v_relation in array p_relations loop
    if exists (
      select 1
      from pg_catalog.jsonb_path_query(v_plan, '$.**') node
      where node ->> 'Node Type' = 'Seq Scan'
        and node ->> 'Relation Name' = v_relation
    ) then
      raise exception '% sequentially scanned %: %', p_label, v_relation, v_plan;
    end if;

    if not exists (
      select 1
      from pg_catalog.jsonb_path_query(v_plan, '$.**') node
      where node ->> 'Relation Name' = v_relation
        -- BitmapOr/Bitmap Index Scan trees expose the relation on their
        -- Bitmap Heap Scan parent; ordinary and covering scans expose it on
        -- Index Scan or Index Only Scan directly.
        and node ->> 'Node Type' in (
          'Index Scan',
          'Index Only Scan',
          'Bitmap Heap Scan'
        )
    ) then
      raise exception '% lacks indexed access for %: %', p_label, v_relation, v_plan;
    end if;
  end loop;
end
$function$;

do $fixture$
declare
  v_min_rows bigint := pg_catalog.coalesce(
    pg_catalog.nullif(
      pg_catalog.current_setting(
        'app.profile_fanout_explain_min_rows',
        true
      ),
      ''
    )::bigint,
    10000
  );
  v_estimated_rows bigint;
  v_profile_id uuid;
  v_recipient_id uuid;
  v_relation text;
begin
  foreach v_relation in array array[
    'profiles',
    'friendships',
    'dm_threads',
    'user_blocks'
  ] loop
    select pg_catalog.greatest(relation.reltuples, 0)::bigint
    into v_estimated_rows
    from pg_catalog.pg_class relation
    where relation.oid = pg_catalog.to_regclass('public.' || v_relation);

    if v_estimated_rows < v_min_rows then
      raise exception
        'Representative fixture requires at least % analyzed % rows; found %',
        v_min_rows,
        v_relation,
        v_estimated_rows;
    end if;
  end loop;

  select friendship.requester_id, friendship.addressee_id
  into v_profile_id, v_recipient_id
  from public.friendships friendship
  where friendship.status in ('pending', 'accepted')
  order by friendship.requester_id, friendship.addressee_id
  limit 1;

  if v_profile_id is null or v_recipient_id is null then
    raise exception 'Representative fixture requires an active friendship';
  end if;

  perform pg_temp.assert_profile_fanout_indexed_plan(
    pg_catalog.format(
      'select friendship.addressee_id from public.friendships friendship where friendship.requester_id = %L::uuid and friendship.status in (''pending'', ''accepted'')',
      v_profile_id
    ),
    'requester-first friendship expansion',
    array['friendships']
  );
  perform pg_temp.assert_profile_fanout_indexed_plan(
    pg_catalog.format(
      'select friendship.requester_id from public.friendships friendship where friendship.addressee_id = %L::uuid and friendship.status in (''pending'', ''accepted'')',
      v_profile_id
    ),
    'addressee-first friendship expansion',
    array['friendships']
  );
  perform pg_temp.assert_profile_fanout_indexed_plan(
    pg_catalog.format(
      'select 1 from public.friendships friendship where friendship.requester_id = %L::uuid and friendship.addressee_id = %L::uuid and friendship.status in (''pending'', ''accepted'')',
      v_profile_id,
      v_recipient_id
    ),
    'direct friendship delivery membership guard',
    array['friendships']
  );
  perform pg_temp.assert_profile_fanout_indexed_plan(
    pg_catalog.format(
      'select 1 from public.friendships friendship where friendship.requester_id = %L::uuid and friendship.addressee_id = %L::uuid and friendship.status in (''pending'', ''accepted'')',
      v_recipient_id,
      v_profile_id
    ),
    'reverse friendship delivery membership guard',
    array['friendships']
  );
  perform pg_temp.assert_profile_fanout_indexed_plan(
    pg_catalog.format(
      'select thread.participant_2_id from public.dm_threads thread where thread.participant_1_id = %L::uuid',
      v_profile_id
    ),
    'participant-one DM expansion',
    array['dm_threads']
  );
  perform pg_temp.assert_profile_fanout_indexed_plan(
    pg_catalog.format(
      'select thread.participant_1_id from public.dm_threads thread where thread.participant_2_id = %L::uuid',
      v_profile_id
    ),
    'participant-two DM expansion',
    array['dm_threads']
  );
  perform pg_temp.assert_profile_fanout_indexed_plan(
    pg_catalog.format(
      'select 1 from public.dm_threads thread where thread.participant_1_id = %L::uuid and thread.participant_2_id = %L::uuid',
      v_profile_id,
      v_recipient_id
    ),
    'direct DM delivery membership guard',
    array['dm_threads']
  );
  perform pg_temp.assert_profile_fanout_indexed_plan(
    pg_catalog.format(
      'select 1 from public.dm_threads thread where thread.participant_1_id = %L::uuid and thread.participant_2_id = %L::uuid',
      v_recipient_id,
      v_profile_id
    ),
    'reverse DM delivery membership guard',
    array['dm_threads']
  );
  perform pg_temp.assert_profile_fanout_indexed_plan(
    pg_catalog.format(
      'select 1 from public.user_blocks block where (block.blocker_id = %L::uuid and block.blocked_id = %L::uuid) or (block.blocker_id = %L::uuid and block.blocked_id = %L::uuid)',
      v_profile_id,
      v_recipient_id,
      v_recipient_id,
      v_profile_id
    ),
    'bilateral block OR guard',
    array['user_blocks']
  );
  perform pg_temp.assert_profile_fanout_indexed_plan(
    pg_catalog.format(
      'select 1 from public.profiles profile where profile.id = %L::uuid and profile.deleted_at is null',
      v_profile_id
    ),
    'live profile lookup',
    array['profiles']
  );
  perform pg_temp.assert_profile_fanout_indexed_plan(
    pg_catalog.format(
      $query$
        select exists (
          select 1
          from public.profiles source_profile
          join public.profiles recipient_profile
            on recipient_profile.id = %2$L::uuid
           and recipient_profile.deleted_at is null
          where source_profile.id = %1$L::uuid
            and source_profile.deleted_at is null
            and (
              %1$L::uuid = %2$L::uuid
              or (
                not exists (
                  select 1
                  from public.user_blocks block
                  where (
                    block.blocker_id = %1$L::uuid
                    and block.blocked_id = %2$L::uuid
                  ) or (
                    block.blocker_id = %2$L::uuid
                    and block.blocked_id = %1$L::uuid
                  )
                )
                and (
                  exists (
                    select 1
                    from public.friendships friendship
                    where friendship.status in ('pending', 'accepted')
                      and friendship.requester_id = %1$L::uuid
                      and friendship.addressee_id = %2$L::uuid
                  )
                  or exists (
                    select 1
                    from public.friendships friendship
                    where friendship.status in ('pending', 'accepted')
                      and friendship.requester_id = %2$L::uuid
                      and friendship.addressee_id = %1$L::uuid
                  )
                  or exists (
                    select 1
                    from public.dm_threads thread
                    where thread.participant_1_id = %1$L::uuid
                      and thread.participant_2_id = %2$L::uuid
                  )
                  or exists (
                    select 1
                    from public.dm_threads thread
                    where thread.participant_1_id = %2$L::uuid
                      and thread.participant_2_id = %1$L::uuid
                  )
                )
              )
            )
        )
      $query$,
      v_profile_id,
      v_recipient_id
    ),
    'exact compound profile delivery guard',
    array['profiles', 'friendships', 'dm_threads', 'user_blocks']
  );
end
$fixture$;

rollback;
