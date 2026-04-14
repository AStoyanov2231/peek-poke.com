import { vi, describe, it, expect, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// Mock @supabase/ssr since middleware uses it directly (not via @/lib/supabase/server)
const mockGetUser = vi.fn()
const mockSignOut = vi.fn()
const mockFrom = vi.fn()

vi.mock('@supabase/ssr', () => ({
  createServerClient: vi.fn(() => ({
    auth: {
      getUser: mockGetUser,
      signOut: mockSignOut,
    },
    from: mockFrom,
  })),
}))

import { middleware } from '@/middleware'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeReq(
  path: string,
  options: { method?: string; headers?: Record<string, string> } = {}
): NextRequest {
  const { method = 'GET', headers = {} } = options
  return new NextRequest(`http://localhost:3000${path}`, {
    method,
    headers: {
      host: 'localhost:3000',
      ...headers,
    },
  })
}

function mockUnauthenticated() {
  mockGetUser.mockResolvedValue({ data: { user: null }, error: null })
}

function mockAuthenticated(userId = 'user-123') {
  mockGetUser.mockResolvedValue({ data: { user: { id: userId } }, error: null })
}

function mockProfile(profile: Record<string, unknown> | null) {
  const terminal = () => Promise.resolve({ data: profile, error: null })
  const builder: Record<string, unknown> = {}
  ;['select', 'eq', 'neq', 'order', 'limit'].forEach((m) => {
    builder[m] = vi.fn(() => builder)
  })
  builder.single = vi.fn(terminal)
  mockFrom.mockReturnValue(builder)
}

// ---------------------------------------------------------------------------
// CSRF Protection
// ---------------------------------------------------------------------------

describe('CSRF protection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should block POST /api/* without origin header', async () => {
    const req = makeReq('/api/messages', { method: 'POST' })
    const res = await middleware(req)
    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body.error).toBe('Forbidden')
  })

  it('should allow POST /api/* with valid same-origin header', async () => {
    const req = makeReq('/api/messages', {
      method: 'POST',
      headers: { origin: 'http://localhost:3000', host: 'localhost:3000' },
    })
    const res = await middleware(req)
    // Should pass CSRF and call NextResponse.next() (status 200)
    expect(res.status).not.toBe(403)
  })

  it('should allow POST /api/* with Bearer token (native app)', async () => {
    const req = makeReq('/api/messages', {
      method: 'POST',
      headers: { authorization: 'Bearer sometoken123' },
    })
    const res = await middleware(req)
    expect(res.status).not.toBe(403)
  })

  it('should allow GET requests without origin header', async () => {
    const req = makeReq('/api/messages', { method: 'GET' })
    const res = await middleware(req)
    expect(res.status).not.toBe(403)
  })

  it('should block POST /api/* with origin from different domain', async () => {
    const req = makeReq('/api/messages', {
      method: 'POST',
      headers: { origin: 'http://evil.com', host: 'localhost:3000' },
    })
    const res = await middleware(req)
    expect(res.status).toBe(403)
  })

  it('should allow POST /api/stripe/webhook without origin (webhook exempt)', async () => {
    const req = makeReq('/api/stripe/webhook', { method: 'POST' })
    const res = await middleware(req)
    // Webhook is exempt from CSRF — should pass through (not 403)
    expect(res.status).not.toBe(403)
  })
})

// ---------------------------------------------------------------------------
// Unauthenticated access
// ---------------------------------------------------------------------------

