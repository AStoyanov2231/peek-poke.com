import { renderHook, act } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createMockSupabaseClient, mockSupabaseBrowser } from '../../../test/mocks/supabase'
import { useAppStore } from '@/stores/appStore'

const mockClient = createMockSupabaseClient()
mockSupabaseBrowser(mockClient)

// Mock the three sub-hooks to isolate useRealtimeSync
const mockUseRealtimeDM = vi.fn()
const mockUseRealtimeFriendships = vi.fn()
const mockUseRealtimeProfiles = vi.fn()

vi.mock('@/hooks/useRealtimeDM', () => ({
  useRealtimeDM: (...args: unknown[]) => mockUseRealtimeDM(...args),
}))

vi.mock('@/hooks/useRealtimeFriendships', () => ({
  useRealtimeFriendships: (...args: unknown[]) => mockUseRealtimeFriendships(...args),
}))

vi.mock('@/hooks/useRealtimeProfiles', () => ({
  useRealtimeProfiles: (...args: unknown[]) => mockUseRealtimeProfiles(...args),
}))

vi.mock('@/stores/selectors', () => ({
  useIsPreloading: vi.fn(() => false),
}))

import { useRealtimeSync } from '@/hooks/useRealtimeSync'
import { useIsPreloading } from '@/stores/selectors'

beforeEach(() => {
  useAppStore.getState().clearStore()
  vi.clearAllMocks()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('useRealtimeSync', () => {
  it('mounts without crashing', async () => {
    expect(() => {
      const { unmount } = renderHook(() => useRealtimeSync())
      unmount()
    }).not.toThrow()
  })

  it('calls useRealtimeDM sub-hook with store actions', async () => {
    renderHook(() => useRealtimeSync())
    await act(async () => {})

    expect(mockUseRealtimeDM).toHaveBeenCalledWith(
      expect.objectContaining({
        addMessage: expect.any(Function),
        updateMessage: expect.any(Function),
        setThreads: expect.any(Function),
        updateTotalUnread: expect.any(Function),
        isPreloading: false,
      })
    )
  })

  it('calls useRealtimeFriendships sub-hook with store actions', async () => {
    renderHook(() => useRealtimeSync())
    await act(async () => {})

    expect(mockUseRealtimeFriendships).toHaveBeenCalledWith(
      expect.objectContaining({
        setFriends: expect.any(Function),
        setRequests: expect.any(Function),
        setSentRequests: expect.any(Function),
        updateStats: expect.any(Function),
        isPreloading: false,
      })
    )
  })

  it('passes isPreloading correctly to sub-hooks', async () => {
    vi.mocked(useIsPreloading).mockReturnValue(true)

    renderHook(() => useRealtimeSync())
    await act(async () => {})

    expect(mockUseRealtimeDM).toHaveBeenCalledWith(
      expect.objectContaining({ isPreloading: true })
    )
    expect(mockUseRealtimeFriendships).toHaveBeenCalledWith(
      expect.objectContaining({ isPreloading: true })
    )
  })
})
