import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMockSupabaseClient, createMockQueryBuilder } from '../../../../test/mocks/supabase'
import { createNextRequest } from '../../../../test/mocks/next'

vi.mock('next/headers', () => ({ headers: vi.fn(() => new Headers()), cookies: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn(), createServiceClient: vi.fn() }))

import { GET, PUT } from '@/app/api/dating/preferences/route'
import * as supabaseServer from '@/lib/supabase/server'

let mockClient: ReturnType<typeof createMockSupabaseClient>

beforeEach(() => {
  vi.clearAllMocks()
  mockClient = createMockSupabaseClient()
  vi.mocked(supabaseServer.createClient).mockResolvedValue(mockClient as never)
})

const validPrefs = {
  interested_in: ['woman'],
  min_age: 22,
  max_age: 35,
  max_distance_km: 50,
  dealbreaker_smoking: false,
  dealbreaker_drinking: false,
  dealbreaker_kids: false,
  dealbreaker_relationship_goal: null,
  verified_only: false,
  women_only: false,
}

const storedPrefs = {
  user_id: 'user-123',
  ...validPrefs,
  updated_at: '2026-01-01T00:00:00.000Z',
}

// Profile with DOB that makes user 25 (over 18)
const adultProfile = { date_of_birth: '2001-01-01' }
// Profile with DOB that makes user 16 (under 18)
const minorProfile = { date_of_birth: '2010-01-01' }

describe('GET /api/dating/preferences', () => {
  it('returns { preferences: null } when no prefs exist', async () => {
    mockClient.auth.getUser.mockResolvedValue({ data: { user: { id: 'user-123' } }, error: null })
    mockClient.from.mockReturnValue(createMockQueryBuilder(null, null))

    const req = createNextRequest('http://localhost:3000/api/dating/preferences')
    const res = await GET(req)
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.preferences).toBeNull()
  })

  it('returns preferences object on success', async () => {
    mockClient.auth.getUser.mockResolvedValue({ data: { user: { id: 'user-123' } }, error: null })
    mockClient.from.mockReturnValue(createMockQueryBuilder(storedPrefs, null))

    const req = createNextRequest('http://localhost:3000/api/dating/preferences')
    const res = await GET(req)
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.preferences).toEqual(storedPrefs)
  })

  it('returns 401 when unauthenticated', async () => {
    mockClient.auth.getUser.mockResolvedValue({ data: { user: null }, error: null })

    const req = createNextRequest('http://localhost:3000/api/dating/preferences')
    const res = await GET(req)
    const json = await res.json()

    expect(res.status).toBe(401)
    expect(json.error).toBe('Unauthorized')
  })

  it('returns 500 on DB error', async () => {
    mockClient.auth.getUser.mockResolvedValue({ data: { user: { id: 'user-123' } }, error: null })
    mockClient.from.mockReturnValue(createMockQueryBuilder(null, { message: 'DB error' }))

    const req = createNextRequest('http://localhost:3000/api/dating/preferences')
    const res = await GET(req)
    const json = await res.json()

    expect(res.status).toBe(500)
    expect(json.error).toBeDefined()
  })
})

describe('PUT /api/dating/preferences', () => {
  it('saves prefs and returns them', async () => {
    mockClient.auth.getUser.mockResolvedValue({ data: { user: { id: 'user-123' } }, error: null })
    // First from() call: profiles age check; second: upsert
    mockClient.from
      .mockReturnValueOnce(createMockQueryBuilder(adultProfile, null))
      .mockReturnValueOnce(createMockQueryBuilder(storedPrefs, null))

    const req = createNextRequest('http://localhost:3000/api/dating/preferences', {
      method: 'PUT',
      body: validPrefs,
    })
    const res = await PUT(req)
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.preferences).toEqual(storedPrefs)
  })

  it('returns 400 on invalid data (min_age < 18)', async () => {
    mockClient.auth.getUser.mockResolvedValue({ data: { user: { id: 'user-123' } }, error: null })

    const req = createNextRequest('http://localhost:3000/api/dating/preferences', {
      method: 'PUT',
      body: { ...validPrefs, min_age: 16 },
    })
    const res = await PUT(req)
    const json = await res.json()

    expect(res.status).toBe(400)
    expect(json.error).toBeDefined()
  })

  it('returns 401 when unauthenticated', async () => {
    mockClient.auth.getUser.mockResolvedValue({ data: { user: null }, error: null })

    const req = createNextRequest('http://localhost:3000/api/dating/preferences', {
      method: 'PUT',
      body: validPrefs,
    })
    const res = await PUT(req)
    const json = await res.json()

    expect(res.status).toBe(401)
    expect(json.error).toBe('Unauthorized')
  })

  it('returns 403 when user is under 18', async () => {
    mockClient.auth.getUser.mockResolvedValue({ data: { user: { id: 'user-123' } }, error: null })
    // profiles query returns a minor
    mockClient.from.mockReturnValueOnce(createMockQueryBuilder(minorProfile, null))

    const req = createNextRequest('http://localhost:3000/api/dating/preferences', {
      method: 'PUT',
      body: validPrefs,
    })
    const res = await PUT(req)
    const json = await res.json()

    expect(res.status).toBe(403)
    expect(json.error).toBeDefined()
  })
})
