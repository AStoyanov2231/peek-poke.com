import { render, screen, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

// ------- hoisted mock state -------

const mocks = vi.hoisted(() => {
  const listeners: Record<string, ((...args: unknown[]) => void)[]> = {}
  const removeStub = vi.fn()
  const pushMock = vi.fn()
  const replaceMock = vi.fn()
  const setLastRouteMock = vi.fn()
  const getAuthMock = vi.fn(async () => ({}))
  const setAuthMock = vi.fn(async () => {})
  const fetchMock = vi.fn(async () => ({
    ok: true,
    json: async () => ({ next: '/inbox' }),
  }))
  const getSessionMock = vi.fn(async () => ({ data: { session: null } }))
  const getUserMock = vi.fn(async () => ({ data: { user: null } }))
  const refreshSessionMock = vi.fn(async () => ({ data: { session: null }, error: null }))
  const setSessionMock = vi.fn(async () => {})
  const isNativeMock = vi.fn(() => true)
  const pathnameMock = vi.fn(() => '/inbox')
  return {
    listeners, removeStub, pushMock, replaceMock, setLastRouteMock,
    getAuthMock, setAuthMock, fetchMock, getSessionMock, getUserMock, refreshSessionMock,
    setSessionMock, isNativeMock, pathnameMock,
  }
})

// ------- mocks -------

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.pushMock, replace: mocks.replaceMock }),
  usePathname: () => mocks.pathnameMock(),
}))

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: vi.fn(() => true) },
  registerPlugin: vi.fn(() => ({})),
  WebPlugin: class {},
}))

vi.mock('@/lib/peekpoke-bridge', () => ({
  PeekPokeBridge: {
    addListener: vi.fn((event: string, cb: (...args: unknown[]) => void) => {
      if (!mocks.listeners[event]) mocks.listeners[event] = []
      mocks.listeners[event].push(cb)
      return Promise.resolve({ remove: mocks.removeStub })
    }),
    setLastRoute: (...args: unknown[]) => mocks.setLastRouteMock(...args),
    getAuth: (...args: unknown[]) => mocks.getAuthMock(...args),
    setAuth: (...args: unknown[]) => mocks.setAuthMock(...args),
  },
}))

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: {
      getSession: (...args: unknown[]) => mocks.getSessionMock(...args),
      getUser: (...args: unknown[]) => mocks.getUserMock(...args),
      refreshSession: (...args: unknown[]) => mocks.refreshSessionMock(...args),
      setSession: (...args: unknown[]) => mocks.setSessionMock(...args),
    },
  }),
}))

vi.mock('@/lib/native', () => ({
  isNativeApp: () => mocks.isNativeMock(),
}))

// ------- helpers -------

import { NativeBridgeProvider } from '@/components/NativeBridgeProvider'

function fireEvent(event: string, payload?: unknown) {
  mocks.listeners[event]?.forEach((cb) => cb(payload))
}

function renderProvider(path = '/inbox') {
  mocks.pathnameMock.mockReturnValue(path)
  return render(
    <NativeBridgeProvider>
      <div data-testid="child">child</div>
    </NativeBridgeProvider>
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('fetch', mocks.fetchMock)
  Object.keys(mocks.listeners).forEach((k) => delete mocks.listeners[k])
  mocks.isNativeMock.mockReturnValue(true)
  mocks.pathnameMock.mockReturnValue('/inbox')
})

// ------- tests -------

