import type { ApiPage, Bootstrap, Friend, Message, ModerationReport, ProfileCard, ThreadSummary } from "./contract";
import { API_VERSION } from "./contract";
import type { ApiErrorEnvelope } from "./errors";

export const contractFixtureProfile: ProfileCard = {
  id: "00000000-0000-4000-8000-000000000001",
  username: "alex",
  display_name: "Alex",
  avatar_url: null,
  location_text: null,
  is_online: false,
  last_seen_at: "2026-01-01T00:00:00.000Z",
};

export const contractFixtureBootstrap: Bootstrap = {
  version: API_VERSION,
  identity: { id: contractFixtureProfile.id, email: "alex@example.test" },
  onboarding_completed: true,
  roles: ["user"],
  feature_config_version: "v1",
  unread_summary: { threads: 1 },
};

export const contractFixtureError: ApiErrorEnvelope = {
  version: API_VERSION,
  error: "Invalid cursor",
  message: "Invalid cursor",
  code: "INVALID_CURSOR",
  request_id: "request-1",
};

export const contractFixtureFriend: Friend = {
  id: "00000000-0000-4000-8000-000000000002",
  requester_id: contractFixtureProfile.id,
  addressee_id: "00000000-0000-4000-8000-000000000003",
  status: "accepted",
  requested_at: "2026-01-01T00:00:00.000Z",
  responded_at: "2026-01-01T00:01:00.000Z",
  requester: contractFixtureProfile,
};

export const contractFixtureThread: ThreadSummary = {
  id: "00000000-0000-4000-8000-000000000004",
  participant_1_id: contractFixtureProfile.id,
  participant_2_id: contractFixtureFriend.addressee_id,
  last_message_at: "2026-01-01T00:02:00.000Z",
  last_message_preview: "Hello",
  created_at: "2026-01-01T00:00:00.000Z",
  unread_count: 1,
  participant_1: contractFixtureProfile,
};

export const contractFixtureMessage: Message = {
  id: "00000000-0000-4000-8000-000000000005",
  thread_id: contractFixtureThread.id,
  sender_id: contractFixtureProfile.id,
  content: "Hello",
  message_type: "text",
  media_url: null,
  media_thumbnail_url: null,
  is_read: false,
  is_edited: false,
  is_deleted: false,
  created_at: "2026-01-01T00:02:00.000Z",
  reply_to_id: null,
  reply_to: null,
  sender: contractFixtureProfile,
};

export const contractFixtureReport: ModerationReport = {
  id: "00000000-0000-4000-8000-000000000006",
  category: "spam",
  details: null,
  status: "pending",
  created_at: "2026-01-01T00:00:00.000Z",
  reviewed_at: null,
  reviewed_by: null,
};

export const contractFixturePage: ApiPage<ThreadSummary> = {
  items: [contractFixtureThread],
  page: { version: API_VERSION, next_cursor: null, has_more: false, limit: 20 },
};
