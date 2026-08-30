create or replace function public.erase_account_data(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deleted_at timestamptz;
  v_thread_ids uuid[];
  v_room_ids uuid[];
  v_erased_messages integer := 0;
  v_erased_room_messages integer := 0;
  v_dispositions integer := 0;
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_user_id::text, 0)
  );

  select profile.deleted_at
  into v_deleted_at
  from public.profiles profile
  where profile.id = p_user_id
  for update;

  if not found then
    return pg_catalog.jsonb_build_object('error', 'PROFILE_NOT_FOUND');
  end if;

  select pg_catalog.array_agg(distinct message.room_id)
  into v_room_ids
  from public.chat_room_messages message
  where message.sender_id = p_user_id;

  update public.chat_room_messages message
  set content = null,
      media_url = null,
      media_thumbnail_url = null,
      message_type = 'system',
      is_read = true,
      is_edited = false,
      is_deleted = true,
      reply_to_id = null
  where message.sender_id = p_user_id;
  get diagnostics v_erased_room_messages = row_count;

  update public.chat_rooms room
  set last_message_at = (
        select message.created_at
        from public.chat_room_messages message
        where message.room_id = room.id
          and message.is_deleted = false
        order by message.sequence desc
        limit 1
      ),
      last_message_preview = (
        select case
          when message.message_type = 'image' then 'Photo'
          else pg_catalog.left(message.content, 240)
        end
        from public.chat_room_messages message
        where message.room_id = room.id
          and message.is_deleted = false
        order by message.sequence desc
        limit 1
      )
  where v_room_ids is not null
    and room.id = any(v_room_ids);

  if v_deleted_at is not null then
    return pg_catalog.jsonb_build_object(
      'success', true,
      'already_erased', true,
      'erased_messages', 0,
      'erased_room_messages', v_erased_room_messages,
      'media_dispositions', (
        select pg_catalog.count(*)
        from public.dm_media_account_erasure_dispositions disposition
        where disposition.actor_id = p_user_id
      )
    );
  end if;

  select pg_catalog.array_agg(distinct message.thread_id)
  into v_thread_ids
  from public.dm_messages message
  where message.sender_id = p_user_id;

  v_dispositions := app_private.prepare_dm_media_account_erasure(p_user_id);

  update public.dm_messages message
  set content = null,
      media_url = null,
      media_thumbnail_url = null,
      message_type = 'system',
      is_read = true,
      is_edited = false,
      is_deleted = true,
      read_at = pg_catalog.coalesce(message.read_at, pg_catalog.now()),
      reply_to_id = null
  where message.sender_id = p_user_id;
  get diagnostics v_erased_messages = row_count;

  update public.dm_threads thread
  set last_message_at = (
        select message.created_at
        from public.dm_messages message
        where message.thread_id = thread.id
          and message.is_deleted = false
        order by message.created_at desc
        limit 1
      ),
      last_message_preview = (
        select case
          when message.message_type = 'image' then 'Photo'
          else pg_catalog.left(pg_catalog.coalesce(message.content, ''), 100)
        end
        from public.dm_messages message
        where message.thread_id = thread.id
          and message.is_deleted = false
        order by message.created_at desc
        limit 1
      )
  where v_thread_ids is not null
    and thread.id = any(v_thread_ids);

  delete from public.user_locations location where location.user_id = p_user_id;
  delete from public.profile_photos photo where photo.user_id = p_user_id;
  delete from public.profile_interests interest where interest.user_id = p_user_id;
  delete from public.friendships friendship
  where friendship.requester_id = p_user_id or friendship.addressee_id = p_user_id;
  delete from public.subscriptions subscription where subscription.user_id = p_user_id;
  delete from public.billing_entitlement_state state where state.user_id = p_user_id;
  delete from public.user_roles role where role.user_id = p_user_id;
  delete from public.admin_coin_collections collection where collection.user_id = p_user_id;
  delete from public.coin_bots bot where bot.user_id = p_user_id;
  delete from public.coin_transactions transaction where transaction.user_id = p_user_id;
  update public.coin_transactions transaction
  set related_user_id = null
  where transaction.related_user_id = p_user_id;
  delete from public.friend_meetings meeting
  where meeting.user_a_id = p_user_id or meeting.user_b_id = p_user_id;
  delete from public.user_blocks block
  where block.blocker_id = p_user_id or block.blocked_id = p_user_id;
  delete from public.user_coins coin where coin.user_id = p_user_id;
  update public.admin_coins coin set created_by = null where coin.created_by = p_user_id;
  update public.profile_photos photo set reviewed_by = null where photo.reviewed_by = p_user_id;
  update public.user_reports report set reviewed_by = null where report.reviewed_by = p_user_id;
  delete from public.private_storage_migration_backups backup
  where backup.original_row ->> 'user_id' = p_user_id::text
     or backup.original_row ->> 'sender_id' = p_user_id::text;

  update public.profiles profile
  set username = 'deleted_' || pg_catalog.left(
        pg_catalog.replace(gen_random_uuid()::text, '-', ''),
        12
      ),
      display_name = 'Deleted member',
      bio = null,
      avatar_url = null,
      cover_image_url = null,
      location_text = null,
      is_online = false,
      last_seen_at = pg_catalog.now(),
      updated_at = pg_catalog.now(),
      stripe_customer_id = null,
      onboarding_completed = false,
      push_tokens = '[]'::jsonb,
      deleted_at = pg_catalog.now()
  where profile.id = p_user_id;

  return pg_catalog.jsonb_build_object(
    'success', true,
    'already_erased', false,
    'erased_messages', v_erased_messages,
    'erased_room_messages', v_erased_room_messages,
    'media_dispositions', v_dispositions
  );
end;
$$;

revoke all on function public.erase_account_data(uuid)
  from public, anon, authenticated;
grant execute on function public.erase_account_data(uuid)
  to service_role;
