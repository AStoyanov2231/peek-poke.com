import { renderHook, act } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import { useMeetingDetection } from '@/hooks/useMeetingDetection'
import { useAppStore } from '@/stores/appStore'
import { buildProfile, buildNearbyUser } from '../../../test/helpers/factories'

// Mock @/lib/geo
vi.mock('@/lib/geo', () => ({
  haversineKm: vi.fn(),
}))

import { haversineKm } from '@/lib/geo'
const mockHaversineKm = vi.mocked(haversineKm)

const USER_ID = 'user-123'
const FRIEND_ID = 'friend-456'

const baseLocation = { lat: 40.7128, lng: -74.006 }

function setupStore(overrides: Partial<Parameters<typeof useAppStore.setState>[0]> = {}) {
  useAppStore.setState({
    userLocation: baseLocation,
    friends: [],
    nearbyUsers: [],
    metFriendIds: new Set(),
    ...overrides,
  })
}

beforeEach(() => {
  useAppStore.getState().clearStore()
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ awarded: true, balance: 10 }),
  }))
  mockHaversineKm.mockReturnValue(0.03) // 30m — within 50m
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('useMeetingDetection', () => {
  it('calls /api/coins/meeting when friend is within 50m', async () => {
    const friend = buildProfile({ id: FRIEND_ID })
    const nearby = buildNearbyUser({ userId: FRIEND_ID, lat: 40.7129, lng: -74.006 })

    setupStore({
      friends: [{ ...friend, friendship_id: 'f1' }],
      nearbyUsers: [nearby],
      userLocation: baseLocation,
    })

    renderHook(() => useMeetingDetection(USER_ID))

    // Trigger a store change so the subscriber fires
    await act(async () => {
      useAppStore.setState({ nearbyUsers: [nearby] })
    })

    expect(fetch).toHaveBeenCalledWith(
      '/api/coins/meeting',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ friend_id: FRIEND_ID }),
      })
    )
  })

  it('does NOT call when friend is >50m away', async () => {
    mockHaversineKm.mockReturnValue(0.1) // 100m — outside radius

    const friend = buildProfile({ id: FRIEND_ID })
    const nearby = buildNearbyUser({ userId: FRIEND_ID, lat: 40.714, lng: -74.006 })

    setupStore({
      friends: [{ ...friend, friendship_id: 'f1' }],
      nearbyUsers: [nearby],
      userLocation: baseLocation,
    })

    renderHook(() => useMeetingDetection(USER_ID))

    await act(async () => {
      useAppStore.setState({ nearbyUsers: [nearby] })
    })

    expect(fetch).not.toHaveBeenCalled()
  })

  it('deduplicates — same friend not called twice in same session', async () => {
    const friend = buildProfile({ id: FRIEND_ID })
    const nearby = buildNearbyUser({ userId: FRIEND_ID, lat: 40.7129, lng: -74.006 })

    setupStore({
      friends: [{ ...friend, friendship_id: 'f1' }],
      nearbyUsers: [nearby],
      userLocation: baseLocation,
    })

    renderHook(() => useMeetingDetection(USER_ID))

    await act(async () => {
      useAppStore.setState({ nearbyUsers: [nearby] })
    })
    await act(async () => {
      useAppStore.setState({ userLocation: { lat: 40.71281, lng: -74.006 } })
    })

    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('allows retry after error (error does not permanently block)', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error('Network error'))

    const friend = buildProfile({ id: FRIEND_ID })
    const nearby = buildNearbyUser({ userId: FRIEND_ID, lat: 40.7129, lng: -74.006 })

    setupStore({
      friends: [{ ...friend, friendship_id: 'f1' }],
      nearbyUsers: [nearby],
      userLocation: baseLocation,
    })

    renderHook(() => useMeetingDetection(USER_ID))

    // First call — errors
    await act(async () => {
      useAppStore.setState({ nearbyUsers: [nearby] })
    })

    // After error, calledRef is cleared — second state change should retry
    await act(async () => {
      useAppStore.setState({ userLocation: { lat: 40.71282, lng: -74.006 } })
    })

    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('does nothing when userLocation is null', async () => {
    const friend = buildProfile({ id: FRIEND_ID })
    const nearby = buildNearbyUser({ userId: FRIEND_ID })

    setupStore({
      friends: [{ ...friend, friendship_id: 'f1' }],
      nearbyUsers: [nearby],
      userLocation: null,
    })

    renderHook(() => useMeetingDetection(USER_ID))

    await act(async () => {
      useAppStore.setState({ nearbyUsers: [nearby] })
    })

    expect(fetch).not.toHaveBeenCalled()
  })

  it('does nothing when no nearby users', async () => {
    const friend = buildProfile({ id: FRIEND_ID })

    setupStore({
      friends: [{ ...friend, friendship_id: 'f1' }],
      nearbyUsers: [],
      userLocation: baseLocation,
    })

    renderHook(() => useMeetingDetection(USER_ID))

    await act(async () => {
      useAppStore.setState({ nearbyUsers: [] })
    })

    expect(fetch).not.toHaveBeenCalled()
  })

  it('does nothing when userId is undefined', async () => {
    const friend = buildProfile({ id: FRIEND_ID })
    const nearby = buildNearbyUser({ userId: FRIEND_ID })

    setupStore({
      friends: [{ ...friend, friendship_id: 'f1' }],
      nearbyUsers: [nearby],
      userLocation: baseLocation,
    })

    renderHook(() => useMeetingDetection(undefined))

    await act(async () => {
      useAppStore.setState({ nearbyUsers: [nearby] })
    })

    expect(fetch).not.toHaveBeenCalled()
  })

  it('handles fetch error gracefully without throwing', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('Network error'))

    const friend = buildProfile({ id: FRIEND_ID })
    const nearby = buildNearbyUser({ userId: FRIEND_ID, lat: 40.7129, lng: -74.006 })

    setupStore({
      friends: [{ ...friend, friendship_id: 'f1' }],
      nearbyUsers: [nearby],
      userLocation: baseLocation,
    })

    const { unmount } = renderHook(() => useMeetingDetection(USER_ID))

    await expect(
      act(async () => {
        useAppStore.setState({ nearbyUsers: [nearby] })
      })
    ).resolves.not.toThrow()

    unmount()
  })
})