describe('NativeBridgeProvider', () => {
  it('renders children', () => {
    renderProvider()
    expect(screen.getByTestId('child')).toBeInTheDocument()
  })

  describe('navigate event allow-list', () => {
    it('navigates to /inbox', async () => {
      renderProvider()
      await act(async () => fireEvent('navigate', { route: '/inbox' }))
      expect(mocks.pushMock).toHaveBeenCalledWith('/inbox')
    })

    it('navigates to /profile/<id>', async () => {
      renderProvider()
      await act(async () => fireEvent('navigate', { route: '/profile/abc123' }))
      expect(mocks.pushMock).toHaveBeenCalledWith('/profile/abc123')
    })

    it('navigates to /chat/<id>', async () => {
      renderProvider()
      await act(async () => fireEvent('navigate', { route: '/chat/room1' }))
      expect(mocks.pushMock).toHaveBeenCalledWith('/chat/room1')
    })

    it('navigates to /admin', async () => {
      renderProvider()
      await act(async () => fireEvent('navigate', { route: '/admin' }))
      expect(mocks.pushMock).toHaveBeenCalledWith('/admin')
    })

    it('navigates to /onboarding', async () => {
      renderProvider()
      await act(async () => fireEvent('navigate', { route: '/onboarding' }))
      expect(mocks.pushMock).toHaveBeenCalledWith('/onboarding')
    })

    it('navigates to /login', async () => {
      renderProvider()
      await act(async () => fireEvent('navigate', { route: '/login' }))
      expect(mocks.pushMock).toHaveBeenCalledWith('/login')
    })

    it('navigates to /welcome', async () => {
      renderProvider()
      await act(async () => fireEvent('navigate', { route: '/welcome' }))
      expect(mocks.pushMock).toHaveBeenCalledWith('/welcome')
    })

    it('navigates to /inbox with query params', async () => {
      renderProvider()
      await act(async () => fireEvent('navigate', { route: '/inbox?contact=user1' }))
      expect(mocks.pushMock).toHaveBeenCalledWith('/inbox?contact=user1')
    })

    it('rejects /secret (unknown route)', async () => {
      renderProvider()
      await act(async () => fireEvent('navigate', { route: '/secret' }))
      expect(mocks.pushMock).not.toHaveBeenCalled()
    })

    it('rejects external URL', async () => {
      renderProvider()
      await act(async () => fireEvent('navigate', { route: 'https://evil.com' }))
      expect(mocks.pushMock).not.toHaveBeenCalled()
    })
  })

  describe('setLastRoute', () => {
    it('reports inbox tab for /inbox', () => {
      renderProvider('/inbox')
      expect(mocks.setLastRouteMock).toHaveBeenCalledWith({ tab: 'inbox', route: '/inbox' })
    })

    it('reports inbox tab for /chat/<id>', () => {
      renderProvider('/chat/room1')
      expect(mocks.setLastRouteMock).toHaveBeenCalledWith({ tab: 'inbox', route: '/chat/room1' })
    })

    it('reports profile tab for /profile/<id>', () => {
      renderProvider('/profile/xyz')
      expect(mocks.setLastRouteMock).toHaveBeenCalledWith({ tab: 'profile', route: '/profile/xyz' })
    })

    it('reports admin tab for /admin', () => {
      renderProvider('/admin')
      expect(mocks.setLastRouteMock).toHaveBeenCalledWith({ tab: 'admin', route: '/admin' })
    })

    it('does not call setLastRoute for untracked routes like /', () => {
      renderProvider('/')
      expect(mocks.setLastRouteMock).not.toHaveBeenCalled()
    })
  })

  describe('appResumed event', () => {
    it('pushes /login when user is not authenticated', async () => {
      mocks.getUserMock.mockResolvedValueOnce({ data: { user: null } })
      renderProvider()
      await act(async () => fireEvent('appResumed'))
      expect(mocks.pushMock).toHaveBeenCalledWith('/login')
    })

    it('does not push /login when user is authenticated', async () => {
      mocks.getUserMock.mockResolvedValueOnce({ data: { user: { id: 'u1' } } })
      renderProvider()
      await act(async () => fireEvent('appResumed'))
      expect(mocks.pushMock).not.toHaveBeenCalled()
    })
  })

  describe('auto-handoff on /login', () => {
    it('posts tokens to native-handoff and redirects when tokens are stored but no web session', async () => {
      mocks.getSessionMock.mockResolvedValueOnce({ data: { session: null } })
      mocks.getAuthMock.mockResolvedValueOnce({ accessToken: 'at', refreshToken: 'rt' })
      renderProvider('/login')
      await act(async () => {})
      expect(mocks.fetchMock).toHaveBeenCalledWith('/auth/native-handoff', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ accessToken: 'at', refreshToken: 'rt', next: '/inbox' }),
      })
      expect(mocks.replaceMock).toHaveBeenCalledWith('/inbox')
    })

    it('does not redirect when web session already exists', async () => {
      mocks.getSessionMock.mockResolvedValueOnce({ data: { session: { user: { id: 'u1' } } } })
      renderProvider('/login')
      await act(async () => {})
      expect(mocks.replaceMock).not.toHaveBeenCalled()
    })

    it('does not redirect when no stored tokens', async () => {
      mocks.getSessionMock.mockResolvedValueOnce({ data: { session: null } })
      mocks.getAuthMock.mockResolvedValueOnce({})
      renderProvider('/login')
      await act(async () => {})
      expect(mocks.replaceMock).not.toHaveBeenCalled()
    })
  })

  it('does not subscribe to events when not in native app', async () => {
    mocks.isNativeMock.mockReturnValue(false)
    const { PeekPokeBridge } = await import('@/lib/peekpoke-bridge')
    renderProvider()
    expect(PeekPokeBridge.addListener).not.toHaveBeenCalled()
  })
})
