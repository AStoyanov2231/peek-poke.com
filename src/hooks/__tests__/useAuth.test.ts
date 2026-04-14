import { renderHook, act } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import { buildProfile } from '../../../test/helpers/factories'
import { useAppStore } from '@/stores/appStore'

// Mock native lib to avoid window.isNativeApp issues in jsdom
vi.mock('@/lib/native', () => ({
  isNativeApp: vi.fn(() => false),
  postToNative: vi.fn(),
}))

// vi.hoisted runs before imports — build mock inline
const mockClient = vi.hoisted(() => ({
  auth: {
    getSession: vi.fn(() => Promise.resolve({ data: { session: null }, error: null })),
    onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
  },
}))

vi.mock('@/lib/supabase/client', () => ({
  createClient: vi.fn(() => mockClient),
}))

import { useAuth } from '@/hooks/useAuth'

const fakeUser = { id: 'user-001', email: 'test@example.com' }
const fakeProfile = buildProfile({ id: 'user-001' })

function setupSession(user: typeof fakeUser | null = fakeUser) {
  mockClient.auth.getSession = vi.fn(() =>
    Promise.resolve({ data: { session: user ? { user } : null }, error: null })
  )
}

function setupAuthStateChange(events: Array<{ event: string; user: typeof fakeUser | null }> = []) {
  let cb: ((event: string, session: { user: typeof fakeUser } | null) => void) | null = null
  mockClient.auth.onAuthStateChange = vi.fn((handler: typeof cb) => {
    cb = handler
    return { data: { subscription: { unsubscribe: vi.fn() } } }
  })
  return {
    fire: (event: string, user: typeof fakeUser | null) => {
      cb?.(event, user ? { user } : null)
    },
  }
}

beforeEach(() => {
  useAppStore.getState().clearStore()
  vi.clearAllMocks()
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ profile: fakeProfile }),
  }))
  setupAuthStateChange()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('useAuth', () => {
  it('returns user from session on mount', async () => {
    setupSession(fakeUser)

    const { result } = renderHook(() => useAuth())

    await act(async () => {})

    expect(result.current.user?.id).toBe('user-001')
  })

  it('fetches profile via /api/auth/profile after getting user', async () => {
    setupSession(fakeUser)

    renderHook(() => useAuth())

    await act(async () => {})

    expect(fetch).toHaveBeenCalledWith('/api/auth/profile', { method: 'POST' })
  })

  it('sets profile in local state after fetch', async () => {
    setupSession(fakeUser)

    const { result } = renderHook(() => useAuth())

    await act(async () => {})

    expect(result.current.profile?.id).toBe('user-001')
  })

  it('handles fetchOrCreateProfile failure gracefully', async () => {
    setupSession(fakeUser)
    vi.mocked(fetch).mockResolvedValue({ ok: false, json: async () => ({}) } as Response)

    const { result } = renderHook(() => useAuth())

    await act(async () => {})

    expect(result.current.profile).toBeNull()
    expect(result.current.loading).toBe(false)
  })

  it('sets loading to false after completion', async () => {
    setupSession(fakeUser)

    const { result } = renderHook(() => useAuth())

    expect(result.current.loading).toBe(true)

    await act(async () => {})

    expect(result.current.loading).toBe(false)
  })

  it('clears user on sign out event', async () => {
    setupSession(fakeUser)
    const authChange = setupAuthStateChange()

    const { result } = renderHook(() => useAuth())
    await act(async () => {})

    await act(async () => {
      authChange.fire('SIGNED_OUT', null)
    })

    expect(result.current.user).toBeNull()
    expect(result.current.profile).toBeNull()
  })

  it('handles no session (returns null user)', async () => {
    setupSession(null)

    const { result } = renderHook(() => useAuth())

    await act(async () => {})

    expect(result.current.user).toBeNull()
    expect(result.current.loading).toBe(false)
  })
})
