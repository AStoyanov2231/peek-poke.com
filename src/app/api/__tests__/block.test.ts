import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMockSupabaseClient, createMockQueryBuilder } from '../../../../test/mocks/supabase'
import { createNextRequest } from '../../../../test/mocks/next'

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
  createServiceClient: vi.fn(),
}))

import { POST, DELETE } from '@/app/api/users/[userId]/block/route'
import * as supabaseServer from '@/lib/supabase/server'

const VALID_UUID = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'
const ACTOR_ID = 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22'

let mockClient: ReturnType<typeof createMockSupabaseClient>

beforeEach(() => {
  vi.clearAllMocks()
  mockClient = createMockSupabaseClient()
  vi.mocked(supabaseServer.createClient).mockResolvedValue(mockClient as never)
})

describe('POST /api/users/[userId]/block', () => {
  it('returns 401 when unauthenticated', async () => {
    mockClient.auth.getUser.mockResolvedValue({ data: { user: null }, error: null })

    const req = createNextRequest(`http://localhost:3000/api/users/${VALID_UUID}/block`, { method: 'POST' })
    const res = await POST(req, { params: Promise.resolve({ userId: VALID_UUID }) })

    expect(res.status).toBe(401)
  })

  it('returns 400 for invalid userId UUID', async () => {
    mockClient.auth.getUser.mockResolvedValue({ data: { user: { id: ACTOR_ID } }, error: null })

    const req = createNextRequest('http://localhost:3000/api/users/not-a-uuid/block', { method: 'POST' })
    const res = await POST(req, { params: Promise.resolve({ userId: 'not-a-uuid' }) })

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body).toHaveProperty('error', 'Invalid user ID')
  })

  it('returns 500 on RPC error', async () => {
    mockClient.auth.getUser.mockResolvedValue({ data: { user: { id: ACTOR_ID } }, error: null })
    mockClient.rpc.mockResolvedValue({ data: null, error: { message: 'RPC error' } })

    const req = createNextRequest(`http://localhost:3000/api/users/${VALID_UUID}/block`, { method: 'POST' })
    const res = await POST(req, { params: Promise.resolve({ userId: VALID_UUID }) })

    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body).toHaveProperty('error')
  })

  it('returns 400 when data.error is present', async () => {
    mockClient.auth.getUser.mockResolvedValue({ data: { user: { id: ACTOR_ID } }, error: null })
    mockClient.rpc.mockResolvedValue({ data: { error: 'Cannot block yourself', status: 400 }, error: null })

    const req = createNextRequest(`http://localhost:3000/api/users/${VALID_UUID}/block`, { method: 'POST' })
    const res = await POST(req, { params: Promise.resolve({ userId: VALID_UUID }) })

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body).toHaveProperty('error', 'Cannot block yourself')
  })

  it('returns 200 on success', async () => {
    mockClient.auth.getUser.mockResolvedValue({ data: { user: { id: ACTOR_ID } }, error: null })
    mockClient.rpc.mockResolvedValue({ data: { success: true }, error: null })

    const req = createNextRequest(`http://localhost:3000/api/users/${VALID_UUID}/block`, { method: 'POST' })
    const res = await POST(req, { params: Promise.resolve({ userId: VALID_UUID }) })

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toHaveProperty('success', true)
  })
})

describe('DELETE /api/users/[userId]/block', () => {
  it('returns 401 when unauthenticated', async () => {
    mockClient.auth.getUser.mockResolvedValue({ data: { user: null }, error: null })

    const req = createNextRequest(`http://localhost:3000/api/users/${VALID_UUID}/block`, { method: 'DELETE' })
    const res = await DELETE(req, { params: Promise.resolve({ userId: VALID_UUID }) })

    expect(res.status).toBe(401)
  })

  it('returns 400 for invalid userId UUID', async () => {
    mockClient.auth.getUser.mockResolvedValue({ data: { user: { id: ACTOR_ID } }, error: null })

    const req = createNextRequest('http://localhost:3000/api/users/bad-id/block', { method: 'DELETE' })
    const res = await DELETE(req, { params: Promise.resolve({ userId: 'bad-id' }) })

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body).toHaveProperty('error', 'Invalid user ID')
  })

  it('returns 500 on DB error', async () => {
    mockClient.auth.getUser.mockResolvedValue({ data: { user: { id: ACTOR_ID } }, error: null })
    mockClient.from.mockReturnValueOnce(createMockQueryBuilder(null, { message: 'DB error' }))

    const req = createNextRequest(`http://localhost:3000/api/users/${VALID_UUID}/block`, { method: 'DELETE' })
    const res = await DELETE(req, { params: Promise.resolve({ userId: VALID_UUID }) })

    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body).toHaveProperty('error')
  })

  it('returns { success: true } on success', async () => {
    mockClient.auth.getUser.mockResolvedValue({ data: { user: { id: ACTOR_ID } }, error: null })
    mockClient.from.mockReturnValueOnce(createMockQueryBuilder(null))

    const req = createNextRequest(`http://localhost:3000/api/users/${VALID_UUID}/block`, { method: 'DELETE' })
    const res = await DELETE(req, { params: Promise.resolve({ userId: VALID_UUID }) })

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ success: true })
  })
})
