import { renderHook, act } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import { buildProfile, buildDMMessage } from '../../../test/helpers/factories'
import { useAppStore } from '@/stores/appStore'
import { fetchAndCacheProfile } from '@/hooks/useRealtimeDM'

// vi.hoisted runs before imports — build mock inline
const mockClient = vi.hoisted(() => ({
  channel: vi.fn(() => ({
    on: vi.fn().mockReturnThis(),
    subscribe: vi.fn(() => ({ unsubscribe: vi.fn() })),
  })),
  removeChannel: vi.fn(() => Promise.resolve()),
}))

vi.mock('@/lib/supabase/client', () => ({
  createClient: vi.fn(() => mockClient),
}))

import { useRealtimeDM, getKnownProfile } from '@/hooks/useRealtimeDM'

type PostgresChangePayload = { new: Record<string, unknown> }
type PostgresChangeHandler = (payload: PostgresChangePayload) => void

// Capture postgres_changes callbacks by event type
let insertHandler: PostgresChangeHandler | null = null
let updateHandler: PostgresChangeHandler | null = null
let channelInstance: {
  on: ReturnType<typeof vi.fn>
  subscribe: ReturnType<typeof vi.fn>
}

function buildMockChannelInstance() {
  const instance = {
    on: vi.fn((type: string, opts: Record<string, unknown>, cb: PostgresChangeHandler) => {
      if (type === 'postgres_changes') {
        if ((opts as { event: string }).event === 'INSERT') insertHandler = cb
        if ((opts as { event: string }).event === 'UPDATE') updateHandler = cb
      }
      return instance
    }),
    subscribe: vi.fn(() => instance),
    unsubscribe: vi.fn(),
  }
  return instance
}

const defaultParams = {
  addMessage: vi.fn(),
  updateMessage: vi.fn(),
  setThreads: vi.fn(),
  updateTotalUnread: vi.fn(),
  isPreloading: false,
}

beforeEach(() => {
  useAppStore.getState().clearStore()
  vi.clearAllMocks()
  insertHandler = null
  updateHandler = null

  channelInstance = buildMockChannelInstance()
  mockClient.channel = vi.fn(() => channelInstance)
  mockClient.removeChannel = vi.fn(() => Promise.resolve())

  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ threads: [], total_unread: 0 }),
  }))
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('getKnownProfile', () => {
  it('finds profile via store.profile', () => {
    const profile = buildProfile({ id: 'p-1' })
    useAppStore.setState({ profile })
    expect(getKnownProfile('p-1')?.id).toBe('p-1')
  })

  it('falls back to profileCache', () => {
    const cached = buildProfile({ id: 'p-2' })
    useAppStore.setState({ profileCache: { 'p-2': cached } })
    expect(getKnownProfile('p-2')?.id).toBe('p-2')
  })

  it('falls back to friends list', () => {
    const friend = buildProfile({ id: 'p-3' })
    useAppStore.setState({ friends: [{ ...friend, friendship_id: 'f1' }] })
    expect(getKnownProfile('p-3')?.id).toBe('p-3')
  })

  it('falls back to thread participants', () => {
    const participant = buildProfile({ id: 'p-4' })
    const thread = {
      id: 't-1',
      participant_1_id: 'p-4',
      participant_2_id: 'other',
      participant_1: participant,
      participant_2: buildProfile({ id: 'other' }),
      last_message_at: null,
      last_message_preview: null,
      created_at: new Date().toISOString(),
      type: 'dm' as const,
      unread_count: 0,
    }
    useAppStore.setState({ threads: [thread] })
    expect(getKnownProfile('p-4')?.id).toBe('p-4')
  })

  it('returns undefined for unknown sender', () => {
    expect(getKnownProfile('unknown-xyz')).toBeUndefined()
  })
})

