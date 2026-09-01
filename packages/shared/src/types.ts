export type RoleName = "guest" | "user" | "subscriber" | "platinum" | "moderator" | "admin";

export type Profile = {
  id: string;
  username: string;
  display_name: string | null;
  bio: string | null;
  avatar_url: string | null;
  cover_image_url: string | null;
  location_text: string | null;
  is_online: boolean;
  last_seen_at: string;
  created_at: string;
  onboarding_completed: boolean;
  account_deleted?: boolean;
  roles: RoleName[];
};

export type ProfilePhoto = {
  id: string;
  user_id: string;
  storage_path: string;
  storage_bucket: string;
  thumbnail_storage_path: string | null;
  url: string;
  thumbnail_url: string | null;
  is_avatar: boolean;
  is_private: boolean;
  display_order: number;
  created_at: string;
  approval_status: "pending" | "approved" | "rejected";
  reviewed_by: string | null;
  reviewed_at: string | null;
  rejection_reason: string | null;
};

export type InterestTag = {
  id: string;
  name: string;
  category: string;
  icon: string | null;
  display_order: number;
};

export type ProfileInterest = {
  id: string;
  user_id: string;
  tag_id: string;
  created_at: string;
  tag?: InterestTag;
};

export type ProfileStats = {
  photos_count: number;
  friends_count: number;
  meetings_count?: number;
  radius_km?: number;
};

export type Friendship = {
  id: string;
  requester_id: string;
  addressee_id: string;
  status: "pending" | "accepted";
  requested_at: string;
  responded_at: string | null;
  requester?: Profile;
  addressee?: Profile;
};

export type DMThread = {
  id: string;
  participant_1_id: string;
  participant_2_id: string;
  last_message_at: string | null;
  last_message_preview: string | null;
  created_at: string;
  participant_1?: Profile;
  participant_2?: Profile;
  unread_count?: number;
};

export type DMMessageReplySnippet = {
  id: string;
  sender_id: string;
  content: string | null;
};

export type DMMessageSender = {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  location_text: string | null;
  is_online: boolean;
  last_seen_at: string | null;
  roles?: string[];
  account_deleted?: boolean;
};

export type DMMessage = {
  id: string;
  thread_id: string;
  sender_id: string;
  content: string | null;
  message_type: "text" | "image" | "system";
  media_url: string | null;
  media_thumbnail_url: string | null;
  is_read: boolean;
  is_edited: boolean;
  is_deleted: boolean;
  created_at: string;
  sequence?: number;
  client_id?: string | null;
  reply_to_id: string | null;
  reply_to: DMMessageReplySnippet | null;
  sender?: DMMessageSender;
};

export type NearbyUser = {
  userId: string;
  username: string;
  avatar_url: string | null;
  display_name: string | null;
  is_online: boolean;
  last_seen_at: string | null;
  lat: number;
  lng: number;
  meeting_eligible?: boolean;
};

export type UserCoins = {
  user_id: string;
  balance: number;
  updated_at: string;
};

export type PushPlatform = "ios" | "android";
export type PushProvider = "expo" | "apns";

export type PushToken = {
  token: string;
  platform: PushPlatform;
  provider?: PushProvider;
};

export type PreloadResponse = {
  profile: {
    profile: Profile;
    photos: ProfilePhoto[];
    interests: ProfileInterest[];
    allTags: InterestTag[];
    stats: ProfileStats;
  };
  friends: {
    friends: Array<Profile & { friendship_id: string }>;
    requests: Array<Friendship & { requester: Profile }>;
    sentRequests: Array<Friendship & { addressee: Profile }>;
    sentRequestUserIds: string[];
  };
  messages: {
    threads: DMThread[];
    totalUnread: number;
    blockedUserIds?: string[];
  };
  coins: {
    balance: number;
    metFriendIds: string[];
  };
};

export function hasRole(profile: { roles?: readonly string[] } | null | undefined, roleName: RoleName): boolean {
  return profile?.roles?.includes(roleName) ?? false;
}

export function isPremium(profile: { roles?: readonly string[] } | null | undefined): boolean {
  return hasRole(profile, "subscriber");
}
