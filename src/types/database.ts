export type RoleName = "guest" | "user" | "subscriber" | "moderator" | "admin";

export type Role = {
  id: string;
  name: RoleName;
  priority: number;
  description: string | null;
  created_at: string;
};

export type UserRole = {
  id: string;
  user_id: string;
  role_id: string;
  granted_at: string;
  role?: Role;
};

export type Profile = {
  id: string;
  username: string;
  display_name: string | null;
  bio: string | null;
  avatar_url: string | null;
  location_text: string | null;
  is_online: boolean;
  last_seen_at: string;
  created_at: string;
  stripe_customer_id: string | null;
  onboarding_completed: boolean;
  roles: RoleName[];
};

// Helper to check if a profile has a specific role
export function hasRole(
  profile: Profile | null | undefined,
  roleName: RoleName
): boolean {
  return profile?.roles?.includes(roleName) ?? false;
}

// Convenience helper for premium/subscriber check
export function isPremium(profile: Profile | null | undefined): boolean {
  return hasRole(profile, "subscriber");
}

export type FriendshipStatus = "pending" | "accepted";

export type Friendship = {
  id: string;
  requester_id: string;
  addressee_id: string;
  status: FriendshipStatus;
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
  sender?: Profile;
};

export type PhotoApprovalStatus = "pending" | "approved" | "rejected";

export type ProfilePhoto = {
  id: string;
  user_id: string;
  storage_path: string;
  url: string;
  thumbnail_url: string | null;
  is_avatar: boolean;
  is_private: boolean;
  display_order: number;
  created_at: string;
  approval_status: PhotoApprovalStatus;
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
};

export type SubscriptionStatus =
  | "active"
  | "canceled"
  | "past_due"
  | "incomplete"
  | "trialing"
  | "unpaid"
  | "incomplete_expired"
  | "paused";

export type Subscription = {
  id: string;
  user_id: string;
  stripe_subscription_id: string;
  stripe_customer_id: string;
  status: SubscriptionStatus;
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  created_at: string;
  updated_at: string;
};

export type NearbyUser = {
  userId: string;
  username: string;
  avatar_url: string | null;
  display_name: string | null;
  lat: number;
  lng: number;
};

export type UserCoins = {
  user_id: string;
  balance: number;
  updated_at: string;
};

export type FriendMeeting = {
  id: string;
  user_a_id: string;
  user_b_id: string;
  met_at: string;
};

export type CoinTransactionReason =
  | "friend_request_sent"
  | "meeting_bonus"
  | "request_cancelled_refund";

export type CoinTransaction = {
  id: string;
  user_id: string;
  amount: number;
  reason: CoinTransactionReason;
  related_user_id: string | null;
  created_at: string;
};