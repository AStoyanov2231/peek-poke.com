import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMockSupabaseClient, createMockQueryBuilder } from '../../../test/mocks/supabase'
import { fetchUserStats, fetchUserInterests, fetchProfileData, fetchFriendsData, fetchMessagesData } from '../preload'

let mockClient: ReturnType<typeof createMockSupabaseClient>

beforeEach(() => {
  vi.clearAllMocks()
  mockClient = createMockSupabaseClient()
})

// Helper: create a count-resolving builder
function makeCountBuilder(count: number | null, error: unknown = null) {
  const builder = createMockQueryBuilder(null, error)
  builder.then = vi.fn((resolve: (v: unknown) => void) => resolve({ data: null, error, count }))
  return builder
}

describe('fetchUserStats', () => {
  it('returns counts from both queries', async () => {
    const photosBuilder = makeCountBuilder(5)
    const friendsBuilder = makeCountBuilder(3)
    mockClient.from
      .mockReturnValueOnce(photosBuilder as never)
      .mockReturnValueOnce(friendsBuilder as never)

    const result = await fetchUserStats(mockClient as never, 'user-1')

    expect(result.photos_count).toBe(5)
    expect(result.friends_count).toBe(3)
  })

  it('falls back to 0 when count is null', async () => {
    const photosBuilder = makeCountBuilder(null)
    const friendsBuilder = makeCountBuilder(null)
    mockClient.from
      .mockReturnValueOnce(photosBuilder as never)
      .mockReturnValueOnce(friendsBuilder as never)

    const result = await fetchUserStats(mockClient as never, 'user-1')

    expect(result.photos_count).toBe(0)
    expect(result.friends_count).toBe(0)
  })
})

describe('fetchUserInterests', () => {
  it('returns interests array from DB', async () => {
    const interests = [{ id: '1', user_id: 'user-1', tag_id: 't1' }]
    const builder = createMockQueryBuilder(interests)
    mockClient.from.mockReturnValue(builder as never)

    const result = await fetchUserInterests(mockClient as never, 'user-1')

    expect(result.interests).toEqual(interests)
    expect(result.error).toBeNull()
  })

  it('returns empty array when data is null', async () => {
    const builder = createMockQueryBuilder(null)
    mockClient.from.mockReturnValue(builder as never)

    const result = await fetchUserInterests(mockClient as never, 'user-1')

    expect(result.interests).toEqual([])
  })
})

describe('fetchProfileData', () => {
  it('returns profile with roles on success', async () => {
    const profileData = {
      id: 'user-1',
      username: 'testuser',
      display_name: 'Test User',
      bio: null,
      avatar_url: null,
      location_text: null,
      is_online: false,
      last_seen_at: null,
      created_at: '2024-01-01',
      stripe_customer_id: null,
      onboarding_completed: true,
    }

    // profiles query (single)
    const profileBuilder = createMockQueryBuilder(profileData)
    // profile_photos query
    const photosBuilder = createMockQueryBuilder([])
    // interest_tags query
    const tagsBuilder = createMockQueryBuilder([])
    // profile_interests (for fetchUserInterests)
    const interestsBuilder = createMockQueryBuilder([])
    // profile_photos count (for fetchUserStats)
    const photosCountBuilder = makeCountBuilder(2)
    // friendships count (for fetchUserStats)
    const friendsCountBuilder = makeCountBuilder(4)

    mockClient.from
      .mockReturnValueOnce(profileBuilder as never)   // profiles
      .mockReturnValueOnce(photosBuilder as never)    // profile_photos (photos)
      .mockReturnValueOnce(interestsBuilder as never) // profile_interests
      .mockReturnValueOnce(tagsBuilder as never)      // interest_tags
      .mockReturnValueOnce(photosCountBuilder as never)  // profile_photos count
      .mockReturnValueOnce(friendsCountBuilder as never) // friendships count

    mockClient.rpc.mockResolvedValue({ data: ['user', 'subscriber'], error: null })

    const result = await fetchProfileData(mockClient as never, 'user-1')

    expect(result.profile).not.toBeNull()
    expect(result.profile!.id).toBe('user-1')
    expect(result.profile!.roles).toEqual(['user', 'subscriber'])
  })

  it('returns null profile when DB returns null data', async () => {
    const profileBuilder = createMockQueryBuilder(null)
    const photosBuilder = createMockQueryBuilder([])
    const interestsBuilder = createMockQueryBuilder([])
    const tagsBuilder = createMockQueryBuilder([])
    const photosCountBuilder = makeCountBuilder(0)
    const friendsCountBuilder = makeCountBuilder(0)

    mockClient.from
      .mockReturnValueOnce(profileBuilder as never)
      .mockReturnValueOnce(photosBuilder as never)
      .mockReturnValueOnce(interestsBuilder as never)
      .mockReturnValueOnce(tagsBuilder as never)
      .mockReturnValueOnce(photosCountBuilder as never)
      .mockReturnValueOnce(friendsCountBuilder as never)

    mockClient.rpc.mockResolvedValue({ data: null, error: null })

    const result = await fetchProfileData(mockClient as never, 'user-1')

    expect(result.profile).toBeNull()
  })
})

