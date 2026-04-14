import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { createMockSupabaseClient } from '../../../test/mocks/supabase'

// Must be at top level
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

import { createClient } from '@/lib/supabase/server'
import { withAuth, requireModeratorRole, verifyThreadParticipant, isBlocked, hasSubscriberRole } from '../auth'

const VALID_UUID_A = '550e8400-e29b-41d4-a716-446655440001'
const VALID_UUID_B = '550e8400-e29b-41d4-a716-446655440002'

function makeRequest(url = 'http://localhost/api/test') {
  return new NextRequest(url)
}

function makeUser(id = VALID_UUID_A) {
  return { id, email: 'test@example.com', aud: 'authenticated' }
}

describe('withAuth', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should call handler when user is authenticated', async () => {
    const user = makeUser()
    const mockClient = createMockSupabaseClient()
    mockClient.auth.getUser = vi.fn().mockResolvedValue({ data: { user }, error: null })
    vi.mocked(createClient).mockResolvedValue(mockClient as ReturnType<typeof createMockSupabaseClient>)

    const handler = vi.fn().mockResolvedValue(new Response('ok', { status: 200 }))
    const wrapped = withAuth(handler)
    const response = await wrapped(makeRequest())

    expect(handler).toHaveBeenCalledOnce()
    expect(response.status).toBe(200)
  })

  it('should return 401 when user is not authenticated', async () => {
    const mockClient = createMockSupabaseClient()
    mockClient.auth.getUser = vi.fn().mockResolvedValue({ data: { user: null }, error: null })
    vi.mocked(createClient).mockResolvedValue(mockClient as ReturnType<typeof createMockSupabaseClient>)

    const handler = vi.fn()
    const wrapped = withAuth(handler)
    const response = await wrapped(makeRequest())

    expect(handler).not.toHaveBeenCalled()
    expect(response.status).toBe(401)
  })

  it('should pass resolved route params to handler', async () => {
    const user = makeUser()
    const mockClient = createMockSupabaseClient()
    mockClient.auth.getUser = vi.fn().mockResolvedValue({ data: { user }, error: null })
    vi.mocked(createClient).mockResolvedValue(mockClient as ReturnType<typeof createMockSupabaseClient>)

    const handler = vi.fn().mockResolvedValue(new Response('ok'))
    const wrapped = withAuth<{ id: string }>(handler)
    await wrapped(makeRequest(), { params: Promise.resolve({ id: 'abc' }) })

    expect(handler).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ params: { id: 'abc' } })
    )
  })

  it('should pass empty params when no route context provided', async () => {
    const user = makeUser()
    const mockClient = createMockSupabaseClient()
    mockClient.auth.getUser = vi.fn().mockResolvedValue({ data: { user }, error: null })
    vi.mocked(createClient).mockResolvedValue(mockClient as ReturnType<typeof createMockSupabaseClient>)

    const handler = vi.fn().mockResolvedValue(new Response('ok'))
    const wrapped = withAuth(handler)
    await wrapped(makeRequest())

    expect(handler).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ params: {} })
    )
  })

  it('should pass supabase client to handler', async () => {
    const user = makeUser()
    const mockClient = createMockSupabaseClient()
    mockClient.auth.getUser = vi.fn().mockResolvedValue({ data: { user }, error: null })
    vi.mocked(createClient).mockResolvedValue(mockClient as ReturnType<typeof createMockSupabaseClient>)

    const handler = vi.fn().mockResolvedValue(new Response('ok'))
    const wrapped = withAuth(handler)
    await wrapped(makeRequest())

    expect(handler).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ supabase: mockClient })
    )
  })

  it('should await params promise correctly', async () => {
    const user = makeUser()
    const mockClient = createMockSupabaseClient()
    mockClient.auth.getUser = vi.fn().mockResolvedValue({ data: { user }, error: null })
    vi.mocked(createClient).mockResolvedValue(mockClient as ReturnType<typeof createMockSupabaseClient>)

    const handler = vi.fn().mockResolvedValue(new Response('ok'))
    const wrapped = withAuth<{ slug: string }>(handler)
    await wrapped(makeRequest(), { params: Promise.resolve({ slug: 'test-slug' }) })

    const ctx = handler.mock.calls[0][1]
    expect(ctx.params.slug).toBe('test-slug')
  })
})