describe('useRealtimeDM', () => {
  it('creates Supabase channel on mount', async () => {
    renderHook(() => useRealtimeDM(defaultParams))
    await act(async () => {})
    expect(mockClient.channel).toHaveBeenCalledWith('global-dm-messages')
  })

  it('adds message to store on INSERT event', async () => {
    const addMessage = vi.fn()
    renderHook(() => useRealtimeDM({ ...defaultParams, addMessage }))
    await act(async () => {})

    const msg = buildDMMessage({ sender_id: 'sender-1', thread_id: 'thread-1' })
    act(() => {
      insertHandler?.({ new: msg })
    })

    expect(addMessage).toHaveBeenCalledWith('thread-1', expect.objectContaining({ id: msg.id }))
  })

  it('fetches and caches unknown sender profile on INSERT', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockImplementation((url: string) => {
        if (url.includes('/api/profile/')) {
          return Promise.resolve({ ok: true, json: async () => ({ profile: buildProfile({ id: 'sender-999' }) }) })
        }
        return Promise.resolve({ ok: true, json: async () => ({ threads: [], total_unread: 0 }) })
      })
    )

    renderHook(() => useRealtimeDM(defaultParams))
    await act(async () => {})

    const msg = buildDMMessage({ sender_id: 'sender-999', thread_id: 'thread-1' })

    await act(async () => {
      insertHandler?.({ new: msg })
    })

    expect(fetch).toHaveBeenCalledWith('/api/profile/sender-999')
  })

  it('updates message with profile after successful fetch', async () => {
    const updateMessage = vi.fn()
    const senderProfile = buildProfile({ id: 'sender-998' })

    vi.stubGlobal('fetch', vi.fn()
      .mockImplementation((url: string) => {
        if (url.includes('/api/profile/')) {
          return Promise.resolve({ ok: true, json: async () => ({ profile: senderProfile }) })
        }
        return Promise.resolve({ ok: true, json: async () => ({ threads: [], total_unread: 0 }) })
      })
    )

    renderHook(() => useRealtimeDM({ ...defaultParams, updateMessage }))
    await act(async () => {})

    const msg = buildDMMessage({ sender_id: 'sender-998', thread_id: 'thread-1' })

    await act(async () => {
      insertHandler?.({ new: msg })
    })

    expect(updateMessage).toHaveBeenCalledWith('thread-1', msg.id, { sender: senderProfile })
  })

  it('auto-marks thread as read when incoming message matches activeThreadId', async () => {
    const myProfile = buildProfile({ id: 'me-1' })
    useAppStore.setState({
      profile: myProfile,
      activeThreadId: 'active-thread',
    })

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ threads: [], total_unread: 0 }),
    }))

    renderHook(() => useRealtimeDM(defaultParams))
    await act(async () => {})

    const msg = buildDMMessage({ sender_id: 'sender-other', thread_id: 'active-thread' })

    await act(async () => {
      insertHandler?.({ new: msg })
    })

    expect(fetch).toHaveBeenCalledWith('/api/dm/active-thread/read', { method: 'POST' })
  })

  it('calls refetchThreads when tab becomes visible (throttle: first call)', async () => {
    renderHook(() => useRealtimeDM(defaultParams))
    await act(async () => {})

    await act(async () => {
      Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
      document.dispatchEvent(new Event('visibilitychange'))
    })

    expect(fetch).toHaveBeenCalledWith('/api/dm/threads')
  })

  it('removes channel on unmount', async () => {
    const { unmount } = renderHook(() => useRealtimeDM(defaultParams))
    await act(async () => {})
    unmount()
    expect(mockClient.removeChannel).toHaveBeenCalled()
  })

  it('does not set up channel when isPreloading is true', async () => {
    renderHook(() => useRealtimeDM({ ...defaultParams, isPreloading: true }))
    await act(async () => {})
    expect(mockClient.channel).not.toHaveBeenCalled()
  })

  it('updates message in store on UPDATE event', async () => {
    const updateMessage = vi.fn()
    renderHook(() => useRealtimeDM({ ...defaultParams, updateMessage }))
    await act(async () => {})

    const msg = buildDMMessage({ thread_id: 'thread-u', content: 'updated content' })

    act(() => {
      updateHandler?.({ new: msg })
    })

    expect(updateMessage).toHaveBeenCalledWith('thread-u', msg.id, expect.objectContaining({ content: 'updated content' }))
  })

  it('does not refetch threads when visibility change is within throttle window', async () => {
    renderHook(() => useRealtimeDM(defaultParams))
    await act(async () => {})

    // First visibility change — triggers fetch and sets lastVisibilityFetchRef
    await act(async () => {
      Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
      document.dispatchEvent(new Event('visibilitychange'))
    })

    const callCount = vi.mocked(fetch).mock.calls.filter(
      (c) => c[0] === '/api/dm/threads'
    ).length

    // Second visibility change immediately — should be throttled
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'))
    })

    const newCallCount = vi.mocked(fetch).mock.calls.filter(
      (c) => c[0] === '/api/dm/threads'
    ).length

    expect(newCallCount).toBe(callCount) // no additional call
  })

  it('does not refetch when visibility changes to hidden', async () => {
    renderHook(() => useRealtimeDM(defaultParams))
    await act(async () => {})

    vi.mocked(fetch).mockClear()

    await act(async () => {
      Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true })
      document.dispatchEvent(new Event('visibilitychange'))
    })

    expect(fetch).not.toHaveBeenCalledWith('/api/dm/threads')
  })
})

describe('fetchAndCacheProfile', () => {
  beforeEach(() => {
    useAppStore.getState().clearStore()
  })

  it('returns null when fetch response is not ok', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }))
    const result = await fetchAndCacheProfile('unknown-sender')
    expect(result).toBeNull()
  })

  it('returns null when fetch throws', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network error')))
    const result = await fetchAndCacheProfile('unknown-sender')
    expect(result).toBeNull()
  })

  it('returns null when response has no profile field', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ profile: null }),
    }))
    const result = await fetchAndCacheProfile('p-x')
    expect(result).toBeNull()
  })

  it('caches and returns profile on success', async () => {
    const profile = buildProfile({ id: 'p-cache' })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ profile }),
    }))
    const result = await fetchAndCacheProfile('p-cache')
    expect(result?.id).toBe('p-cache')
    expect(useAppStore.getState().profileCache['p-cache']).toBeDefined()
  })
})