describe('unauthenticated access', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUnauthenticated()
  })

  it('should redirect to /login when accessing protected route unauthenticated', async () => {
    const req = makeReq('/home')
    const res = await middleware(req)
    expect(res.status).toBeGreaterThanOrEqual(300)
    expect(res.status).toBeLessThan(400)
    expect(res.headers.get('location')).toContain('/login')
  })

  it('should preserve redirectTo query param in redirect', async () => {
    const req = makeReq('/home')
    const res = await middleware(req)
    const location = res.headers.get('location') ?? ''
    expect(location).toContain('redirectTo=%2Fhome')
  })

  it('should allow access to /login when unauthenticated', async () => {
    const req = makeReq('/login')
    const res = await middleware(req)
    // Not a redirect away from login
    const location = res.headers.get('location') ?? ''
    expect(location).not.toContain('/login')
    // Status should be 200 (pass-through) or no redirect
    expect(res.status).not.toBeGreaterThanOrEqual(300)
  })

  it('should allow access to /welcome when unauthenticated', async () => {
    const req = makeReq('/welcome')
    const res = await middleware(req)
    // /welcome is an auth page — unauthenticated users are not redirected away
    const location = res.headers.get('location') ?? ''
    expect(location).not.toContain('/login')
  })
})

// ---------------------------------------------------------------------------
// Onboarding flow
// ---------------------------------------------------------------------------

describe('onboarding flow', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should redirect to /onboarding when onboarding not completed on protected page', async () => {
    mockAuthenticated()
    mockProfile({ onboarding_completed: false, deleted_at: null })
    const req = makeReq('/home')
    const res = await middleware(req)
    expect(res.headers.get('location')).toContain('/onboarding')
  })

  it('should allow access when onboarding is completed', async () => {
    mockAuthenticated()
    mockProfile({ onboarding_completed: true, deleted_at: null })
    const req = makeReq('/home')
    const res = await middleware(req)
    const location = res.headers.get('location') ?? ''
    expect(location).not.toContain('/onboarding')
    expect(location).not.toContain('/login')
  })

  it('should allow access to /onboarding when not onboarded', async () => {
    mockAuthenticated()
    mockProfile({ onboarding_completed: false, deleted_at: null })
    const req = makeReq('/onboarding')
    const res = await middleware(req)
    const location = res.headers.get('location') ?? ''
    // Should NOT redirect away from /onboarding
    expect(location).not.toContain('/onboarding')
  })

  it('should redirect away from /onboarding when already onboarded', async () => {
    mockAuthenticated()
    mockProfile({ onboarding_completed: true, deleted_at: null })
    const req = makeReq('/onboarding')
    const res = await middleware(req)
    expect(res.headers.get('location')).toContain('/')
  })

  it('should redirect authenticated+onboarded user from /login to /', async () => {
    mockAuthenticated()
    mockProfile({ onboarding_completed: true, deleted_at: null })
    const req = makeReq('/login')
    const res = await middleware(req)
    const location = res.headers.get('location') ?? ''
    // Should redirect to home, not stay on /login
    expect(location).toContain('/')
    expect(location).not.toContain('/login')
  })

  it('should redirect authenticated+not-onboarded user from /login to /onboarding', async () => {
    mockAuthenticated()
    mockProfile({ onboarding_completed: false, deleted_at: null })
    const req = makeReq('/login')
    const res = await middleware(req)
    expect(res.headers.get('location')).toContain('/onboarding')
  })

  it('should handle missing profile gracefully (treat as not onboarded)', async () => {
    mockAuthenticated()
    mockProfile(null)
    const req = makeReq('/home')
    const res = await middleware(req)
    // null profile → onboarding_completed defaults to false → redirect to onboarding
    expect(res.headers.get('location')).toContain('/onboarding')
  })
})

// ---------------------------------------------------------------------------
// Deleted accounts
// ---------------------------------------------------------------------------

describe('deleted accounts', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSignOut.mockResolvedValue({ error: null })
  })

  it('should redirect to /login when account is deleted', async () => {
    mockAuthenticated()
    mockProfile({ onboarding_completed: true, deleted_at: '2024-01-01T00:00:00Z' })
    const req = makeReq('/home')
    const res = await middleware(req)
    expect(res.headers.get('location')).toContain('/login')
  })

  it('should call signOut for deleted account', async () => {
    mockAuthenticated()
    mockProfile({ onboarding_completed: true, deleted_at: '2024-01-01T00:00:00Z' })
    const req = makeReq('/home')
    await middleware(req)
    expect(mockSignOut).toHaveBeenCalledOnce()
  })
})
