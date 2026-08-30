-- Contract pagination indexes. Apply after the production baseline migration
-- has been pulled and reviewed for the target environment.
create index if not exists friendships_addressee_pending_cursor_idx
  on public.friendships (addressee_id, requested_at, id)
  where status = 'pending';

create index if not exists friendships_requester_pending_cursor_idx
  on public.friendships (requester_id, requested_at, id)
  where status = 'pending';

create index if not exists dm_threads_participant_1_last_message_cursor_idx
  on public.dm_threads (participant_1_id, last_message_at, id);

create index if not exists dm_threads_participant_2_last_message_cursor_idx
  on public.dm_threads (participant_2_id, last_message_at, id);

create index if not exists dm_messages_thread_created_cursor_idx
  on public.dm_messages (thread_id, created_at, id);

create index if not exists profile_photos_user_created_cursor_idx
  on public.profile_photos (user_id, created_at, id);

create index if not exists profile_photos_moderation_cursor_idx
  on public.profile_photos (approval_status, created_at, id);

create index if not exists user_reports_status_created_cursor_idx
  on public.user_reports (status, created_at, id);
