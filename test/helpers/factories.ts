import type {
  Profile,
  Friendship,
  DMThread,
  DMMessage,
  ProfilePhoto,
  NearbyUser,
  RoleName,
  DatingPreferences,
  Poke,
  Match,
  Pass,
  DailyActionCounter,
  Candidate,
} from '@/types/database'

let counter = 0

export function resetFactoryCounter() {
  counter = 0
}

function nextId(): string {
  counter++
  return `00000000-0000-0000-0000-${String(counter).padStart(12, '0')}`
}

function timestamp(offsetMs = 0): string {
  return new Date(Date.now() + offsetMs).toISOString()
}

export function buildProfile(overrides: Partial<Profile> = {}): Profile {
  const id = nextId()
  return {
    id,
    username: `user_${counter}`,
    display_name: `User ${counter}`,
    bio: null,
    avatar_url: null,
    location_text: null,
    is_online: false,
    last_seen_at: timestamp(),
    created_at: timestamp(-86400000),
    stripe_customer_id: null,
    onboarding_completed: true,
    roles: ['user'] as RoleName[],
    date_of_birth: null,
    gender: null,
    orientation: null,
    height_cm: null,
    relationship_goal: null,
    smoking: null,
    drinking: null,
    has_kids: null,
    verified_at: null,
    is_ghost: false,
    is_incognito: false,
    dating_onboarding_completed: false,
    ...overrides,
  }
}

export function buildFriendship(overrides: Partial<Friendship> = {}): Friendship {
  return {
    id: nextId(),
    requester_id: nextId(),
    addressee_id: nextId(),
    status: 'accepted',
    requested_at: timestamp(-3600000),
    responded_at: timestamp(-1800000),
    ...overrides,
  }
}

export function buildDMThread(overrides: Partial<DMThread> = {}): DMThread {
  return {
    id: nextId(),
    participant_1_id: nextId(),
    participant_2_id: nextId(),
    last_message_at: timestamp(-600000),
    last_message_preview: 'Hey, how are you?',
    created_at: timestamp(-86400000),
    ...overrides,
  }
}

export function buildDMMessage(overrides: Partial<DMMessage> = {}): DMMessage {
  return {
    id: nextId(),
    thread_id: nextId(),
    sender_id: nextId(),
    content: `Test message ${counter}`,
    message_type: 'text',
    media_url: null,
    media_thumbnail_url: null,
    is_read: false,
    is_edited: false,
    is_deleted: false,
    created_at: timestamp(),
    ...overrides,
  }
}

export function buildProfilePhoto(overrides: Partial<ProfilePhoto> = {}): ProfilePhoto {
  const id = nextId()
  const userId = nextId()
  return {
    id,
    user_id: userId,
    storage_path: `photos/${userId}/${id}.jpg`,
    url: `https://test.supabase.co/storage/v1/object/public/photos/${userId}/${id}.jpg`,
    thumbnail_url: `https://test.supabase.co/storage/v1/object/public/photos/${userId}/${id}_thumb.jpg`,
    is_avatar: false,
    is_private: false,
    display_order: counter,
    created_at: timestamp(),
    approval_status: 'approved',
    reviewed_by: null,
    reviewed_at: null,
    rejection_reason: null,
    ...overrides,
  }
}

export function buildNearbyUser(overrides: Partial<NearbyUser> = {}): NearbyUser {
  const userId = nextId()
  return {
    userId,
    username: `nearby_user_${counter}`,
    avatar_url: null,
    display_name: `Nearby User ${counter}`,
    lat: 40.7128,
    lng: -74.006,
    ...overrides,
  }
}

export function buildDatingPreferences(overrides: Partial<DatingPreferences> = {}): DatingPreferences {
  return {
    user_id: nextId(),
    interested_in: ['woman'],
    min_age: 18,
    max_age: 45,
    max_distance_km: 25,
    dealbreaker_smoking: false,
    dealbreaker_drinking: false,
    dealbreaker_kids: false,
    dealbreaker_relationship_goal: null,
    verified_only: false,
    women_only: false,
    updated_at: timestamp(),
    ...overrides,
  }
}

export function buildPoke(overrides: Partial<Poke> = {}): Poke {
  return {
    id: nextId(),
    poker_id: nextId(),
    pokee_id: nextId(),
    is_super: false,
    created_at: timestamp(),
    expires_at: null,
    ...overrides,
  }
}

export function buildMatch(overrides: Partial<Match> = {}): Match {
  return {
    id: nextId(),
    user_1_id: nextId(),
    user_2_id: nextId(),
    thread_id: null,
    matched_at: timestamp(),
    unmatched_at: null,
    unmatched_by: null,
    first_message_at: null,
    ...overrides,
  }
}

export function buildPass(overrides: Partial<Pass> = {}): Pass {
  return {
    id: nextId(),
    passer_id: nextId(),
    passee_id: nextId(),
    passed_at: timestamp(),
    expires_at: timestamp(30 * 24 * 60 * 60 * 1000),
    ...overrides,
  }
}

export function buildDailyActionCounter(overrides: Partial<DailyActionCounter> = {}): DailyActionCounter {
  return {
    user_id: nextId(),
    action_date: new Date().toISOString().split('T')[0],
    pokes_sent: 0,
    passes_sent: 0,
    ...overrides,
  }
}

export function buildCandidate(overrides: Partial<Candidate> = {}): Candidate {
  return {
    id: overrides.id ?? crypto.randomUUID(),
    username: overrides.username ?? 'testuser',
    display_name: overrides.display_name ?? 'Test User',
    avatar_url: overrides.avatar_url ?? null,
    date_of_birth: overrides.date_of_birth ?? '1995-06-15',
    gender: overrides.gender ?? 'woman',
    height_cm: overrides.height_cm ?? 165,
    relationship_goal: overrides.relationship_goal ?? 'long_term',
    smoking: overrides.smoking ?? 'never',
    drinking: overrides.drinking ?? 'socially',
    has_kids: overrides.has_kids ?? 'no_kids',
    verified_at: overrides.verified_at ?? null,
    bio: overrides.bio ?? null,
    photos: overrides.photos ?? [],
    age: overrides.age ?? 29,
    distance_km: overrides.distance_km ?? 2.5,
  }
}
