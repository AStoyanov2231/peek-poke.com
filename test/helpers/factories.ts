import type {
  Profile,
  Friendship,
  DMThread,
  DMMessage,
  ProfilePhoto,
  NearbyUser,
  RoleName,
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
