import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMockSupabaseClient, createMockQueryBuilder } from '../../../../test/mocks/supabase'
import { createNextRequest } from '../../../../test/mocks/next'
import { buildFriendship } from '../../../../test/helpers/factories'

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
  createServiceClient: vi.fn(),
}))

import { GET, POST } from '@/app/api/friends/route'
import { PATCH, DELETE } from '@/app/api/friends/[friendshipId]/route'
import * as supabaseServer from '@/lib/supabase/server'

const VALID_UUID = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'
const FRIENDSHIP_ID = 'b1eebc99-9c0b-4ef8-bb6d-6bb9bd380a22'

let mockClient: ReturnType<typeof createMockSupabaseClient>

beforeEach(() => {
  vi.clearAllMocks()
  mockClient = createMockSupabaseClient()
  vi.mocked(supabaseServer.createClient).mockResolvedValue(mockClient as never)
})

describe('GET /api/friends', () => {
  it('should return friends list', async () => {
    mockClient.auth.getUser.mockResolvedValue({ data: { user: { id: 'user-123' } }, error: null })
    const friends = [buildFriendship(), buildFriendship()]
    mockClient.rpc.mockResolvedValue({ data: friends, error: null })

    const req = createNextRequest('http://localhost:3000/api/friends')
    const res = await GET(req)

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(Array.isArray(body)).toBe(true)
    expect(body).toHaveLength(2)
  })

  it('should return 500 on DB error', async () => {
    mockClient.auth.getUser.mockResolvedValue({ data: { user: { id: 'user-123' } }, error: null })
    mockClient.rpc.mockResolvedValue({ data: null, error: { message: 'DB error' } })

    const req = createNextRequest('http://localhost:3000/api/friends')
    const res = await GET(req)

    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body).toHaveProperty('error')
  })
})

describe('POST /api/friends (send friend request)', () => {
  it('should send friend request with valid UUID', async () => {
    mockClient.auth.getUser.mockResolvedValue({ data: { user: { id: 'user-123' } }, error: null })
    mockClient.rpc.mockResolvedValue({ data: { success: true }, error: null })

    const req = createNextRequest('http://localhost:3000/api/friends', {
      method: 'POST',
      body: { addressee_id: VALID_UUID },
    })
    const res = await POST(req)

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toHaveProperty('success', true)
  })

  it('should return 400 for invalid UUID', async () => {
    mockClient.auth.getUser.mockResolvedValue({ data: { user: { id: 'user-123' } }, error: null })

    const req = createNextRequest('http://localhost:3000/api/friends', {
      method: 'POST',
      body: { addressee_id: 'not-a-uuid' },
    })
    const res = await POST(req)

    expect(res.status).toBe(400)
  })

  it('should return 400 for missing addressee_id', async () => {
    mockClient.auth.getUser.mockResolvedValue({ data: { user: { id: 'user-123' } }, error: null })

    const req = createNextRequest('http://localhost:3000/api/friends', {
      method: 'POST',
      body: {},
    })
    const res = await POST(req)

    expect(res.status).toBe(400)
  })

  it('should handle RPC error', async () => {
    mockClient.auth.getUser.mockResolvedValue({ data: { user: { id: 'user-123' } }, error: null })
    mockClient.rpc.mockResolvedValue({ data: null, error: { message: 'RPC error' } })

    const req = createNextRequest('http://localhost:3000/api/friends', {
      method: 'POST',
      body: { addressee_id: VALID_UUID },
    })
    const res = await POST(req)

    expect(res.status).toBe(500)
  })

  it('returns data.error response when RPC returns business logic error', async () => {
    mockClient.auth.getUser.mockResolvedValue({ data: { user: { id: 'user-123' } }, error: null })
    mockClient.rpc.mockResolvedValue({
      data: { error: 'Already friends', message: 'You are already friends', status: 400 },
      error: null,
    })

    const req = createNextRequest('http://localhost:3000/api/friends', {
      method: 'POST',
      body: { addressee_id: VALID_UUID },
    })
    const res = await POST(req)

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body).toHaveProperty('error', 'Already friends')
    expect(body).toHaveProperty('message', 'You are already friends')
  })
})

