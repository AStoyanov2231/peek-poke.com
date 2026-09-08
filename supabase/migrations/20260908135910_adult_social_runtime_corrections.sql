-- Retired chat-room clients no longer have direct database API access.
-- The current product uses server-gated DM and shared-group routes.
-- BEGIN AGE LEGACY_CHAT_ACL
revoke execute on function public.get_chat_room_summary(uuid),
  public.get_chat_room_unread_count(),
  public.list_chat_room_summaries(integer, timestamptz, uuid)
  from public, anon, authenticated;
-- END AGE LEGACY_CHAT_ACL

-- BEGIN AGE GROUP_DETAIL CORRECTION
-- Migration-18 correction for the server-only group-detail reader.
-- The production shared_group_messages table has no media columns.
-- Root assembles this replacement after migration 17 and drops it in the migration-18 rollback.
CREATE OR REPLACE FUNCTION public.get_shared_group_detail_for_user_v1(
  p_group_id uuid,
  p_user_id uuid,
  p_before_sequence bigint,
  p_before_id uuid,
  p_limit integer
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_last_read_sequence bigint;
  v_limit integer;
BEGIN
  perform public.require_adult_social_admission_v1(p_user_id);

  if p_group_id is null or p_user_id is null then
    return pg_catalog.jsonb_build_object('error', 'GROUP_NOT_FOUND');
  end if;
  v_limit := least(greatest(coalesce(p_limit, 1), 1), 100);

  select member.last_read_sequence
  into v_last_read_sequence
  from public.shared_group_members member
  where member.group_id = p_group_id
    and member.user_id = p_user_id;
  if not found then
    return pg_catalog.jsonb_build_object('error', 'GROUP_NOT_FOUND');
  end if;

  return (
    with eligible_members as materialized (
      select member.user_id
      from public.shared_group_members member
      join public.profiles profile on profile.id = member.user_id
      where member.group_id = p_group_id
        and (
          member.user_id = p_user_id
          or public.can_users_interact_v1(p_user_id, member.user_id)
        )
    ),
    latest_visible as (
      select message.created_at, message.content, message.is_deleted
      from public.shared_group_messages message
      join eligible_members eligible on eligible.user_id = message.sender_id
      where message.group_id = p_group_id
      order by message.sequence desc, message.id desc
      limit 1
    ),
    visible_unread as (
      select pg_catalog.count(*)::integer as count
      from public.shared_group_messages message
      join eligible_members eligible on eligible.user_id = message.sender_id
      where message.group_id = p_group_id
        and message.sequence > v_last_read_sequence
    ),
    page_messages as (
      select
        message.id,
        message.group_id,
        message.sender_id,
        message.client_id,
        message.sequence,
        message.content,
        message.message_type,
        message.is_read,
        message.is_edited,
        message.is_deleted,
        message.created_at,
        pg_catalog.jsonb_build_object(
          'id', sender.id,
          'username', sender.username,
          'display_name', sender.display_name,
          'avatar_url', sender.avatar_url,
          'location_text', sender.location_text,
          'is_online', sender.is_online,
          'last_seen_at', sender.last_seen_at
        ) as sender
      from public.shared_group_messages message
      join eligible_members eligible on eligible.user_id = message.sender_id
      join public.profiles sender on sender.id = message.sender_id
      where message.group_id = p_group_id
        and (
          p_before_sequence is null
          or message.sequence < p_before_sequence
          or (message.sequence = p_before_sequence and message.id < p_before_id)
        )
      order by message.sequence desc, message.id desc
      limit v_limit + 1
    )
    select pg_catalog.jsonb_build_object(
      'group', pg_catalog.jsonb_build_object(
        'id', group_row.id,
        'name', 'Shared group',
        'member_count', (select pg_catalog.count(*)::integer from eligible_members),
        'last_message_at', (select latest.created_at from latest_visible latest),
        'last_message_preview', (
          select case
            when latest.is_deleted then null
            else pg_catalog.left(latest.content, 140)
          end
          from latest_visible latest
        ),
        'created_at', group_row.created_at,
        'unread_count', (select unread.count from visible_unread unread)
      ),
      'messages', coalesce(
        (
          select pg_catalog.jsonb_agg(
            pg_catalog.jsonb_build_object(
              'id', message.id,
              'group_id', message.group_id,
              'sender_id', message.sender_id,
              'client_id', message.client_id,
              'sequence', message.sequence,
              'content', message.content,
              'message_type', message.message_type,
              'media_url', null,
              'media_thumbnail_url', null,
              'is_read', message.is_read,
              'is_edited', message.is_edited,
              'is_deleted', message.is_deleted,
              'created_at', message.created_at,
              'reply_to_id', null,
              'reply_to', null,
              'sender', message.sender
            )
            order by message.sequence desc, message.id desc
          )
          from page_messages message
        ),
        '[]'::jsonb
      ),
      'last_read_sequence', v_last_read_sequence
    )
    from public.shared_groups group_row
    where group_row.id = p_group_id
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.get_shared_group_detail_for_user_v1(uuid, uuid, bigint, uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_shared_group_detail_for_user_v1(uuid, uuid, bigint, uuid, integer) TO service_role;
-- END AGE GROUP_DETAIL CORRECTION

-- BEGIN AGE SHARED_GROUPS COMPAT CORRECTION
-- Migration-18 correction for the legacy one-argument service reader.
-- Keep compatibility with callers that omit cursor arguments while preserving the
-- four-argument reader's admission and visibility filtering.
CREATE OR REPLACE FUNCTION public.get_shared_groups(p_user_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT public.get_shared_groups(p_user_id, NULL::timestamptz, NULL::uuid, 100);
$function$;

REVOKE ALL ON FUNCTION public.get_shared_groups(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_shared_groups(uuid) TO service_role;
-- END AGE SHARED_GROUPS COMPAT CORRECTION

-- BEGIN AGE PLAN_MEETUP CORRECTION
-- Proposed follow-up to the applied age-admission migration.
-- The owner remains authorized to manage a Plan after blocking a member.
-- The blocked member is omitted from acknowledgement output, and cannot be confirmed.

create or replace function public.plan_meetup_status_v1(p_actor_id uuid, p_plan_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_plan public.plans%rowtype;
  v_closes_at timestamptz;
  v_acknowledgements jsonb;
  v_can_confirm boolean;
begin
  perform public.require_adult_social_admission_v1(p_actor_id);
  select plan.* into v_plan
  from public.plans plan
  join public.plan_members actor_member
    on actor_member.plan_id = plan.id and actor_member.user_id = p_actor_id
  join public.profiles actor_profile
    on actor_profile.id = p_actor_id and actor_profile.deleted_at is null
  where plan.id = p_plan_id
    and public.plan_members_are_adult_v1(plan.id);

  if v_plan.id is null then
    return pg_catalog.jsonb_build_object('error', 'NOT_FOUND');
  end if;

  if v_plan.status <> 'active' then
    return pg_catalog.jsonb_build_object(
      'acknowledgements', '[]'::jsonb,
      'canConfirm', false,
      'closesAt', null
    );
  end if;

  v_closes_at := v_plan.starts_at + interval '48 hours';
  select coalesce(jsonb_agg(jsonb_build_object(
    'peerId', peer_member.user_id,
    'viewerConfirmed', coalesce(
      case when acknowledgement.user_a_id = p_actor_id then acknowledgement.user_a_confirmed_at is not null
           else acknowledgement.user_b_confirmed_at is not null end,
      false
    ),
    'peerConfirmed', coalesce(
      case when acknowledgement.user_a_id = p_actor_id then acknowledgement.user_b_confirmed_at is not null
           else acknowledgement.user_a_confirmed_at is not null end,
      false
    ),
    'confirmedAt', acknowledgement.confirmed_at
  ) order by peer_member.joined_at), '[]'::jsonb)
  into v_acknowledgements
  from public.plan_members peer_member
  join public.profiles peer_profile
    on peer_profile.id = peer_member.user_id and peer_profile.deleted_at is null
  left join public.plan_meetup_acknowledgements acknowledgement
    on acknowledgement.plan_id = v_plan.id
   and ((acknowledgement.user_a_id = least(p_actor_id, peer_member.user_id)
         and acknowledgement.user_b_id = greatest(p_actor_id, peer_member.user_id)))
  where peer_member.plan_id = v_plan.id
    and peer_member.user_id <> p_actor_id
    and public.can_users_interact_v1(p_actor_id, peer_member.user_id);

  v_can_confirm := v_plan.starts_at <= pg_catalog.now()
    and v_closes_at > pg_catalog.now()
    and jsonb_array_length(v_acknowledgements) > 0;

  return pg_catalog.jsonb_build_object(
    'acknowledgements', v_acknowledgements,
    'canConfirm', v_can_confirm,
    'closesAt', v_closes_at
  );
end;
$$;

revoke all on function public.plan_meetup_status_v1(uuid, uuid) from public, anon, authenticated;
grant execute on function public.plan_meetup_status_v1(uuid, uuid) to service_role;
-- END AGE PLAN_MEETUP CORRECTION