describe('requireModeratorRole', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should return null for a user with moderator role', async () => {
    const mockClient = createMockSupabaseClient()
    mockClient.rpc = vi.fn()
      .mockResolvedValueOnce({ data: true, error: null })  // moderator
      .mockResolvedValueOnce({ data: false, error: null }) // admin
    const result = await requireModeratorRole(mockClient as ReturnType<typeof createMockSupabaseClient>, VALID_UUID_A)
    expect(result).toBeNull()
  })

  it('should return null for a user with admin role', async () => {
    const mockClient = createMockSupabaseClient()
    mockClient.rpc = vi.fn()
      .mockResolvedValueOnce({ data: false, error: null }) // moderator
      .mockResolvedValueOnce({ data: true, error: null })  // admin
    const result = await requireModeratorRole(mockClient as ReturnType<typeof createMockSupabaseClient>, VALID_UUID_A)
    expect(result).toBeNull()
  })

  it('should return 403 Response for a regular user', async () => {
    const mockClient = createMockSupabaseClient()
    mockClient.rpc = vi.fn()
      .mockResolvedValue({ data: false, error: null })
    const result = await requireModeratorRole(mockClient as ReturnType<typeof createMockSupabaseClient>, VALID_UUID_A)
    expect(result?.status).toBe(403)
  })

  it('should call rpc with correct args for moderator and admin checks', async () => {
    const mockClient = createMockSupabaseClient()
    mockClient.rpc = vi.fn().mockResolvedValue({ data: true, error: null })
    await requireModeratorRole(mockClient as ReturnType<typeof createMockSupabaseClient>, VALID_UUID_A)
    expect(mockClient.rpc).toHaveBeenCalledWith('user_has_role', { p_user_id: VALID_UUID_A, p_role_name: 'moderator' })
    expect(mockClient.rpc).toHaveBeenCalledWith('user_has_role', { p_user_id: VALID_UUID_A, p_role_name: 'admin' })
  })
})

describe('verifyThreadParticipant', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should return thread data when user is participant_1', async () => {
    const thread = { id: 'thread-1', participant_1_id: VALID_UUID_A, participant_2_id: VALID_UUID_B }
    const mockClient = createMockSupabaseClient()
    const qb = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: thread, error: null }),
    }
    mockClient.from = vi.fn().mockReturnValue(qb)
    const result = await verifyThreadParticipant(mockClient as ReturnType<typeof createMockSupabaseClient>, 'thread-1', VALID_UUID_A)
    expect(result).toEqual(thread)
  })

  it('should return thread data when user is participant_2', async () => {
    const thread = { id: 'thread-1', participant_1_id: VALID_UUID_A, participant_2_id: VALID_UUID_B }
    const mockClient = createMockSupabaseClient()
    const qb = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: thread, error: null }),
    }
    mockClient.from = vi.fn().mockReturnValue(qb)
    const result = await verifyThreadParticipant(mockClient as ReturnType<typeof createMockSupabaseClient>, 'thread-1', VALID_UUID_B)
    expect(result).toEqual(thread)
  })

  it('should return null for a non-participant', async () => {
    const thread = { id: 'thread-1', participant_1_id: VALID_UUID_A, participant_2_id: VALID_UUID_B }
    const mockClient = createMockSupabaseClient()
    const qb = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: thread, error: null }),
    }
    mockClient.from = vi.fn().mockReturnValue(qb)
    const OTHER_UUID = '550e8400-e29b-41d4-a716-446655440099'
    const result = await verifyThreadParticipant(mockClient as ReturnType<typeof createMockSupabaseClient>, 'thread-1', OTHER_UUID)
    expect(result).toBeNull()
  })

  it('should return null when thread is missing', async () => {
    const mockClient = createMockSupabaseClient()
    const qb = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
    }
    mockClient.from = vi.fn().mockReturnValue(qb)
    const result = await verifyThreadParticipant(mockClient as ReturnType<typeof createMockSupabaseClient>, 'thread-1', VALID_UUID_A)
    expect(result).toBeNull()
  })
})

