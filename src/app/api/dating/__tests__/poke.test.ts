import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMockSupabaseClient, createMockQueryBuilder } from '../../../../../test/mocks/supabase'
import { createNextRequest } from '../../../../../test/mocks/next'
import { buildMatch } from '../../../../../test/helpers/factories'

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
  createServiceClient: vi.fn(),
}))

import { POST } from '@/app/api/dating/poke/route'
import * as supabaseServer from '@/lib/supabase/server'

const VALID_POKEE_ID = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'
const USER_ID = 'b1eebc99-9c0b-4ef8-bb6d-6bb9bd380a22'

let mockClient: ReturnType<typeof createMockSupabaseClient>

beforeEach(() => {
  vi.clearAllMocks()
  mockClient = createMockSupabaseClient()
  vi.mocked(supabaseServer.createClient).mockResolvedValue(mockClient as never)
})

describe('POST /api/dating/poke', () => {
  it('returns 401 when unauthenticated', async () => {
    mockClient.auth.getUser.mockResolvedValue({ data: { user: null }, error: null })

    const req = createNextRequest('http://localhost:3000/api/dating/poke', {
      method: 'POST',
      body: { pokee_id: VALID_POKEE_ID },
    })
    const res = await POST(req)

    expect(res.status).toBe(401)
  })

  it('returns 400 for missing pokee_id', async () => {
    mockClient.auth.getUser.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null })

    const req = createNextRequest('http://localhost:3000/api/dating/poke', {
      method: 'POST',
      body: {},
    })
    const res = await POST(req)

    expect(res.status).toBe(400)
  })

  it('returns 400 for invalid UUID pokee_id', async () => {
    mockClient.auth.getUser.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null })

    const req = createNextRequest('http://localhost:3000/api/dating/poke', {
      method: 'POST',
      body: { pokee_id: 'not-a-uuid' },
    })
    const res = await POST(req)

    expect(res.status).toBe(400)
  })

  it('returns 200 with poked=true and match=null for successful poke with no mutual', async () => {
    mockClient.auth.getUser.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null })
    mockClient.rpc.mockResolvedValue({
      data: { poked: true, match: null, pokes_remaining: 9 },
      error: null,
    })

    const req = createNextRequest('http://localhost:3000/api/dating/poke', {
      method: 'POST',
      body: { pokee_id: VALID_POKEE_ID },
    })
    const res = await POST(req)

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toMatchObject({ poked: true, match: null, dailyPokesRemaining: 9 })
  })

  it('returns 200 with match object on mutual poke', async () => {
    const match = buildMatch({ user_1_id: USER_ID, user_2_id: VALID_POKEE_ID, thread_id: 'thread-1' })
    mockClient.auth.getUser.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null })
    mockClient.rpc.mockResolvedValue({
      data: { poked: true, match, pokes_remaining: 8 },
      error: null,
    })

    const req = createNextRequest('http://localhost:3000/api/dating/poke', {
      method: 'POST',
      body: { pokee_id: VALID_POKEE_ID },
    })
    const res = await POST(req)

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.poked).toBe(true)
    expect(body.match).not.toBeNull()
    expect(body.match.id).toBe(match.id)
  })

  it('returns 429 when RPC returns QUOTA_EXCEEDED', async () => {
    mockClient.auth.getUser.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null })
    mockClient.rpc.mockResolvedValue({
      data: { error: 'QUOTA_EXCEEDED', status: 429 },
      error: null,
    })

    const req = createNextRequest('http://localhost:3000/api/dating/poke', {
      method: 'POST',
      body: { pokee_id: VALID_POKEE_ID },
    })
    const res = await POST(req)

    expect(res.status).toBe(429)
    const body = await res.json()
    expect(body.code).toBe('QUOTA_EXCEEDED')
  })

  it('returns 409 when RPC returns ALREADY_POKED', async () => {
    mockClient.auth.getUser.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null })
    mockClient.rpc.mockResolvedValue({
      data: { error: 'ALREADY_POKED', status: 409 },
      error: null,
    })

    const req = createNextRequest('http://localhost:3000/api/dating/poke', {
      method: 'POST',
      body: { pokee_id: VALID_POKEE_ID },
    })
    const res = await POST(req)

    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.code).toBe('ALREADY_POKED')
  })

  it('returns 500 on RPC transport error', async () => {
    mockClient.auth.getUser.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null })
    mockClient.rpc.mockResolvedValue({ data: null, error: { message: 'DB error' } })

    const req = createNextRequest('http://localhost:3000/api/dating/poke', {
      method: 'POST',
      body: { pokee_id: VALID_POKEE_ID },
    })
    const res = await POST(req)

    expect(res.status).toBe(500)
  })

  it('returns 402 for super poke when coins are insufficient', async () => {
    mockClient.auth.getUser.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null })
    // Mock the coins query builder for .from("user_coins")
    const coinBuilder = createMockQueryBuilder({ balance: 5 }, null)
    mockClient.from.mockReturnValue(coinBuilder)

    const req = createNextRequest('http://localhost:3000/api/dating/poke', {
      method: 'POST',
      body: { pokee_id: VALID_POKEE_ID, is_super: true },
    })
    const res = await POST(req)

    expect(res.status).toBe(402)
    const body = await res.json()
    expect(body.code).toBe('INSUFFICIENT_COINS')
  })
})
