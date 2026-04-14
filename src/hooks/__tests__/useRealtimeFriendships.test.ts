import { renderHook, act } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'

const mockClient = vi.hoisted(() => ({
  channel: vi.fn(),
  removeChannel: vi.fn(() => Promise.resolve()),
}))

vi.mock('@/lib/supabase/client', () => ({
  createClient: vi.fn(() => mockClient),
}))

import { useRealtimeFriendships } from '@/hooks/useRealtimeFriendships'

type ChangeHandler = () => void

let changeHandler: ChangeHandler | null = null
let channelInstance: {
  on: ReturnType<typeof vi.fn>
  subscribe: ReturnType<typeof vi.fn>
  unsubscribe: ReturnType<typeof vi.fn>
}

function buildChannelInstance() {
  const instance = {
    on: vi.fn((_type: string, _opts: unknown, cb: ChangeHandler) => {
      changeHandler = cb
      return instance
    }),
    subscribe: vi.fn(() => instance),
    unsubscribe: vi.fn(),
  }
  return instance
}

const defaultParams = {
  setFriends: vi.fn(),
  setRequests: vi.fn(),
  setSentRequests: vi.fn(),
  updateStats: vi.fn(),
  isPreloading: false,
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.clearAllMocks()
  changeHandler = null

  channelInstance = buildChannelInstance()
  mockClient.channel = vi.fn(() => channelInstance)
  mockClient.removeChannel = vi.fn(() => Promise.resolve())

  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({ friends: [], requests: [], sentRequests: [] }),
  }))
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('useRealtimeFriendships', () => {
  it('does not set up channel when isPreloading is true', async () => {
    renderHook(() => useRealtimeFriendships({ ...defaultParams, isPreloading: true }))
    await act(async () => {})
    expect(mockClient.channel).not.toHaveBeenCalled()
  })

  it('creates friendships channel on mount', async () => {
    renderHook(() => useRealtimeFriendships(defaultParams))
    await act(async () => {})
    expect(mockClient.channel).toHaveBeenCalledWith('global-friendships')
  })

  it('calls refetchFriends after debounce when friendship changes', async () => {
    const setFriends = vi.fn()
    const setRequests = vi.fn()

    renderHook(() => useRealtimeFriendships({ ...defaultParams, setFriends, setRequests }))
    await act(async () => {})

    act(() => {
      changeHandler?.()
    })

    // advance past the 1500ms debounce
    await act(async () => {
      vi.advanceTimersByTime(1600)
    })

    await act(async () => {})

    expect(setFriends).toHaveBeenCalledWith([])
    expect(setRequests).toHaveBeenCalledWith([])
  })

  it('cleans up channel on unmount', async () => {
    const { unmount } = renderHook(() => useRealtimeFriendships(defaultParams))
    await act(async () => {})
    unmount()
    expect(mockClient.removeChannel).toHaveBeenCalled()
  })
})
