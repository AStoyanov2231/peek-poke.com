import { renderHook, act } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import { useAppStore } from '@/stores/appStore'

// vi.hoisted runs before imports — build mock inline
const mockClient = vi.hoisted(() => {
  const channelMock = {
    on: vi.fn().mockReturnThis(),
    subscribe: vi.fn((cb?: (status: string) => void) => { cb?.('SUBSCRIBED'); return { unsubscribe: vi.fn() } }),
    untrack: vi.fn(() => Promise.resolve()),
    track: vi.fn(() => Promise.resolve()),
    presenceState: vi.fn(() => ({})),
  }
  return {
    channel: vi.fn(() => channelMock),
    removeChannel: vi.fn(() => Promise.resolve()),
    auth: {
      getSession: vi.fn(() => Promise.resolve({ data: { session: null }, error: null })),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
    },
  }
})

vi.mock('@/lib/supabase/client', () => ({
  createClient: vi.fn(() => mockClient),
}))

// Mock selectors so isPreloading = false by default
vi.mock('@/stores/selectors', () => ({
  useIsPreloading: vi.fn(() => false),
}))

import { usePresence } from '@/hooks/usePresence'
import { useIsPreloading } from '@/stores/selectors'

const USER_ID = 'user-abc'

beforeEach(() => {
  useAppStore.getState().clearStore()
  vi.clearAllMocks()
  // Reset channel mock to return fresh spy instances
  const channelMock = {
    on: vi.fn().mockReturnThis(),
    subscribe: vi.fn((cb?: (status: string) => void) => { cb?.('SUBSCRIBED'); return { unsubscribe: vi.fn() } }),
    untrack: vi.fn(() => Promise.resolve()),
    track: vi.fn(() => Promise.resolve()),
    presenceState: vi.fn(() => ({})),
  }
  mockClient.channel = vi.fn(() => channelMock)
  mockClient.removeChannel = vi.fn(() => Promise.resolve())
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('usePresence', () => {
  it('creates Supabase channel on mount', async () => {
    renderHook(() => usePresence(USER_ID))

    await act(async () => {})

    expect(mockClient.channel).toHaveBeenCalledWith('online-users', expect.objectContaining({
      config: { presence: { key: USER_ID } },
    }))
  })

  it('tracks presence when channel status is SUBSCRIBED', async () => {
    const channelMock = mockClient.channel()
    renderHook(() => usePresence(USER_ID))

    await act(async () => {})

    expect(channelMock.track).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: USER_ID })
    )
  })

  it('syncs online user IDs from presence state', async () => {
    const channelMock = {
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn((cb?: (status: string) => void) => { cb?.('SUBSCRIBED'); return { unsubscribe: vi.fn() } }),
      untrack: vi.fn(() => Promise.resolve()),
      track: vi.fn(() => Promise.resolve()),
      presenceState: vi.fn(() => ({
        'user-1': [{ user_id: 'user-1', online_at: new Date().toISOString() }],
        'user-2': [{ user_id: 'user-2', online_at: new Date().toISOString() }],
      })),
    }
    mockClient.channel = vi.fn(() => channelMock)

    // Capture the sync callback
    let syncCallback: (() => void) | null = null
    channelMock.on = vi.fn((event: string, opts: Record<string, unknown>, cb: () => void) => {
      if (event === 'presence' && (opts as { event: string }).event === 'sync') {
        syncCallback = cb
      }
      return channelMock
    })

    renderHook(() => usePresence(USER_ID))

    await act(async () => {
      syncCallback?.()
    })

    const onlineUsers = useAppStore.getState().onlineUsers
    expect(onlineUsers.has('user-1')).toBe(true)
    expect(onlineUsers.has('user-2')).toBe(true)
  })

  it('untracks when document becomes hidden', async () => {
    const channelMock = mockClient.channel()

    renderHook(() => usePresence(USER_ID))
    await act(async () => {})

    await act(async () => {
      Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true })
      document.dispatchEvent(new Event('visibilitychange'))
    })

    expect(channelMock.untrack).toHaveBeenCalled()
  })

  it('removes channel on unmount', async () => {
    const { unmount } = renderHook(() => usePresence(USER_ID))

    await act(async () => {})
    unmount()

    expect(mockClient.removeChannel).toHaveBeenCalled()
  })

  it('does not track when user not authenticated (userId undefined)', async () => {
    renderHook(() => usePresence(undefined))

    await act(async () => {})

    expect(mockClient.channel).not.toHaveBeenCalled()
  })

  it('does not set up when isPreloading is true', async () => {
    vi.mocked(useIsPreloading).mockReturnValue(true)

    renderHook(() => usePresence(USER_ID))

    await act(async () => {})

    expect(mockClient.channel).not.toHaveBeenCalled()
  })
})
