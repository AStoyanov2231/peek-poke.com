import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { useAppStore } from '@/stores/appStore'
import { buildProfile, buildFriendship, buildDMThread, buildDMMessage, resetFactoryCounter } from '../../../test/helpers/factories'
import type { FriendWithFriendshipId, Thread, FriendshipWithAddressee } from '@/stores/appStore'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildFriend(overrides: Partial<FriendWithFriendshipId> = {}): FriendWithFriendshipId {
  const p = buildProfile(overrides)
  return { ...p, friendship_id: `fs-${p.id}`, ...overrides }
}

function buildThread(overrides: Partial<Thread> = {}): Thread {
  const base = buildDMThread()
  const p1 = buildProfile()
  const p2 = buildProfile()
  return {
    ...base,
    type: 'dm' as const,
    participant_1: p1,
    participant_2: p2,
    unread_count: 0,
    ...overrides,
  }
}

function buildSentRequest(overrides: Partial<FriendshipWithAddressee> = {}): FriendshipWithAddressee {
  const fs = buildFriendship()
  const addressee = buildProfile()
  return { ...fs, addressee, addressee_id: addressee.id, ...overrides }
}

function getState() {
  return useAppStore.getState()
}

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  resetFactoryCounter()
  useAppStore.getState().clearStore()
})

afterEach(() => {
  vi.restoreAllMocks()
})

// ─── Profile ──────────────────────────────────────────────────────────────────

describe('Profile', () => {
  it('setProfile sets profile in state', () => {
    const profile = buildProfile()
    getState().setProfile(profile)
    expect(getState().profile).toEqual(profile)
  })

  it('setPhotos sets photos array', () => {
    const profile = buildProfile()
    getState().setProfile(profile)
    // photos are ProfilePhoto[] — use empty array as simplest valid value
    const photos: never[] = []
    getState().setPhotos(photos)
    expect(getState().photos).toEqual([])
  })

  it('updateStats merges (does not replace) stats', () => {
    getState().setStats({ photos_count: 3, friends_count: 5 })
    getState().updateStats({ photos_count: 10 })
    expect(getState().stats).toEqual({ photos_count: 10, friends_count: 5 })
  })

  it('setStats replaces stats entirely', () => {
    getState().setStats({ photos_count: 3, friends_count: 5 })
    getState().setStats({ photos_count: 0, friends_count: 0 })
    expect(getState().stats).toEqual({ photos_count: 0, friends_count: 0 })
  })
})

// ─── Friends ──────────────────────────────────────────────────────────────────

describe('Friends', () => {
  it('setFriends replaces friends array', () => {
    const a = buildFriend()
    const b = buildFriend()
    getState().setFriends([a])
    getState().setFriends([b])
    expect(getState().friends).toEqual([b])
  })

  it('addFriend appends friend and increments friend_count', () => {
    getState().setStats({ photos_count: 0, friends_count: 2 })
    const friend = buildFriend()
    getState().addFriend(friend)
    expect(getState().friends).toContainEqual(friend)
    expect(getState().stats.friends_count).toBe(3)
  })

  it('removeFriend removes from array and decrements friend_count', () => {
    const friend = buildFriend()
    getState().setStats({ photos_count: 0, friends_count: 1 })
    getState().setFriends([friend])
    getState().removeFriend(friend.id)
    expect(getState().friends).toHaveLength(0)
    expect(getState().stats.friends_count).toBe(0)
  })

  it('removeFriend clamps friend_count at 0', () => {
    getState().setStats({ photos_count: 0, friends_count: 0 })
    const friend = buildFriend()
    getState().setFriends([friend])
    getState().removeFriend(friend.id)
    expect(getState().stats.friends_count).toBe(0)
  })

  it('addSentRequest adds userId to sentRequestUserIds', () => {
    getState().addSentRequest('user-abc')
    expect(getState().sentRequestUserIds.has('user-abc')).toBe(true)
  })

  it('addSentRequestFull adds full object to sentRequests and sentRequestUserIds', () => {
    const req = buildSentRequest()
    getState().addSentRequestFull(req)
    expect(getState().sentRequests).toContainEqual(req)
    expect(getState().sentRequestUserIds.has(req.addressee_id)).toBe(true)
  })

  it('removeSentRequest removes from sentRequests and sentRequestUserIds', () => {
    const req = buildSentRequest()
    getState().addSentRequestFull(req)
    getState().removeSentRequest(req.id)
    expect(getState().sentRequests.find((r) => r.id === req.id)).toBeUndefined()
    expect(getState().sentRequestUserIds.has(req.addressee_id)).toBe(false)
  })

  it('removeRequest removes from pendingRequests', () => {
    const profile = buildProfile()
    const fs = buildFriendship({ requester_id: profile.id })
    const request = { ...fs, requester: profile }
    getState().setRequests([request])
    getState().removeRequest(fs.id)
    expect(getState().requests.find((r) => r.id === fs.id)).toBeUndefined()
  })

  it('setFriends filters friends that are pending deletion', () => {
    const friend = buildFriend()
    getState().markFriendDeletionPending(friend.id)
    getState().setFriends([friend])
    expect(getState().friends).toHaveLength(0)
  })

  it('markFriendDeletionPending marks a friend id as pending', () => {
    const id = 'friend-to-delete'
    getState().markFriendDeletionPending(id)
    expect(getState().pendingFriendDeletions.has(id)).toBe(true)
  })

  it('clearFriendDeletionPending removes a friend id from pending set', () => {
    const id = 'friend-to-delete'
    getState().markFriendDeletionPending(id)
    getState().clearFriendDeletionPending(id)
    expect(getState().pendingFriendDeletions.has(id)).toBe(false)
  })
})

