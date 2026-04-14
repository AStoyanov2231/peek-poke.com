import { renderHook, act } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import { useAppStore } from '@/stores/appStore'
import { buildNearbyUser } from '../../../test/helpers/factories'

vi.mock('@/lib/geo', () => ({
  haversineKm: vi.fn(),
}))

vi.mock('@/lib/constants', () => ({
  TRACK_DEBOUNCE_MS: 10000,
}))

// vi.hoisted: runs before any imports so the closure is valid inside vi.mock
const mockClient = vi.hoisted(() => ({
  channel: vi.fn(() => ({
    on: vi.fn().mockReturnThis(),
    subscribe: vi.fn((cb?: (status: string) => void) => { cb?.('SUBSCRIBED'); return { unsubscribe: vi.fn() } }),
    untrack: vi.fn(() => Promise.resolve()),
    track: vi.fn(() => Promise.resolve()),
    presenceState: vi.fn(() => ({})),
  })),
  removeChannel: vi.fn(() => Promise.resolve()),
}))

vi.mock('@/lib/supabase/client', () => ({
  createClient: vi.fn(() => mockClient),
}))

vi.mock('@/stores/selectors', () => ({
  useIsPreloading: vi.fn(() => false),
  useUserLocation: vi.fn(() => ({ lat: 40.7128, lng: -74.006 })),
}))

import { useNearbyPresence } from '@/hooks/useNearbyPresence'
import { haversineKm } from '@/lib/geo'
import { useIsPreloading, useUserLocation } from '@/stores/selectors'

const mockHaversineKm = vi.mocked(haversineKm)

const USER_ID = 'me-123'
const baseLocation = { lat: 40.7128, lng: -74.006 }

type ChannelInstance = {
  on: ReturnType<typeof vi.fn>
  subscribe: ReturnType<typeof vi.fn>
  untrack: ReturnType<typeof vi.fn>
  track: ReturnType<typeof vi.fn>
  presenceState: ReturnType<typeof vi.fn>
}

let capturedSyncCallback: (() => void) | null = null
let channelInstance: ChannelInstance
// Stored so afterEach can unmount and reset isSetupRef before next test
let cleanup: (() => void) | null = null

function makeChannelInstance(): ChannelInstance {
  const inst: ChannelInstance = {
    on: vi.fn((type: string, opts: Record<string, unknown>, cb?: () => void) => {
      if (type === 'presence' && (opts as { event: string }).event === 'sync' && cb) {
        capturedSyncCallback = cb
      }
      return inst
    }),
    subscribe: vi.fn((cb?: (status: string) => void) => { cb?.('SUBSCRIBED'); return { unsubscribe: vi.fn() } }),
    untrack: vi.fn(() => Promise.resolve()),
    track: vi.fn(() => Promise.resolve()),
    presenceState: vi.fn(() => ({})),
  }
  return inst
}

function render(userId: string | undefined) {
  const result = renderHook(() => useNearbyPresence(userId))
  cleanup = result.unmount
  return result
}

beforeEach(() => {
  // Unmount any previous render first so isSetupRef resets to false
  cleanup?.()
  cleanup = null

  useAppStore.getState().clearStore()
  useAppStore.setState({ userLocation: baseLocation })
  vi.clearAllMocks()
  capturedSyncCallback = null

  // Re-establish selector defaults after clearAllMocks
  vi.mocked(useIsPreloading).mockReturnValue(false)
  vi.mocked(useUserLocation).mockReturnValue(baseLocation)

  channelInstance = makeChannelInstance()
  mockClient.channel = vi.fn(() => channelInstance)
  mockClient.removeChannel = vi.fn(() => Promise.resolve())
})

afterEach(() => {
  cleanup?.()
  cleanup = null
  // resetAllMocks clears mockReturnValue state (restoreAllMocks only handles vi.spyOn)
  vi.resetAllMocks()
})

