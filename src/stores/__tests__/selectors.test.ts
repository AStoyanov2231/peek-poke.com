import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { act } from 'react'
import { useAppStore } from '@/stores/appStore'
import {
  useProfile,
  useCoins,
  useFriends,
  useThreads,
  useTotalUnread,
  useIsFullyLoaded,
  useIsPremium,
  useHasRole,
} from '@/stores/selectors'
import { buildProfile, resetFactoryCounter } from '../../../test/helpers/factories'
import type { FriendWithFriendshipId, Thread } from '@/stores/appStore'

function buildFriend(): FriendWithFriendshipId {
  const p = buildProfile()
  return { ...p, friendship_id: `fs-${p.id}` }
}

function buildThread(): Thread {
  const p1 = buildProfile()
  const p2 = buildProfile()
  return {
    id: `thread-${Math.random()}`,
    participant_1_id: p1.id,
    participant_2_id: p2.id,
    last_message_at: null,
    last_message_preview: null,
    created_at: new Date().toISOString(),
    type: 'dm' as const,
    participant_1: p1,
    participant_2: p2,
    unread_count: 0,
  }
}

beforeEach(() => {
  resetFactoryCounter()
  useAppStore.getState().clearStore()
})

describe('Selectors', () => {
  it('useProfile returns profile from store', () => {
    const profile = buildProfile()
    act(() => { useAppStore.getState().setProfile(profile) })
    const { result } = renderHook(() => useProfile())
    expect(result.current).toEqual(profile)
  })

  it('useCoins returns coins balance', () => {
    act(() => { useAppStore.getState().setCoins(99) })
    const { result } = renderHook(() => useCoins())
    expect(result.current).toBe(99)
  })

  it('useFriends returns friends array', () => {
    const friends = [buildFriend(), buildFriend()]
    act(() => { useAppStore.getState().setFriends(friends) })
    const { result } = renderHook(() => useFriends())
    expect(result.current).toHaveLength(2)
  })

  it('useThreads returns threads array', () => {
    const threads = [buildThread(), buildThread()]
    act(() => { useAppStore.getState().setThreads(threads) })
    const { result } = renderHook(() => useThreads())
    expect(result.current).toHaveLength(2)
  })

  it('useTotalUnread returns totalUnread count', () => {
    act(() => { useAppStore.getState().updateTotalUnread(7) })
    const { result } = renderHook(() => useTotalUnread())
    expect(result.current).toBe(7)
  })

  it('useIsFullyLoaded returns true when all 3 loading flags are true', async () => {
    // Stub fetch to simulate successful preload that sets all flags
    const mockData = {
      profile: { profile: buildProfile(), photos: [], interests: [], allTags: [], stats: { photos_count: 0, friends_count: 0 } },
      friends: { friends: [], requests: [], sentRequests: [], sentRequestUserIds: [] },
      messages: { threads: [], totalUnread: 0, blockedUserIds: [] },
      coins: { balance: 5, metFriendIds: [] },
    }
    const fetchMock = vi.fn().mockResolvedValue({ status: 200, ok: true, json: () => Promise.resolve(mockData) })
    vi.stubGlobal('fetch', fetchMock)
    await act(async () => { await useAppStore.getState().preloadAll() })
    vi.unstubAllGlobals()

    const { result } = renderHook(() => useIsFullyLoaded())
    expect(result.current).toBe(true)
  })

  it('useIsFullyLoaded returns false when any loading flag is false', () => {
    act(() => {
      useAppStore.setState({ isProfileLoaded: true, isFriendsLoaded: true, isMessagesLoaded: false })
    })
    const { result } = renderHook(() => useIsFullyLoaded())
    expect(result.current).toBe(false)
  })

  it('useIsPremium returns true when profile has subscriber role', () => {
    const profile = buildProfile({ roles: ['user', 'subscriber'] })
    act(() => { useAppStore.getState().setProfile(profile) })
    const { result } = renderHook(() => useIsPremium())
    expect(result.current).toBe(true)
  })

  it('useIsPremium returns false when profile does not have subscriber role', () => {
    const profile = buildProfile({ roles: ['user'] })
    act(() => { useAppStore.getState().setProfile(profile) })
    const { result } = renderHook(() => useIsPremium())
    expect(result.current).toBe(false)
  })

  it('useHasRole returns true when profile has the specified role', () => {
    const profile = buildProfile({ roles: ['user', 'moderator'] })
    act(() => { useAppStore.getState().setProfile(profile) })
    const { result } = renderHook(() => useHasRole('moderator'))
    expect(result.current).toBe(true)
  })

  it('useHasRole returns false when profile does not have the specified role', () => {
    const profile = buildProfile({ roles: ['user'] })
    act(() => { useAppStore.getState().setProfile(profile) })
    const { result } = renderHook(() => useHasRole('moderator'))
    expect(result.current).toBe(false)
  })
})