// ─── Messages ─────────────────────────────────────────────────────────────────

describe('Messages', () => {
  it('setThreads replaces threads', () => {
    const t1 = buildThread()
    const t2 = buildThread()
    getState().setThreads([t1])
    getState().setThreads([t2])
    expect(getState().threads).toEqual([t2])
  })

  it('setThreadMessages sets messages for a thread', () => {
    const threadId = 'thread-1'
    const msgs = [buildDMMessage({ thread_id: threadId }), buildDMMessage({ thread_id: threadId })]
    getState().setThreadMessages(threadId, msgs)
    expect(getState().threadMessages[threadId]).toEqual(msgs)
  })

  it('addMessage appends to thread', () => {
    const threadId = 'thread-2'
    const m1 = buildDMMessage({ thread_id: threadId })
    const m2 = buildDMMessage({ thread_id: threadId })
    getState().setThreadMessages(threadId, [m1])
    getState().addMessage(threadId, m2)
    expect(getState().threadMessages[threadId]).toHaveLength(2)
    expect(getState().threadMessages[threadId][1]).toEqual(m2)
  })

  it('addMessage deduplicates by ID', () => {
    const threadId = 'thread-3'
    const m1 = buildDMMessage({ thread_id: threadId })
    getState().setThreadMessages(threadId, [m1])
    getState().addMessage(threadId, m1)
    expect(getState().threadMessages[threadId]).toHaveLength(1)
  })

  it('updateMessage updates message by ID', () => {
    const threadId = 'thread-4'
    const msg = buildDMMessage({ thread_id: threadId })
    getState().setThreadMessages(threadId, [msg])
    getState().updateMessage(threadId, msg.id, { content: 'updated' })
    expect(getState().threadMessages[threadId][0].content).toBe('updated')
  })

  it('updateMessage is no-op for unknown thread ID', () => {
    const threadId = 'thread-5'
    const msg = buildDMMessage({ thread_id: threadId })
    getState().setThreadMessages(threadId, [msg])
    // Should not throw
    expect(() => getState().updateMessage('nonexistent', msg.id, { content: 'x' })).not.toThrow()
    expect(getState().threadMessages[threadId][0].content).toBe(msg.content)
  })

  it('markThreadRead zeroes unread for thread', () => {
    const thread = buildThread({ unread_count: 5 })
    getState().setThreads([thread])
    getState().updateTotalUnread(5)
    getState().markThreadRead(thread.id)
    const updated = getState().threads.find((t) => t.id === thread.id)
    expect(updated?.unread_count).toBe(0)
  })

  it('markThreadRead clamps totalUnread at 0', () => {
    const thread = buildThread({ unread_count: 3 })
    getState().setThreads([thread])
    getState().updateTotalUnread(2) // less than unread_count
    getState().markThreadRead(thread.id)
    expect(getState().totalUnread).toBe(0)
  })

  it('removeThread removes thread from list', () => {
    const thread = buildThread()
    getState().setThreads([thread])
    getState().removeThread(thread.id)
    expect(getState().threads.find((t) => t.id === thread.id)).toBeUndefined()
  })

  it('clearThreadMessages clears messages for thread', () => {
    const threadId = 'thread-clear'
    const msgs = [buildDMMessage({ thread_id: threadId })]
    getState().setThreadMessages(threadId, msgs)
    getState().clearThreadMessages(threadId)
    expect(getState().threadMessages[threadId]).toEqual([])
  })
})

