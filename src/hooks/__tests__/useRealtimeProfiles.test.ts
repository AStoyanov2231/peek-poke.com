import { renderHook, act } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'

const mockClient = vi.hoisted(() => ({
  channel: vi.fn(),
  removeChannel: vi.fn(() => Promise.resolve()),
}))

vi.mock('@/lib/supabase/client', () => ({
  createClient: vi.fn(() => mockClient),
}))

import { useRealtimeProfiles } from '@/hooks/useRealtimeProfiles'
import { useAppStore } from '@/stores/appStore'

type UpdatePayload = { new: Record<string, unknown> }
type UpdateHandler = (payload: UpdatePayload) => void

let updateHandler: UpdateHandler | null = null
let channelInstance: {
  on: ReturnType<typeof vi.fn>
  subscribe: ReturnType<typeof vi.fn>
  unsubscribe: ReturnType<typeof vi.fn>
}

function buildChannelInstance() {
  const instance = {
    on: vi.fn((type: string, _opts: unknown, cb: UpdateHandler) => {
      if (type === 'postgres_changes') updateHandler = cb
      return instance
    }),
    subscribe: vi.fn(() => instance),
    unsubscribe: vi.fn(),
  }
  return instance
}

beforeEach(() => {
  useAppStore.getState().clearStore()
  vi.clearAllMocks()
  updateHandler = null

  channelInstance = buildChannelInstance()
  mockClient.channel = vi.fn(() => channelInstance)
  mockClient.removeChannel = vi.fn(() => Promise.resolve())
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('useRealtimeProfiles', () => {
  it('does not set up channel when isPreloading is true', async () => {
    renderHook(() => useRealtimeProfiles({ isPreloading: true }))
    await act(async () => {})
    expect(mockClient.channel).not.toHaveBeenCalled()
  })

  it('creates profiles channel on mount', async () => {
    renderHook(() => useRealtimeProfiles({ isPreloading: false }))
    await act(async () => {})
    expect(mockClient.channel).toHaveBeenCalledWith('global-profiles')
  })

  it('updates store profile on UPDATE event when id matches', async () => {
    const currentProfile = {
      id: 'p-1',
      display_name: 'Original',
      username: 'user1',
      avatar_url: null,
      bio: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      coins: 0,
      roles: ['user' as const],
    }
    useAppStore.setState({ profile: currentProfile as any })

    renderHook(() => useRealtimeProfiles({ isPreloading: false }))
    await act(async () => {})

    act(() => {
      updateHandler?.({ new: { id: 'p-1', display_name: 'Updated' } })
    })

    expect(useAppStore.getState().profile?.display_name).toBe('Updated')
  })

  it('does not update store when profile id does not match', async () => {
    const currentProfile = {
      id: 'p-1',
      display_name: 'Original',
      username: 'user1',
      avatar_url: null,
      bio: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      coins: 0,
      roles: ['user' as const],
    }
    useAppStore.setState({ profile: currentProfile as any })

    const originalDisplayName = useAppStore.getState().profile?.display_name

    renderHook(() => useRealtimeProfiles({ isPreloading: false }))
    await act(async () => {})

    act(() => {
      updateHandler?.({ new: { id: 'p-2', display_name: 'Intruder' } })
    })

    // profile should remain unchanged
    const profileAfter = useAppStore.getState().profile
    expect(profileAfter?.display_name).not.toBe('Updated')
    expect(profileAfter?.display_name).toBe(originalDisplayName)
  })

  it('cleans up channel on unmount', async () => {
    const { unmount } = renderHook(() => useRealtimeProfiles({ isPreloading: false }))
    await act(async () => {})
    unmount()
    expect(mockClient.removeChannel).toHaveBeenCalled()
  })
})
