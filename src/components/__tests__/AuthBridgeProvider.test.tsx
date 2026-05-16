import { render, screen, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

// ------- hoisted mock state -------

const mocks = vi.hoisted(() => {
  const setAuthMock = vi.fn(async () => {})
  const clearAuthMock = vi.fn(async () => {})
  const setRoleMock = vi.fn()
  const isNativeMock = vi.fn(() => true)
  const getSessionMock = vi.fn(async () => ({ data: { session: null } }))
  const unsubscribeMock = vi.fn()
  const onAuthStateChangeMock = vi.fn(() => ({
    data: { subscription: { unsubscribe: unsubscribeMock } },
  }))
  const storeSubscribeMock = vi.fn(() => vi.fn())
  const storeGetStateMock = vi.fn(() => ({ profile: null }))
  return {
    setAuthMock, clearAuthMock, setRoleMock, isNativeMock,
    getSessionMock, unsubscribeMock, onAuthStateChangeMock,
    storeSubscribeMock, storeGetStateMock,
  }
})

// ------- mocks -------

vi.mock('next/navigation', () => ({
  usePathname: () => '/inbox',
}))

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: vi.fn(() => true) },
  registerPlugin: vi.fn(() => ({})),
  WebPlugin: class {},
}))

vi.mock('@/lib/peekpoke-bridge', () => ({
  PeekPokeBridge: {
    setAuth: (...a: unknown[]) => mocks.setAuthMock(...a),
    clearAuth: (...a: unknown[]) => mocks.clearAuthMock(...a),
    setRole: (...a: unknown[]) => mocks.setRoleMock(...a),
  },
}))

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: {
      getSession: (...a: unknown[]) => mocks.getSessionMock(...a),
      onAuthStateChange: (...a: unknown[]) => mocks.onAuthStateChangeMock(...a),
    },
  }),
}))

vi.mock('@/lib/native', () => ({
  isNativeApp: () => mocks.isNativeMock(),
}))

vi.mock('@/stores/appStore', () => ({
  useAppStore: Object.assign(vi.fn(), {
    getState: (...a: unknown[]) => mocks.storeGetStateMock(...a),
    subscribe: (...a: unknown[]) => mocks.storeSubscribeMock(...a),
  }),
}))

// ------- import under test -------

import { AuthBridgeProvider } from '@/components/AuthBridgeProvider'

beforeEach(() => {
  vi.clearAllMocks()
  mocks.isNativeMock.mockReturnValue(true)
  mocks.getSessionMock.mockResolvedValue({ data: { session: null } })
  mocks.onAuthStateChangeMock.mockReturnValue({
    data: { subscription: { unsubscribe: mocks.unsubscribeMock } },
  })
  mocks.storeGetStateMock.mockReturnValue({ profile: null })
  mocks.storeSubscribeMock.mockReturnValue(vi.fn())
})

// ------- tests -------

describe('AuthBridgeProvider', () => {
  it('renders children', async () => {
    render(<AuthBridgeProvider><div>child</div></AuthBridgeProvider>)
    await act(async () => {})
    expect(screen.getByText('child')).toBeInTheDocument()
  })

  it('does nothing when not in native app', async () => {
    mocks.isNativeMock.mockReturnValue(false)
    render(<AuthBridgeProvider><span /></AuthBridgeProvider>)
    await act(async () => {})
    expect(mocks.getSessionMock).not.toHaveBeenCalled()
    expect(mocks.onAuthStateChangeMock).not.toHaveBeenCalled()
  })

  it('calls setAuth when session exists on mount', async () => {
    mocks.getSessionMock.mockResolvedValueOnce({
      data: { session: { access_token: 'at', refresh_token: 'rt', expires_at: 9999 } },
    })
    render(<AuthBridgeProvider><span /></AuthBridgeProvider>)
    await act(async () => {})
    expect(mocks.setAuthMock).toHaveBeenCalledWith({
      accessToken: 'at',
      refreshToken: 'rt',
      expiresAt: 9999,
    })
  })

  it('does not call clearAuth when initial session is null (not a sign-out)', async () => {
    mocks.getSessionMock.mockResolvedValueOnce({ data: { session: null } })
    render(<AuthBridgeProvider><span /></AuthBridgeProvider>)
    await act(async () => {})
    expect(mocks.clearAuthMock).not.toHaveBeenCalled()
  })

  it('calls setAuth when onAuthStateChange fires with a session', async () => {
    let authCallback: ((event: string, session: unknown) => void) | null = null
    mocks.onAuthStateChangeMock.mockImplementation((cb) => {
      authCallback = cb
      return { data: { subscription: { unsubscribe: mocks.unsubscribeMock } } }
    })

    render(<AuthBridgeProvider><span /></AuthBridgeProvider>)
    await act(async () => {})

    await act(async () => {
      authCallback?.('SIGNED_IN', { access_token: 'at2', refresh_token: 'rt2', expires_at: 1234 })
    })

    expect(mocks.setAuthMock).toHaveBeenCalledWith({
      accessToken: 'at2',
      refreshToken: 'rt2',
      expiresAt: 1234,
    })
  })

  it('calls clearAuth when onAuthStateChange fires SIGNED_OUT', async () => {
    let authCallback: ((event: string, session: unknown) => void) | null = null
    mocks.onAuthStateChangeMock.mockImplementation((cb) => {
      authCallback = cb
      return { data: { subscription: { unsubscribe: mocks.unsubscribeMock } } }
    })

    render(<AuthBridgeProvider><span /></AuthBridgeProvider>)
    await act(async () => {})

    await act(async () => {
      authCallback?.('SIGNED_OUT', null)
    })

    expect(mocks.clearAuthMock).toHaveBeenCalled()
  })

  it('does not call clearAuth when onAuthStateChange fires with null session but non-SIGNED_OUT event', async () => {
    let authCallback: ((event: string, session: unknown) => void) | null = null
    mocks.onAuthStateChangeMock.mockImplementation((cb) => {
      authCallback = cb
      return { data: { subscription: { unsubscribe: mocks.unsubscribeMock } } }
    })

    render(<AuthBridgeProvider><span /></AuthBridgeProvider>)
    await act(async () => {})

    await act(async () => {
      authCallback?.('INITIAL_SESSION', null)
    })

    expect(mocks.clearAuthMock).not.toHaveBeenCalled()
  })

  it('unsubscribes on unmount', async () => {
    const { unmount } = render(<AuthBridgeProvider><span /></AuthBridgeProvider>)
    await act(async () => {})
    unmount()
    expect(mocks.unsubscribeMock).toHaveBeenCalled()
  })

  it('calls setRole with true when user has admin role', async () => {
    mocks.storeGetStateMock.mockReturnValue({ profile: { roles: ['admin', 'user'] } })
    render(<AuthBridgeProvider><span /></AuthBridgeProvider>)
    await act(async () => {})
    expect(mocks.setRoleMock).toHaveBeenCalledWith({ isAdmin: true })
  })

  it('calls setRole with false when user has no admin role', async () => {
    mocks.storeGetStateMock.mockReturnValue({ profile: { roles: ['user'] } })
    render(<AuthBridgeProvider><span /></AuthBridgeProvider>)
    await act(async () => {})
    expect(mocks.setRoleMock).toHaveBeenCalledWith({ isAdmin: false })
  })
})
