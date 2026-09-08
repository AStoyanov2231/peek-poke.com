-- Some legacy PL/pgSQL bodies schema-qualified SQL special forms. PostgreSQL
-- stores those bodies but fails when executing them. Rewrite only the audited
-- hosted allowlist, retaining each function's complete stored definition.
do $migration$
declare
  v_signature text;
  v_function oid;
  v_definition text;
  v_rewritten text;
begin
  foreach v_signature in array array[
    'public.account_erasure_storage_objects(uuid)',
    'public.block_user_idempotent(uuid,uuid,text,text,text,text)',
    'public.block_user_with_friendship_fence(uuid,uuid)',
    'public.expand_profile_updated_event(uuid,text)',
    'public.friendship_removal_core(uuid,uuid,text)',
    'public.list_chat_room_summaries(integer,timestamp with time zone,uuid)',
    'public.mark_chat_room_read(uuid,uuid,bigint)',
    'public.queue_account_deletion(uuid,text,jsonb)',
    'public.queue_account_deletion(uuid,text)',
    'public.record_meeting_idempotent(uuid,uuid,text,text,text,text)',
    'public.respond_friend_request_idempotent(uuid,uuid,text,text,text,text,text)',
    'public.send_friend_request_idempotent(uuid,uuid,text,text,text,text)',
    'public.send_message_transactional(uuid,uuid,uuid,text,text,text,text,uuid)'
  ] loop
    v_function := pg_catalog.to_regprocedure(v_signature);
    if v_function is null then
      continue;
    end if;

    v_definition := pg_catalog.pg_get_functiondef(v_function);
    v_rewritten := pg_catalog.regexp_replace(
      v_definition,
      'pg_catalog[.](coalesce|nullif|least|greatest)[[:space:]]*[(]',
      '\1(',
      'g'
    );
    if v_rewritten is distinct from v_definition then
      execute v_rewritten;
    end if;
  end loop;
end;
$migration$;