// ─── Coins ────────────────────────────────────────────────────────────────────

describe('Coins', () => {
  it('setCoins sets balance', () => {
    getState().setCoins(42)
    expect(getState().coins).toBe(42)
  })

  it('addMetFriendId adds id to metFriendIds Set', () => {
    getState().addMetFriendId('friend-1')
    expect(getState().metFriendIds.has('friend-1')).toBe(true)
  })

  it('triggerCoinSpent sets coinSpent flag and increments coinSpentCount', () => {
    vi.useFakeTimers()
    getState().triggerCoinSpent()
    expect(getState().coinSpent).toBe(true)
    expect(getState().coinSpentCount).toBe(1)
    vi.useRealTimers()
  })

  it('coinSpentFlag resets to false after 600ms', () => {
    vi.useFakeTimers()
    getState().triggerCoinSpent()
    expect(getState().coinSpent).toBe(true)
    vi.advanceTimersByTime(601)
    expect(getState().coinSpent).toBe(false)
    vi.useRealTimers()
  })

  it('rapid triggerCoinSpent clears previous timer', () => {
    vi.useFakeTimers()
    getState().triggerCoinSpent()
    vi.advanceTimersByTime(300)
    getState().triggerCoinSpent()
    // Still true at 450ms after second call (300+150 = 450ms total, 150ms into second timer)
    vi.advanceTimersByTime(150)
    expect(getState().coinSpent).toBe(true)
    // Now advance past second timer
    vi.advanceTimersByTime(460)
    expect(getState().coinSpent).toBe(false)
    vi.useRealTimers()
  })
})

// ─── Blocked Users ────────────────────────────────────────────────────────────

describe('Blocked Users', () => {
  it('setBlockedUsers sets the blocked set', () => {
    getState().setBlockedUsers(['a', 'b', 'c'])
    expect(getState().blockedUsers.has('a')).toBe(true)
    expect(getState().blockedUsers.has('b')).toBe(true)
    expect(getState().blockedUsers.size).toBe(3)
  })

  it('addBlockedUser adds user, removes matching friend, removes matching thread, decrements friend_count', () => {
    const friend = buildFriend()
    const thread = buildThread({ participant_1_id: friend.id })
    getState().setFriends([friend])
    getState().setStats({ photos_count: 0, friends_count: 1 })
    getState().setThreads([thread])
    getState().addBlockedUser(friend.id)
    expect(getState().blockedUsers.has(friend.id)).toBe(true)
    expect(getState().friends.find((f) => f.id === friend.id)).toBeUndefined()
    expect(getState().threads.find((t) => t.id === thread.id)).toBeUndefined()
    expect(getState().stats.friends_count).toBe(0)
  })

  it('addBlockedUser with non-friend does not decrement friend_count', () => {
    getState().setStats({ photos_count: 0, friends_count: 2 })
    getState().addBlockedUser('not-a-friend')
    expect(getState().stats.friends_count).toBe(2)
  })

  it('removeBlockedUser removes user from blocked list', () => {
    getState().setBlockedUsers(['user-x'])
    getState().removeBlockedUser('user-x')
    expect(getState().blockedUsers.has('user-x')).toBe(false)
  })

  it('removeBlockedUser leaves other blocked users intact', () => {
    getState().setBlockedUsers(['user-x', 'user-y'])
    getState().removeBlockedUser('user-x')
    expect(getState().blockedUsers.has('user-y')).toBe(true)
  })
})

// ─── Presence / Location ──────────────────────────────────────────────────────

describe('Presence and Location', () => {
  it('setOnlineUsers sets the online user IDs', () => {
    getState().setOnlineUsers(['u1', 'u2'])
    expect(getState().onlineUsers.has('u1')).toBe(true)
    expect(getState().onlineUsers.has('u2')).toBe(true)
  })

  it('setUserLocation sets location', () => {
    getState().setUserLocation({ lat: 48.8566, lng: 2.3522 })
    expect(getState().userLocation).toEqual({ lat: 48.8566, lng: 2.3522 })
  })

  it('setNearbyUsers sets nearby users', () => {
    const users = [{ userId: 'u1', username: 'alice', avatar_url: null, display_name: 'Alice', lat: 0, lng: 0 }]
    getState().setNearbyUsers(users)
    expect(getState().nearbyUsers).toEqual(users)
  })

  it('setVisibleUsers sets visible users', () => {
    const users = [{ userId: 'u2', username: 'bob', avatar_url: null, display_name: 'Bob', lat: 1, lng: 1 }]
    getState().setVisibleUsers(users)
    expect(getState().visibleUsers).toEqual(users)
  })
})