describe('isBlocked', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should return true when A blocked B', async () => {
    const mockClient = createMockSupabaseClient()
    let callCount = 0
    const makeQb = (hasData: boolean) => {
      const qb = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: hasData ? { id: 'block-1' } : null, error: null }),
      }
      return qb
    }
    mockClient.from = vi.fn().mockImplementation(() => {
      callCount++
      return makeQb(callCount === 1) // first call (A blocks B) returns data
    })
    const result = await isBlocked(mockClient as ReturnType<typeof createMockSupabaseClient>, VALID_UUID_A, VALID_UUID_B)
    expect(result).toBe(true)
  })

  it('should return true when B blocked A', async () => {
    const mockClient = createMockSupabaseClient()
    let callCount = 0
    const makeQb = (hasData: boolean) => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: hasData ? { id: 'block-1' } : null, error: null }),
    })
    mockClient.from = vi.fn().mockImplementation(() => {
      callCount++
      return makeQb(callCount === 2) // second call (B blocks A) returns data
    })
    const result = await isBlocked(mockClient as ReturnType<typeof createMockSupabaseClient>, VALID_UUID_A, VALID_UUID_B)
    expect(result).toBe(true)
  })

  it('should return false when neither blocked', async () => {
    const mockClient = createMockSupabaseClient()
    const qb = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    }
    mockClient.from = vi.fn().mockReturnValue(qb)
    const result = await isBlocked(mockClient as ReturnType<typeof createMockSupabaseClient>, VALID_UUID_A, VALID_UUID_B)
    expect(result).toBe(false)
  })

  it('should check both directions', async () => {
    const mockClient = createMockSupabaseClient()
    const qb = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    }
    mockClient.from = vi.fn().mockReturnValue(qb)
    await isBlocked(mockClient as ReturnType<typeof createMockSupabaseClient>, VALID_UUID_A, VALID_UUID_B)
    expect(mockClient.from).toHaveBeenCalledTimes(2)
  })
})

describe('hasSubscriberRole', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should return true for a subscriber', async () => {
    const mockClient = createMockSupabaseClient()
    mockClient.rpc = vi.fn().mockResolvedValue({ data: true, error: null })
    const result = await hasSubscriberRole(mockClient as ReturnType<typeof createMockSupabaseClient>, VALID_UUID_A)
    expect(result).toBe(true)
  })

  it('should return false for a non-subscriber', async () => {
    const mockClient = createMockSupabaseClient()
    mockClient.rpc = vi.fn().mockResolvedValue({ data: false, error: null })
    const result = await hasSubscriberRole(mockClient as ReturnType<typeof createMockSupabaseClient>, VALID_UUID_A)
    expect(result).toBe(false)
  })

  it('should make the correct RPC call', async () => {
    const mockClient = createMockSupabaseClient()
    mockClient.rpc = vi.fn().mockResolvedValue({ data: true, error: null })
    await hasSubscriberRole(mockClient as ReturnType<typeof createMockSupabaseClient>, VALID_UUID_A)
    expect(mockClient.rpc).toHaveBeenCalledWith('user_has_role', { p_user_id: VALID_UUID_A, p_role_name: 'subscriber' })
  })

  it('should return false when rpc returns null', async () => {
    const mockClient = createMockSupabaseClient()
    mockClient.rpc = vi.fn().mockResolvedValue({ data: null, error: null })
    const result = await hasSubscriberRole(mockClient as ReturnType<typeof createMockSupabaseClient>, VALID_UUID_A)
    expect(result).toBe(false)
  })
})
