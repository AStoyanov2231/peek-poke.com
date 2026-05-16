import { renderHook, act } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import { useAppStore } from '@/stores/appStore'
import { buildNearbyUser } from '../../../test/helpers/factories'

vi.mock('@/lib/constants', () => ({
  TRACK_DEBOUNCE_MS: 10_000,
}))

vi.mock('@/stores/selectors', () => ({
  useIsPreloading: vi.fn(() => false),
  useUserLocation: vi.fn(() => ({ lat: 40.7128, lng: -74.006 })),
}))

import { useNearbyPresence } from '@/hooks/useNearbyPresence'
import { useIsPreloading, useUserLocation } from '@/stores/selectors'

const USER_ID = 'me-123'
const baseLocation = { lat: 40.7128, lng: -74.006 }

const nearUser = buildNearbyUser({ userId: 'near-1', lat: 40.713, lng: -74.006 })

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  useAppStore.getState().clearStore()
  useAppStore.setState({ userLocation: baseLocation })
  vi.clearAllMocks()

  vi.mocked(useIsPreloading).mockReturnValue(false)
  vi.mocked(useUserLocation).mockReturnValue(baseLocation)

  fetchMock = vi.fn(async (url: string) => {
    if (url === '/api/nearby') {
      return { ok: true, json: async () => ({ users: [nearUser] }) }
    }
    return { ok: true, json: async () => ({ ok: true }) }
  })
  vi.stubGlobal('fetch', fetchMock)
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('useNearbyPresence', () => {
  it('fetches nearby users on mount', async () => {
    renderHook(() => useNearbyPresence(USER_ID))
    await act(async () => {})

    expect(fetchMock).toHaveBeenCalledWith('/api/nearby', expect.objectContaining({
      method: 'POST',
    }))
    expect(useAppStore.getState().nearbyUsers).toHaveLength(1)
    expect(useAppStore.getState().nearbyUsers[0].userId).toBe('near-1')
  })

  it('pushes own location to /api/location when location is set', async () => {
    renderHook(() => useNearbyPresence(USER_ID))
    await act(async () => {})

    expect(fetchMock).toHaveBeenCalledWith('/api/location', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ lat: baseLocation.lat, lng: baseLocation.lng }),
    }))
  })

  it('polls /api/nearby on interval', async () => {
    renderHook(() => useNearbyPresence(USER_ID))
    await act(async () => {})
    const callsBefore = fetchMock.mock.calls.filter((c) => c[0] === '/api/nearby').length

    await act(async () => { vi.advanceTimersByTime(10_000) })
    const callsAfter = fetchMock.mock.calls.filter((c) => c[0] === '/api/nearby').length

    expect(callsAfter).toBeGreaterThan(callsBefore)
  })

  it('does not set up when userId is undefined', async () => {
    renderHook(() => useNearbyPresence(undefined))
    await act(async () => {})
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('does not set up when isPreloading is true', async () => {
    vi.mocked(useIsPreloading).mockReturnValue(true)
    renderHook(() => useNearbyPresence(USER_ID))
    await act(async () => {})
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('clears poll interval on unmount', async () => {
    const clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval')
    const { unmount } = renderHook(() => useNearbyPresence(USER_ID))
    await act(async () => {})
    unmount()
    expect(clearIntervalSpy).toHaveBeenCalled()
  })

  it('does not push location when no location set', async () => {
    vi.mocked(useUserLocation).mockReturnValue(null)
    useAppStore.setState({ userLocation: null })
    renderHook(() => useNearbyPresence(USER_ID))
    await act(async () => {})
    const locationCalls = fetchMock.mock.calls.filter((c) => c[0] === '/api/location')
    expect(locationCalls).toHaveLength(0)
  })

  it('handles /api/nearby network error gracefully', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url === '/api/nearby') throw new Error('Network error')
      return { ok: true, json: async () => ({ ok: true }) }
    })
    const { result } = renderHook(() => useNearbyPresence(USER_ID))
    await act(async () => {})
    // Should not throw; nearby users stays as previous (empty)
    expect(useAppStore.getState().nearbyUsers).toHaveLength(0)
    expect(result.current).toBeUndefined() // hook renders nothing
  })
})