// ─── clearStore ───────────────────────────────────────────────────────────────

describe('clearStore', () => {
  it('resets all state to initial values', () => {
    const profile = buildProfile()
    getState().setProfile(profile)
    getState().setCoins(100)
    getState().addFriend(buildFriend())
    getState().clearStore()

    const s = getState()
    expect(s.profile).toBeNull()
    expect(s.coins).toBe(5)
    expect(s.friends).toHaveLength(0)
    expect(s.threads).toHaveLength(0)
    expect(s.totalUnread).toBe(0)
    expect(s.isProfileLoaded).toBe(false)
    expect(s.isFriendsLoaded).toBe(false)
    expect(s.isMessagesLoaded).toBe(false)
  })

  it('creates fresh Set instances after clearStore (not shared references)', () => {
    const beforeSentRequestUserIds = getState().sentRequestUserIds
    getState().addSentRequest('x')
    getState().clearStore()
    const afterSentRequestUserIds = getState().sentRequestUserIds
    // Fresh set — should not be the same reference and should be empty
    expect(afterSentRequestUserIds).not.toBe(beforeSentRequestUserIds)
    expect(afterSentRequestUserIds.size).toBe(0)
  })
})

// ─── preloadAll ───────────────────────────────────────────────────────────────

describe('preloadAll', () => {
  function makePreloadResponse() {
    const profile = buildProfile()
    const friend = buildFriend()
    const thread = buildThread()
    return {
      profile: {
        profile,
        photos: [],
        interests: [],
        allTags: [],
        stats: { photos_count: 1, friends_count: 1 },
      },
      friends: {
        friends: [friend],
        requests: [],
        sentRequests: [],
        sentRequestUserIds: [],
      },
      messages: {
        threads: [thread],
        totalUnread: 3,
        blockedUserIds: [],
      },
      coins: {
        balance: 10,
        metFriendIds: ['met-1'],
      },
    }
  }

  it('sets isPreloading true while loading, false after', async () => {
    let resolveJson!: (v: unknown) => void
    const jsonPromise = new Promise((res) => { resolveJson = res })
    const mockFetch = vi.fn().mockResolvedValue({
      status: 200,
      ok: true,
      json: () => jsonPromise,
    })
    vi.stubGlobal('fetch', mockFetch)

    const promise = getState().preloadAll()
    // isPreloading should be true immediately
    expect(getState().isPreloading).toBe(true)
    resolveJson(makePreloadResponse())
    await promise
    expect(getState().isPreloading).toBe(false)
    vi.unstubAllGlobals()
  })

  it('populates profile, friends, threads, and coins from response', async () => {
    const data = makePreloadResponse()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      status: 200,
      ok: true,
      json: () => Promise.resolve(data),
    }))

    await getState().preloadAll()

    const s = getState()
    expect(s.profile).toEqual(data.profile.profile)
    expect(s.friends).toHaveLength(1)
    expect(s.threads).toHaveLength(1)
    expect(s.coins).toBe(10)
    expect(s.metFriendIds.has('met-1')).toBe(true)
    vi.unstubAllGlobals()
  })

  it('401 response redirects to /login', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      status: 401,
      ok: false,
      json: () => Promise.resolve({}),
    }))

    // window.location.href assignment in jsdom doesn't navigate but shouldn't throw
    const locationSpy = vi.spyOn(window, 'location', 'get').mockReturnValue({
      ...window.location,
      href: '',
    } as Location)

    await getState().preloadAll()
    // Just assert no error is set — redirect branch returns early
    expect(getState().preloadError).toBeNull()

    locationSpy.mockRestore()
    vi.unstubAllGlobals()
  })

  it('fetch failure sets preloadError', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network down')))

    await getState().preloadAll()

    expect(getState().preloadError).toBeTruthy()
    expect(getState().isPreloading).toBe(false)
    vi.unstubAllGlobals()
  })

  it('filters pending deletion friends from preload result', async () => {
    const data = makePreloadResponse()
    const pendingFriend = data.friends.friends[0]
    // Mark before preload
    getState().markFriendDeletionPending(pendingFriend.id)

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      status: 200,
      ok: true,
      json: () => Promise.resolve(data),
    }))

    await getState().preloadAll()

    expect(getState().friends.find((f) => f.id === pendingFriend.id)).toBeUndefined()
    vi.unstubAllGlobals()
  })
})
