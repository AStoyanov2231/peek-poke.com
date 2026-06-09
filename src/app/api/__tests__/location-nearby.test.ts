import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMockSupabaseClient, createMockQueryBuilder } from '../../../../test/mocks/supabase'
import { createNextRequest } from '../../../../test/mocks/next'

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
  createServiceClient: vi.fn(),
}))

import { POST as locationPost } from '@/app/api/location/route'
import { POST as nearbyPost } from '@/app/api/nearby/route'
import * as supabaseServer from '@/lib/supabase/server'

const USER_ID = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'

let mockClient: ReturnType<typeof createMockSupabaseClient>

beforeEach(() => {
  vi.clearAllMocks()
  mockClient = createMockSupabaseClient()
  vi.mocked(supabaseServer.createClient).mockResolvedValue(mockClient as never)
})

// ─── POST /api/location ───────────────────────────────────────────────────────

describe('POST /api/location', () => {
  it('returns 401 when unauthenticated', async () => {
    mockClient.auth.getUser.mockResolvedValue({ data: { user: null }, error: null })

    const req = createNextRequest('http://localhost:3000/api/location', {
      method: 'POST',
      body: { lat: 51.5, lng: -0.1 },
    })
    const res = await locationPost(req)

    expect(res.status).toBe(401)
  })

  it('returns 400 for missing lat/lng', async () => {
    mockClient.auth.getUser.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null })

    const req = createNextRequest('http://localhost:3000/api/location', {
      method: 'POST',
      body: {},
    })
    const res = await locationPost(req)

    expect(res.status).toBe(400)
  })

  it('returns 400 for out-of-range lat (>90)', async () => {
    mockClient.auth.getUser.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null })

    const req = createNextRequest('http://localhost:3000/api/location', {
      method: 'POST',
      body: { lat: 100, lng: 0 },
    })
    const res = await locationPost(req)

    expect(res.status).toBe(400)
  })

  it('returns 400 for out-of-range lng (<-180)', async () => {
    mockClient.auth.getUser.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null })

    const req = createNextRequest('http://localhost:3000/api/location', {
      method: 'POST',
      body: { lat: 0, lng: -200 },
    })
    const res = await locationPost(req)

    expect(res.status).toBe(400)
  })

  it('returns 500 on DB upsert error', async () => {
    mockClient.auth.getUser.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null })
    mockClient.from.mockReturnValueOnce(createMockQueryBuilder(null, { message: 'upsert error' }))

    const req = createNextRequest('http://localhost:3000/api/location', {
      method: 'POST',
      body: { lat: 51.5, lng: -0.1 },
    })
    const res = await locationPost(req)

    expect(res.status).toBe(500)
  })

  it('returns 200 on success', async () => {
    mockClient.auth.getUser.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null })
    mockClient.from.mockReturnValueOnce(createMockQueryBuilder(null, null))

    const req = createNextRequest('http://localhost:3000/api/location', {
      method: 'POST',
      body: { lat: 51.5, lng: -0.1 },
    })
    const res = await locationPost(req)

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ ok: true })
  })
})

// ─── POST /api/nearby ─────────────────────────────────────────────────────────

describe('POST /api/nearby', () => {
  it('returns 401 when unauthenticated', async () => {
    mockClient.auth.getUser.mockResolvedValue({ data: { user: null }, error: null })

    const req = createNextRequest('http://localhost:3000/api/nearby', {
      method: 'POST',
      body: { lat: 51.5, lng: -0.1 },
    })
    const res = await nearbyPost(req)

    expect(res.status).toBe(401)
  })

  it('returns 400 for missing coordinates', async () => {
    mockClient.auth.getUser.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null })

    const req = createNextRequest('http://localhost:3000/api/nearby', {
      method: 'POST',
      body: { lat: 51.5 },
    })
    const res = await nearbyPost(req)

    expect(res.status).toBe(400)
  })

  it('returns 400 for out-of-range lat (<-90)', async () => {
    mockClient.auth.getUser.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null })

    const req = createNextRequest('http://localhost:3000/api/nearby', {
      method: 'POST',
      body: { lat: -91, lng: 0 },
    })
    const res = await nearbyPost(req)

    expect(res.status).toBe(400)
  })

  it('returns 500 on RPC error', async () => {
    mockClient.auth.getUser.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null })
    mockClient.rpc.mockResolvedValue({ data: null, error: { message: 'rpc error' } })

    const req = createNextRequest('http://localhost:3000/api/nearby', {
      method: 'POST',
      body: { lat: 51.5, lng: -0.1 },
    })
    const res = await nearbyPost(req)

    expect(res.status).toBe(500)
  })

  it('returns users array on success', async () => {
    mockClient.auth.getUser.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null })
    mockClient.rpc.mockResolvedValue({
      data: [
        { user_id: 'other-user', username: 'alice', display_name: 'Alice', avatar_url: null, lat: 51.5001, lng: -0.1001 },
      ],
      error: null,
    })

    const req = createNextRequest('http://localhost:3000/api/nearby', {
      method: 'POST',
      body: { lat: 51.5, lng: -0.1 },
    })
    const res = await nearbyPost(req)

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.users).toHaveLength(1)
    expect(body.users[0].username).toBe('alice')
    // Confirm coordinates are truncated to 3 decimal places
    expect(body.users[0].lat).toBe(51.5)
    expect(body.users[0].lng).toBe(-0.1)
  })

  it('returns empty users array when RPC returns null', async () => {
    mockClient.auth.getUser.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null })
    mockClient.rpc.mockResolvedValue({ data: null, error: null })

    const req = createNextRequest('http://localhost:3000/api/nearby', {
      method: 'POST',
      body: { lat: 51.5, lng: -0.1 },
    })
    const res = await nearbyPost(req)

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.users).toEqual([])
  })
})