describe('useNearbyPresence', () => {
  it('creates Supabase channel on mount', async () => {
    render(USER_ID)
    await act(async () => {})
    expect(mockClient.channel).toHaveBeenCalledWith('user-locations', expect.any(Object))
  })

  it('filters users within 2km radius', async () => {
    const nearUser = buildNearbyUser({ userId: 'near-1', lat: 40.713, lng: -74.006 })
    mockHaversineKm.mockReturnValue(0.5) // 500m — within 2km

    channelInstance.presenceState = vi.fn(() => ({
      'near-1': [nearUser],
    }))

    render(USER_ID)
    await act(async () => {
      capturedSyncCallback?.()
    })

    expect(useAppStore.getState().nearbyUsers).toHaveLength(1)
    expect(useAppStore.getState().nearbyUsers[0].userId).toBe('near-1')
  })

  it('excludes users beyond 2km', async () => {
    const farUser = buildNearbyUser({ userId: 'far-1', lat: 41.0, lng: -74.006 })
    mockHaversineKm.mockReturnValue(32) // 32km — beyond radius

    channelInstance.presenceState = vi.fn(() => ({
      'far-1': [farUser],
    }))

    render(USER_ID)
    await act(async () => {
      capturedSyncCallback?.()
    })

    expect(useAppStore.getState().nearbyUsers).toHaveLength(0)
  })

  it('excludes own userId from nearby list', async () => {
    const selfUser = buildNearbyUser({ userId: USER_ID })
    mockHaversineKm.mockReturnValue(0)

    channelInstance.presenceState = vi.fn(() => ({
      [USER_ID]: [selfUser],
    }))

    render(USER_ID)
    await act(async () => {
      capturedSyncCallback?.()
    })

    expect(useAppStore.getState().nearbyUsers).toHaveLength(0)
  })

  it('returns empty array when no location set', async () => {
    vi.mocked(useUserLocation).mockReturnValue(null)
    useAppStore.setState({ userLocation: null })

    const nearUser = buildNearbyUser({ userId: 'near-1' })
    channelInstance.presenceState = vi.fn(() => ({
      'near-1': [nearUser],
    }))

    render(USER_ID)
    await act(async () => {
      capturedSyncCallback?.()
    })

    // No location in store → haversine never called → nearby stays empty
    expect(useAppStore.getState().nearbyUsers).toHaveLength(0)
  })

  it('does not set up when userId is undefined', async () => {
    render(undefined)
    await act(async () => {})
    expect(mockClient.channel).not.toHaveBeenCalled()
  })

  it('does not set up when isPreloading is true', async () => {
    vi.mocked(useIsPreloading).mockReturnValue(true)
    render(USER_ID)
    await act(async () => {})
    expect(mockClient.channel).not.toHaveBeenCalled()
  })

  it('removes channel on unmount', async () => {
    const { unmount } = render(USER_ID)
    await act(async () => {})
    // Prevent afterEach double-unmount
    cleanup = null
    unmount()
    expect(mockClient.removeChannel).toHaveBeenCalled()
  })

  it('calls channel.track on SUBSCRIBED when userLocation is set', async () => {
    // userLocation is set in beforeEach via appStore
    render(USER_ID)
    await act(async () => {})

    expect(channelInstance.track).toHaveBeenCalledWith(
      expect.objectContaining({ userId: USER_ID, lat: baseLocation.lat, lng: baseLocation.lng })
    )
  })

  it('does not call channel.track on SUBSCRIBED when userLocation is null', async () => {
    vi.mocked(useUserLocation).mockReturnValue(null)
    useAppStore.setState({ userLocation: null })

    render(USER_ID)
    await act(async () => {})

    // track should not have been called (no location available)
    expect(channelInstance.track).not.toHaveBeenCalled()
  })

  it('tracks location update via location tracking effect when channel is ready', async () => {
    vi.useFakeTimers()

    const { rerender } = render(USER_ID)
    await act(async () => {})

    // track called once from SUBSCRIBED; reset
    channelInstance.track.mockClear()

    // Advance time past TRACK_DEBOUNCE_MS (mocked as 10000ms) so debounce passes
    vi.advanceTimersByTime(15000)

    // Simulate userLocation change in store after channel is set up
    const newLocation = { lat: 51.5074, lng: -0.1278 }
    await act(async () => {
      useAppStore.setState({ userLocation: newLocation })
      vi.mocked(useUserLocation).mockReturnValue(newLocation)
      rerender()
    })

    expect(channelInstance.track).toHaveBeenCalledWith(
      expect.objectContaining({ userId: USER_ID, lat: newLocation.lat, lng: newLocation.lng })
    )

    vi.useRealTimers()
  })

  it('uses empty string for username when profile has no username', async () => {
    useAppStore.setState({
      userLocation: baseLocation,
      profile: { id: USER_ID, username: null, avatar_url: null, display_name: null } as Parameters<typeof useAppStore.setState>[0]['profile'],
    })

    render(USER_ID)
    await act(async () => {})

    expect(channelInstance.track).toHaveBeenCalledWith(
      expect.objectContaining({ username: '' })
    )
  })
})