describe('fetchFriendsData', () => {
  it('returns friends, requests, and sentRequests on success', async () => {
    const friendRow = {
      id: 'f1',
      requester_id: 'user-1',
      addressee_id: 'user-2',
      addressee: { id: 'user-2', username: 'friend1' },
      requester: { id: 'user-1', username: 'me' },
    }
    const requestRow = { id: 'r1', requester_id: 'user-3', addressee_id: 'user-1', requester: { id: 'user-3' } }
    const sentRow = { id: 's1', requester_id: 'user-1', addressee_id: 'user-4', addressee: { id: 'user-4' } }

    const friendsBuilder = createMockQueryBuilder([friendRow])
    const requestsBuilder = createMockQueryBuilder([requestRow])
    const sentBuilder = createMockQueryBuilder([sentRow])

    mockClient.from
      .mockReturnValueOnce(friendsBuilder as never)
      .mockReturnValueOnce(requestsBuilder as never)
      .mockReturnValueOnce(sentBuilder as never)

    const result = await fetchFriendsData(mockClient as never, 'user-1')

    expect(result.friends).toHaveLength(1)
    expect(result.requests).toHaveLength(1)
    expect(result.sentRequests).toHaveLength(1)
    expect(result.sentRequestUserIds).toEqual(['user-4'])
  })

  it('returns empty arrays when data is null', async () => {
    const emptyBuilder = createMockQueryBuilder(null)
    mockClient.from.mockReturnValue(emptyBuilder as never)

    const result = await fetchFriendsData(mockClient as never, 'user-1')

    expect(result.friends).toEqual([])
    expect(result.requests).toEqual([])
    expect(result.sentRequests).toEqual([])
    expect(result.sentRequestUserIds).toEqual([])
  })
})

describe('fetchMessagesData', () => {
  it('returns threads and messages on success', async () => {
    const thread = {
      id: 'thread-1',
      participant_1_id: 'user-1',
      participant_2_id: 'user-2',
      last_message_at: new Date().toISOString(),
      participant_1: { id: 'user-1' },
      participant_2: { id: 'user-2' },
    }
    const message = { id: 'msg-1', thread_id: 'thread-1', sender_id: 'user-2', content: 'hello' }

    // user_blocks query → no blocks
    const blocksBuilder = createMockQueryBuilder([])
    // dm_threads query
    const threadsBuilder = createMockQueryBuilder([thread])
    // dm_messages unread count query
    const unreadBuilder = createMockQueryBuilder([])
    // dm_messages per thread
    const messagesBuilder = createMockQueryBuilder([message])

    mockClient.from
      .mockReturnValueOnce(blocksBuilder as never)
      .mockReturnValueOnce(threadsBuilder as never)
      .mockReturnValueOnce(unreadBuilder as never)
      .mockReturnValueOnce(messagesBuilder as never)

    const result = await fetchMessagesData(mockClient as never, 'user-1')

    expect(result.threads).toHaveLength(1)
    expect(result.threads[0].id).toBe('thread-1')
    expect(result.threadMessages['thread-1']).toHaveLength(1)
    expect(result.blockedUserIds).toEqual([])
  })

  it('filters out threads with blocked users', async () => {
    const blockedThread = {
      id: 'thread-blocked',
      participant_1_id: 'user-1',
      participant_2_id: 'blocked-user',
      last_message_at: new Date().toISOString(),
      participant_1: { id: 'user-1' },
      participant_2: { id: 'blocked-user' },
    }
    const normalThread = {
      id: 'thread-normal',
      participant_1_id: 'user-1',
      participant_2_id: 'user-2',
      last_message_at: new Date().toISOString(),
      participant_1: { id: 'user-1' },
      participant_2: { id: 'user-2' },
    }

    // user_blocks → blocked-user is blocked
    const blocksBuilder = createMockQueryBuilder([{ blocked_id: 'blocked-user' }])
    // dm_threads → returns both threads
    const threadsBuilder = createMockQueryBuilder([blockedThread, normalThread])
    // unread messages for normal thread only
    const unreadBuilder = createMockQueryBuilder([])
    // messages for normal thread
    const messagesBuilder = createMockQueryBuilder([])

    mockClient.from
      .mockReturnValueOnce(blocksBuilder as never)
      .mockReturnValueOnce(threadsBuilder as never)
      .mockReturnValueOnce(unreadBuilder as never)
      .mockReturnValueOnce(messagesBuilder as never)

    const result = await fetchMessagesData(mockClient as never, 'user-1')

    expect(result.threads).toHaveLength(1)
    expect(result.threads[0].id).toBe('thread-normal')
    expect(result.blockedUserIds).toEqual(['blocked-user'])
  })
})
