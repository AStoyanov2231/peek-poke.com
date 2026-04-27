import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMockSupabaseClient, createMockQueryBuilder } from '../../../../test/mocks/supabase'
import { createNextRequest } from '../../../../test/mocks/next'
import { MIN_DATING_PHOTOS } from '@/lib/constants'

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
  createServiceClient: vi.fn(),
}))

import { POST } from '@/app/api/profile/complete-dating-onboarding/route'
import * as supabaseServer from '@/lib/supabase/server'

let mockClient: ReturnType<typeof createMockSupabaseClient>

beforeEach(() => {
  vi.clearAllMocks()
  mockClient = createMockSupabaseClient()
  vi.mocked(supabaseServer.createClient).mockResolvedValue(mockClient as never)
})

function authUser(id = 'user-123') {
  mockClient.auth.getUser.mockResolvedValue({ data: { user: { id } }, error: null })
}

// Returns a count-style query builder (awaits to { data, error, count })
function createCountBuilder(count: number | null) {
  const b = createMockQueryBuilder(null)
  b.then = vi.fn((resolve: (v: unknown) => void) =>
    resolve({ data: null, error: null, count })
  )
  return b
}

const completeProfile = {
  onboarding_completed: true,
  date_of_birth: '2000-01-01', // 26 years old — clearly adult
  gender: 'woman',
  orientation: 'straight',
  relationship_goal: 'long_term',
}

function setupSuccessFlow() {
  authUser()
  // 1: profile select
  mockClient.from
    .mockReturnValueOnce(createMockQueryBuilder(completeProfile, null))
    // 2: profile_photos count (enough approved)
    .mockReturnValueOnce(createCountBuilder(MIN_DATING_PHOTOS))
    // 3: dating_preferences check
    .mockReturnValueOnce(createMockQueryBuilder({ user_id: 'user-123' }, null))
    // 4: profiles update
    .mockReturnValueOnce(createMockQueryBuilder(null, null))
}

describe('POST /api/profile/complete-dating-onboarding', () => {
  it('returns 401 when unauthenticated', async () => {
    mockClient.auth.getUser.mockResolvedValue({ data: { user: null }, error: null })

    const req = createNextRequest('http://localhost:3000/api/profile/complete-dating-onboarding', {
      method: 'POST',
    })
    const res = await POST(req)
    const body = await res.json()

    expect(res.status).toBe(401)
    expect(body.error).toBe('Unauthorized')
  })

  it('returns 400 ONBOARDING_NOT_COMPLETE when general onboarding is not done', async () => {
    authUser()
    mockClient.from.mockReturnValueOnce(
      createMockQueryBuilder({ ...completeProfile, onboarding_completed: false }, null)
    )

    const req = createNextRequest('http://localhost:3000/api/profile/complete-dating-onboarding', {
      method: 'POST',
    })
    const res = await POST(req)
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.error).toBe('ONBOARDING_NOT_COMPLETE')
  })

  it('returns 400 MISSING_DOB when date_of_birth is null', async () => {
    authUser()
    mockClient.from.mockReturnValueOnce(
      createMockQueryBuilder({ ...completeProfile, date_of_birth: null }, null)
    )

    const req = createNextRequest('http://localhost:3000/api/profile/complete-dating-onboarding', {
      method: 'POST',
    })
    const res = await POST(req)
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.error).toBe('MISSING_DOB')
  })

  it('returns 403 UNDERAGE when user is under 18', async () => {
    authUser()
    mockClient.from.mockReturnValueOnce(
      createMockQueryBuilder({ ...completeProfile, date_of_birth: '2020-01-01' }, null)
    )

    const req = createNextRequest('http://localhost:3000/api/profile/complete-dating-onboarding', {
      method: 'POST',
    })
    const res = await POST(req)
    const body = await res.json()

    expect(res.status).toBe(403)
    expect(body.error).toBe('UNDERAGE')
  })

  it('returns 400 MISSING_IDENTITY when gender is null', async () => {
    authUser()
    mockClient.from.mockReturnValueOnce(
      createMockQueryBuilder({ ...completeProfile, gender: null }, null)
    )

    const req = createNextRequest('http://localhost:3000/api/profile/complete-dating-onboarding', {
      method: 'POST',
    })
    const res = await POST(req)
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.error).toBe('MISSING_IDENTITY')
  })

  it('returns 400 MISSING_IDENTITY when orientation is null', async () => {
    authUser()
    mockClient.from.mockReturnValueOnce(
      createMockQueryBuilder({ ...completeProfile, orientation: null }, null)
    )

    const req = createNextRequest('http://localhost:3000/api/profile/complete-dating-onboarding', {
      method: 'POST',
    })
    const res = await POST(req)
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.error).toBe('MISSING_IDENTITY')
  })

  it('returns 400 MISSING_GOAL when relationship_goal is null', async () => {
    authUser()
    mockClient.from.mockReturnValueOnce(
      createMockQueryBuilder({ ...completeProfile, relationship_goal: null }, null)
    )

    const req = createNextRequest('http://localhost:3000/api/profile/complete-dating-onboarding', {
      method: 'POST',
    })
    const res = await POST(req)
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.error).toBe('MISSING_GOAL')
  })

  it('returns 400 INSUFFICIENT_PHOTOS when approved photos below minimum', async () => {
    authUser()
    mockClient.from
      .mockReturnValueOnce(createMockQueryBuilder(completeProfile, null))
      .mockReturnValueOnce(createCountBuilder(MIN_DATING_PHOTOS - 1))

    const req = createNextRequest('http://localhost:3000/api/profile/complete-dating-onboarding', {
      method: 'POST',
    })
    const res = await POST(req)
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.error).toBe('INSUFFICIENT_PHOTOS')
    expect(body.required).toBe(MIN_DATING_PHOTOS)
    expect(body.current).toBe(MIN_DATING_PHOTOS - 1)
  })

  it('returns 400 MISSING_PREFERENCES when dating_preferences row missing', async () => {
    authUser()
    mockClient.from
      .mockReturnValueOnce(createMockQueryBuilder(completeProfile, null))
      .mockReturnValueOnce(createCountBuilder(MIN_DATING_PHOTOS))
      .mockReturnValueOnce(createMockQueryBuilder(null, null)) // no prefs row

    const req = createNextRequest('http://localhost:3000/api/profile/complete-dating-onboarding', {
      method: 'POST',
    })
    const res = await POST(req)
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.error).toBe('MISSING_PREFERENCES')
  })

  it('returns 200 { success: true } on all checks passing', async () => {
    setupSuccessFlow()

    const req = createNextRequest('http://localhost:3000/api/profile/complete-dating-onboarding', {
      method: 'POST',
    })
    const res = await POST(req)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.success).toBe(true)
  })

  it('returns 500 when DB update fails', async () => {
    authUser()
    mockClient.from
      .mockReturnValueOnce(createMockQueryBuilder(completeProfile, null))
      .mockReturnValueOnce(createCountBuilder(MIN_DATING_PHOTOS))
      .mockReturnValueOnce(createMockQueryBuilder({ user_id: 'user-123' }, null))
      .mockReturnValueOnce(createMockQueryBuilder(null, { message: 'DB error' }))

    const req = createNextRequest('http://localhost:3000/api/profile/complete-dating-onboarding', {
      method: 'POST',
    })
    const res = await POST(req)
    const body = await res.json()

    expect(res.status).toBe(500)
    expect(body.error).toBeDefined()
  })
})
