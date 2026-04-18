import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMockSupabaseClient, createMockQueryBuilder } from '../../../../test/mocks/supabase'
import { createNextRequest } from '../../../../test/mocks/next'

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
  createServiceClient: vi.fn(),
}))

import { POST } from '@/app/api/auth/profile/route'
import * as supabaseServer from '@/lib/supabase/server'

const USER_ID = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'
const mockUser = {
  id: USER_ID,
  user_metadata: { username: 'testuser', full_name: 'Test User', avatar_url: null },
}

let mockClient: ReturnType<typeof createMockSupabaseClient>

beforeEach(() => {
  vi.clearAllMocks()
  mockClient = createMockSupabaseClient()
  vi.mocked(supabaseServer.createClient).mockResolvedValue(mockClient as never)
})

describe('POST /api/auth/profile', () => {
  it('returns 401 when unauthenticated', async () => {
    mockClient.auth.getUser.mockResolvedValue({ data: { user: null }, error: null })

    const req = createNextRequest('http://localhost:3000/api/auth/profile', { method: 'POST' })
    const res = await POST(req)

    expect(res.status).toBe(401)
  })

  it('returns existing profile when already exists', async () => {
    mockClient.auth.getUser.mockResolvedValue({ data: { user: mockUser }, error: null })
    const existingProfile = { id: USER_ID, username: 'testuser', display_name: 'Test User' }
    mockClient.from.mockReturnValueOnce(createMockQueryBuilder(existingProfile))

    const req = createNextRequest('http://localhost:3000/api/auth/profile', { method: 'POST' })
    const res = await POST(req)

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.profile).toEqual(existingProfile)
  })

  it('creates new profile when none exists', async () => {
    mockClient.auth.getUser.mockResolvedValue({ data: { user: mockUser }, error: null })
    const createdProfile = { id: USER_ID, username: 'testuser', display_name: 'Test User', avatar_url: null }
    mockClient.from
      .mockReturnValueOnce(createMockQueryBuilder(null))           // 1st: select existing → null
      .mockReturnValueOnce(createMockQueryBuilder(createdProfile)) // 2nd: insert → success

    const req = createNextRequest('http://localhost:3000/api/auth/profile', { method: 'POST' })
    const res = await POST(req)

    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.profile).toEqual(createdProfile)
  })

  it('handles race condition — returns retry profile when insert fails with profile already created', async () => {
    mockClient.auth.getUser.mockResolvedValue({ data: { user: mockUser }, error: null })
    const retryProfile = { id: USER_ID, username: 'testuser', display_name: 'Test User' }
    mockClient.from
      .mockReturnValueOnce(createMockQueryBuilder(null))                              // 1st: select → null
      .mockReturnValueOnce(createMockQueryBuilder(null, { message: 'duplicate' }))   // 2nd: insert → error
      .mockReturnValueOnce(createMockQueryBuilder(retryProfile))                      // 3rd: retry select → found

    const req = createNextRequest('http://localhost:3000/api/auth/profile', { method: 'POST' })
    const res = await POST(req)

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.profile).toEqual(retryProfile)
  })

  it('generates username from user id when metadata.username is missing', async () => {
    const userId = USER_ID
    mockClient.auth.getUser.mockResolvedValue({
      data: { user: { id: userId, user_metadata: {} } },
      error: null,
    })
    const created = { id: userId, username: `user_${userId.slice(0, 8)}`, display_name: null, avatar_url: null }
    mockClient.from
      .mockReturnValueOnce(createMockQueryBuilder(null))
      .mockReturnValueOnce(createMockQueryBuilder(created))

    const req = createNextRequest('http://localhost:3000/api/auth/profile', { method: 'POST' })
    const res = await POST(req)

    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.profile.username).toBe(`user_${userId.slice(0, 8)}`)
  })

  it('uses metadata.name as display_name when full_name is absent', async () => {
    mockClient.auth.getUser.mockResolvedValue({
      data: { user: { id: USER_ID, user_metadata: { username: 'user1', name: 'Jane' } } },
      error: null,
    })
    const created = { id: USER_ID, username: 'user1', display_name: 'Jane', avatar_url: null }
    mockClient.from
      .mockReturnValueOnce(createMockQueryBuilder(null))
      .mockReturnValueOnce(createMockQueryBuilder(created))

    const req = createNextRequest('http://localhost:3000/api/auth/profile', { method: 'POST' })
    const res = await POST(req)

    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.profile.display_name).toBe('Jane')
  })

  it('stores avatar_url from metadata', async () => {
    mockClient.auth.getUser.mockResolvedValue({
      data: { user: { id: USER_ID, user_metadata: { username: 'user1', avatar_url: 'https://example.com/avatar.jpg' } } },
      error: null,
    })
    const created = { id: USER_ID, username: 'user1', display_name: null, avatar_url: 'https://example.com/avatar.jpg' }
    mockClient.from
      .mockReturnValueOnce(createMockQueryBuilder(null))
      .mockReturnValueOnce(createMockQueryBuilder(created))

    const req = createNextRequest('http://localhost:3000/api/auth/profile', { method: 'POST' })
    const res = await POST(req)

    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.profile.avatar_url).toBe('https://example.com/avatar.jpg')
  })

  it('returns 500 when insert fails and retry also fails', async () => {
    mockClient.auth.getUser.mockResolvedValue({ data: { user: mockUser }, error: null })
    mockClient.from
      .mockReturnValueOnce(createMockQueryBuilder(null))                              // 1st: select → null
      .mockReturnValueOnce(createMockQueryBuilder(null, { message: 'duplicate' }))   // 2nd: insert → error
      .mockReturnValueOnce(createMockQueryBuilder(null))                              // 3rd: retry select → null

    const req = createNextRequest('http://localhost:3000/api/auth/profile', { method: 'POST' })
    const res = await POST(req)

    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body).toHaveProperty('error')
  })
})