describe('PATCH /api/friends/[friendshipId] (accept/decline)', () => {
  it('should accept a friend request', async () => {
    mockClient.auth.getUser.mockResolvedValue({ data: { user: { id: 'user-123' } }, error: null })
    mockClient.rpc.mockResolvedValue({ data: { success: true }, error: null })

    const req = createNextRequest(`http://localhost:3000/api/friends/${FRIENDSHIP_ID}`, {
      method: 'PATCH',
      body: { status: 'accepted' },
    })
    const res = await PATCH(req, { params: Promise.resolve({ friendshipId: FRIENDSHIP_ID }) })

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toHaveProperty('success', true)
  })

  it('returns 400 for invalid friendshipId UUID', async () => {
    mockClient.auth.getUser.mockResolvedValue({ data: { user: { id: 'user-123' } }, error: null })

    const req = createNextRequest('http://localhost:3000/api/friends/not-a-uuid', {
      method: 'PATCH',
      body: { status: 'accepted' },
    })
    const res = await PATCH(req, { params: Promise.resolve({ friendshipId: 'not-a-uuid' }) })

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body).toHaveProperty('error')
  })

  it('sends declined action when status is not accepted', async () => {
    mockClient.auth.getUser.mockResolvedValue({ data: { user: { id: 'user-123' } }, error: null })
    mockClient.rpc.mockResolvedValue({ data: { success: true }, error: null })

    const req = createNextRequest(`http://localhost:3000/api/friends/${FRIENDSHIP_ID}`, {
      method: 'PATCH',
      body: { status: 'declined' },
    })
    const res = await PATCH(req, { params: Promise.resolve({ friendshipId: FRIENDSHIP_ID }) })

    expect(res.status).toBe(200)
    expect(mockClient.rpc).toHaveBeenCalledWith(
      'respond_friend_request',
      expect.objectContaining({ p_action: 'declined' })
    )
  })

  it('returns 500 on RPC error', async () => {
    mockClient.auth.getUser.mockResolvedValue({ data: { user: { id: 'user-123' } }, error: null })
    mockClient.rpc.mockResolvedValue({ data: null, error: { message: 'DB error' } })

    const req = createNextRequest(`http://localhost:3000/api/friends/${FRIENDSHIP_ID}`, {
      method: 'PATCH',
      body: { status: 'accepted' },
    })
    const res = await PATCH(req, { params: Promise.resolve({ friendshipId: FRIENDSHIP_ID }) })

    expect(res.status).toBe(500)
  })

  it('returns data.error response when RPC returns business logic error', async () => {
    mockClient.auth.getUser.mockResolvedValue({ data: { user: { id: 'user-123' } }, error: null })
    mockClient.rpc.mockResolvedValue({
      data: { error: 'Not your request', message: 'Cannot respond to this request', status: 400 },
      error: null,
    })

    const req = createNextRequest(`http://localhost:3000/api/friends/${FRIENDSHIP_ID}`, {
      method: 'PATCH',
      body: { status: 'accepted' },
    })
    const res = await PATCH(req, { params: Promise.resolve({ friendshipId: FRIENDSHIP_ID }) })

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body).toHaveProperty('error', 'Not your request')
  })
})

describe('DELETE /api/friends/[friendshipId] (unfriend)', () => {
  it('should remove friendship', async () => {
    mockClient.auth.getUser.mockResolvedValue({ data: { user: { id: 'user-123' } }, error: null })
    mockClient.rpc.mockResolvedValue({ data: { success: true, refunded: false, balance: null }, error: null })

    const req = createNextRequest(`http://localhost:3000/api/friends/${FRIENDSHIP_ID}`, {
      method: 'DELETE',
    })
    const res = await DELETE(req, { params: Promise.resolve({ friendshipId: FRIENDSHIP_ID }) })

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toHaveProperty('success', true)
  })

  it('returns 400 for invalid friendshipId UUID', async () => {
    mockClient.auth.getUser.mockResolvedValue({ data: { user: { id: 'user-123' } }, error: null })

    const req = createNextRequest('http://localhost:3000/api/friends/not-a-uuid', {
      method: 'DELETE',
    })
    const res = await DELETE(req, { params: Promise.resolve({ friendshipId: 'not-a-uuid' }) })

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body).toHaveProperty('error')
  })

  it('returns 500 on RPC error', async () => {
    mockClient.auth.getUser.mockResolvedValue({ data: { user: { id: 'user-123' } }, error: null })
    mockClient.rpc.mockResolvedValue({ data: null, error: { message: 'DB error' } })

    const req = createNextRequest(`http://localhost:3000/api/friends/${FRIENDSHIP_ID}`, {
      method: 'DELETE',
    })
    const res = await DELETE(req, { params: Promise.resolve({ friendshipId: FRIENDSHIP_ID }) })

    expect(res.status).toBe(500)
  })

  it('returns data.error response when RPC returns business logic error', async () => {
    mockClient.auth.getUser.mockResolvedValue({ data: { user: { id: 'user-123' } }, error: null })
    mockClient.rpc.mockResolvedValue({
      data: { error: 'Not friends', status: 400 },
      error: null,
    })

    const req = createNextRequest(`http://localhost:3000/api/friends/${FRIENDSHIP_ID}`, {
      method: 'DELETE',
    })
    const res = await DELETE(req, { params: Promise.resolve({ friendshipId: FRIENDSHIP_ID }) })

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body).toHaveProperty('error', 'Not friends')
  })

  it('returns refunded=true and balance when unfriend triggers refund', async () => {
    mockClient.auth.getUser.mockResolvedValue({ data: { user: { id: 'user-123' } }, error: null })
    mockClient.rpc.mockResolvedValue({
      data: { success: true, refunded: true, balance: 50 },
      error: null,
    })

    const req = createNextRequest(`http://localhost:3000/api/friends/${FRIENDSHIP_ID}`, {
      method: 'DELETE',
    })
    const res = await DELETE(req, { params: Promise.resolve({ friendshipId: FRIENDSHIP_ID }) })

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toHaveProperty('refunded', true)
    expect(body).toHaveProperty('balance', 50)
  })
})
