-- Trigger functions are internal implementation details. They must not be
-- callable through the Data API even though their triggers remain active.
revoke all on function public.enqueue_billing_entitlement_event()
  from public, anon, authenticated;
revoke all on function public.enqueue_dm_message_update()
  from public, anon, authenticated;
grant execute on function public.enqueue_billing_entitlement_event()
  to service_role;
grant execute on function public.enqueue_dm_message_update()
  to service_role;

-- The composite primary key already enforces this exact uniqueness.
drop index if exists public.dm_thread_members_thread_user_uidx;

-- Cover foreign keys introduced by the current backend workflows so deletes
-- and account-erasure cascades do not scan their child tables.
create index if not exists call_sessions_thread_id_idx
  on public.call_sessions (thread_id);
create index if not exists call_signal_commands_sender_id_idx
  on public.call_signal_commands (sender_id);
create index if not exists call_signal_commands_recipient_id_idx
  on public.call_signal_commands (recipient_id);
create index if not exists dm_media_claims_actor_id_idx
  on public.dm_media_claims (actor_id);
create index if not exists profile_media_remediation_alerts_resolved_by_idx
  on public.profile_media_remediation_alerts (resolved_by);
create index if not exists profile_photos_moderation_requested_by_idx
  on public.profile_photos (moderation_requested_by);
