export type RoleName = "guest" | "user" | "subscriber" | "platinum" | "moderator" | "admin";

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

export type GenderIdentity = "man" | "woman" | "non_binary" | "other";
export type SexualOrientation = "straight" | "gay" | "lesbian" | "bisexual" | "pansexual" | "other";
export type RelationshipGoal = "casual" | "long_term" | "friends" | "undecided";
export type SmokingHabit = "never" | "socially" | "regularly";
export type DrinkingHabit = "never" | "socially" | "regularly";
export type KidsPreference = "has_kids" | "no_kids" | "wants_kids" | "doesnt_want_kids" | "open";

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
  date_of_birth: string | null;
  gender: GenderIdentity | null;
  orientation: SexualOrientation | null;
  height_cm: number | null;
  relationship_goal: RelationshipGoal | null;
  smoking: SmokingHabit | null;
  drinking: DrinkingHabit | null;
  has_kids: KidsPreference | null;
  verified_at: string | null;
  is_ghost: boolean;
  is_incognito: boolean;
  dating_onboarding_completed: boolean;
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

export function isPlatinum(profile: Profile | null | undefined): boolean {
  return hasRole(profile, "platinum");
}

export function isVerified(profile: Profile | null | undefined): boolean {
  return profile?.verified_at != null;
}

export function profileAge(profile: Profile | null | undefined): number | null {
  if (!profile?.date_of_birth) return null;
  const dob = new Date(profile.date_of_birth);
  const today = new Date();
  const age = today.getFullYear() - dob.getFullYear();
  const monthDiff = today.getMonth() - dob.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) {
    return age - 1;
  }
  return age;
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
  meetings_count?: number;
  radius_km?: number;
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
  | "request_cancelled_refund"
  | "super_poke";

export type CoinTransaction = {
  id: string;
  user_id: string;
  amount: number;
  reason: CoinTransactionReason;
  related_user_id: string | null;
  created_at: string;
};

export type DatingPreferences = {
  user_id: string;
  interested_in: GenderIdentity[];
  min_age: number;
  max_age: number;
  max_distance_km: number;
  dealbreaker_smoking: boolean;
  dealbreaker_drinking: boolean;
  dealbreaker_kids: boolean;
  dealbreaker_relationship_goal: RelationshipGoal | null;
  verified_only: boolean;
  women_only: boolean;
  updated_at: string;
};

export type Poke = {
  id: string;
  poker_id: string;
  pokee_id: string;
  is_super: boolean;
  created_at: string;
  expires_at: string | null;
  poker?: Profile;
  pokee?: Profile;
};

export type Match = {
  id: string;
  user_1_id: string;
  user_2_id: string;
  thread_id: string | null;
  matched_at: string;
  unmatched_at: string | null;
  unmatched_by: string | null;
  first_message_at: string | null;
  user_1?: Profile;
  user_2?: Profile;
};

export type Pass = {
  id: string;
  passer_id: string;
  passee_id: string;
  passed_at: string;
  expires_at: string;
};

export type MatchWithPartner = {
  id: string;
  thread_id: string | null;
  matched_at: string;
  expires_at: string;
  partner: {
    id: string;
    username: string;
    display_name: string | null;
    avatar_url: string | null;
  };
};

export type DailyActionCounter = {
  user_id: string;
  action_date: string;
  pokes_sent: number;
  passes_sent: number;
};

export type CandidatePhoto = {
  id: string;
  url: string;
  thumbnail_url: string | null;
  is_avatar: boolean;
  display_order: number;
};

export type Candidate = {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  date_of_birth: string | null;
  gender: GenderIdentity | null;
  height_cm: number | null;
  relationship_goal: RelationshipGoal | null;
  smoking: SmokingHabit | null;
  drinking: DrinkingHabit | null;
  has_kids: KidsPreference | null;
  verified_at: string | null;
  bio: string | null;
  photos: CandidatePhoto[];
  age: number | null;
  distance_km: number;
};