import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMockSupabaseClient, createMockQueryBuilder } from '../../../../test/mocks/supabase'
import { createNextRequest } from '../../../../test/mocks/next'
import { buildProfile } from '../../../../test/helpers/factories'

// Must be hoisted — vi.mock is always moved to top of file
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
  createServiceClient: vi.fn(),
}))

// Import after mock is set up
import { GET, PATCH } from '@/app/api/profile/route'
import * as supabaseServer from '@/lib/supabase/server'

let mockClient: ReturnType<typeof createMockSupabaseClient>

beforeEach(() => {
  vi.clearAllMocks()
  mockClient = createMockSupabaseClient()
  vi.mocked(supabaseServer.createClient).mockResolvedValue(mockClient as never)
})

describe('GET /api/profile', () => {
  it('should return profile with roles when authenticated', async () => {
    const profile = buildProfile({ id: 'user-123' })
    mockClient.auth.getUser.mockResolvedValue({ data: { user: { id: 'user-123' } }, error: null })
    mockClient.from.mockReturnValue(createMockQueryBuilder(profile))
    mockClient.rpc.mockResolvedValue({ data: ['user'], error: null })

    const req = createNextRequest('http://localhost:3000/api/profile')
    const res = await GET(req)

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toHaveProperty('profile')
    expect(body.profile).toHaveProperty('id', 'user-123')
    expect(body.profile).toHaveProperty('roles')
  })

  it('should return 401 when not authenticated', async () => {
    mockClient.auth.getUser.mockResolvedValue({ data: { user: null }, error: null })

    const req = createNextRequest('http://localhost:3000/api/profile')
    const res = await GET(req)

    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body).toHaveProperty('error', 'Unauthorized')
  })

  it('should return null profile when DB returns no data', async () => {
    mockClient.auth.getUser.mockResolvedValue({ data: { user: { id: 'user-123' } }, error: null })
    mockClient.from.mockReturnValue(createMockQueryBuilder(null))
    mockClient.rpc.mockResolvedValue({ data: ['user'], error: null })

    const req = createNextRequest('http://localhost:3000/api/profile')
    const res = await GET(req)

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.profile).toBeNull()
  })

  it('should fall back to ["user"] when roles RPC returns null', async () => {
    const profile = buildProfile({ id: 'user-123' })
    mockClient.auth.getUser.mockResolvedValue({ data: { user: { id: 'user-123' } }, error: null })
    mockClient.from.mockReturnValue(createMockQueryBuilder(profile))
    mockClient.rpc.mockResolvedValue({ data: null, error: null })

    const req = createNextRequest('http://localhost:3000/api/profile')
    const res = await GET(req)

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.profile.roles).toEqual(['user'])
  })
})

describe('PATCH /api/profile', () => {
  it('should update display_name successfully', async () => {
    const updatedProfile = buildProfile({ id: 'user-123', display_name: 'New Name' })
    mockClient.auth.getUser.mockResolvedValue({ data: { user: { id: 'user-123' } }, error: null })
    mockClient.from.mockReturnValue(createMockQueryBuilder(updatedProfile))
    mockClient.rpc.mockResolvedValue({ data: ['user'], error: null })

    const req = createNextRequest('http://localhost:3000/api/profile', {
      method: 'PATCH',
      body: { display_name: 'New Name' },
    })
    const res = await PATCH(req)

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.profile).toHaveProperty('display_name', 'New Name')
  })

  it('should reject invalid avatar_url', async () => {
    mockClient.auth.getUser.mockResolvedValue({ data: { user: { id: 'user-123' } }, error: null })

    const req = createNextRequest('http://localhost:3000/api/profile', {
      method: 'PATCH',
      body: { avatar_url: 'not-a-valid-url' },
    })
    const res = await PATCH(req)

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body).toHaveProperty('error')
  })

  it('should reject unknown fields (strict schema)', async () => {
    mockClient.auth.getUser.mockResolvedValue({ data: { user: { id: 'user-123' } }, error: null })

    const req = createNextRequest('http://localhost:3000/api/profile', {
      method: 'PATCH',
      body: { unknown_field: 'value' },
    })
    const res = await PATCH(req)

    expect(res.status).toBe(400)
  })

  it('should return 400 on bad JSON', async () => {
    mockClient.auth.getUser.mockResolvedValue({ data: { user: { id: 'user-123' } }, error: null })

    const { NextRequest } = await import('next/server')
    const nextReq = new NextRequest('http://localhost:3000/api/profile', {
      method: 'PATCH',
      body: 'not-json',
      headers: { 'content-type': 'application/json' },
    })
    const res = await PATCH(nextReq)

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body).toHaveProperty('error')
  })

  it('should return 500 on DB error', async () => {
    mockClient.auth.getUser.mockResolvedValue({ data: { user: { id: 'user-123' } }, error: null })
    const errorBuilder = createMockQueryBuilder(null, { message: 'DB error' })
    mockClient.from.mockReturnValue(errorBuilder)
    mockClient.rpc.mockResolvedValue({ data: ['user'], error: null })

    const req = createNextRequest('http://localhost:3000/api/profile', {
      method: 'PATCH',
      body: { display_name: 'Test' },
    })
    const res = await PATCH(req)

    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body).toHaveProperty('error')
  })

  it('should return 401 when not authenticated', async () => {
    mockClient.auth.getUser.mockResolvedValue({ data: { user: null }, error: null })

    const req = createNextRequest('http://localhost:3000/api/profile', {
      method: 'PATCH',
      body: { display_name: 'Test' },
    })
    const res = await PATCH(req)

    expect(res.status).toBe(401)
  })

  it('should fall back to ["user"] when roles RPC returns null', async () => {
    const updatedProfile = buildProfile({ id: 'user-123', display_name: 'New Name' })
    mockClient.auth.getUser.mockResolvedValue({ data: { user: { id: 'user-123' } }, error: null })
    mockClient.from.mockReturnValue(createMockQueryBuilder(updatedProfile))
    mockClient.rpc.mockResolvedValue({ data: null, error: null })

    const req = createNextRequest('http://localhost:3000/api/profile', {
      method: 'PATCH',
      body: { display_name: 'New Name' },
    })
    const res = await PATCH(req)

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.profile.roles).toEqual(['user'])
  })
})
