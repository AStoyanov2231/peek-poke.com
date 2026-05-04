import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMockSupabaseClient } from '../../../../../test/mocks/supabase'
import { createNextRequest } from '../../../../../test/mocks/next'

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
  createServiceClient: vi.fn(),
}))

import { GET } from '@/app/api/dating/matches/route'
import { POST } from '@/app/api/dating/matches/[matchId]/unmatch/route'
import * as supabaseServer from '@/lib/supabase/server'

const USER_ID = 'b1eebc99-9c0b-4ef8-bb6d-6bb9bd380a22'
const MATCH_ID = 'c2eebc99-9c0b-4ef8-bb6d-6bb9bd380a33'
const PARTNER_ID = 'd3eebc99-9c0b-4ef8-bb6d-6bb9bd380a44'

const mockMatchRow = {
  id: MATCH_ID,
  thread_id: 'e4eebc99-9c0b-4ef8-bb6d-6bb9bd380a55',
  matched_at: new Date(Date.now() - 3600000).toISOString(),
  expires_at: new Date(Date.now() + 68400000).toISOString(), // 19h from now
  partner_id: PARTNER_ID,
  partner_username: 'partner_user',
  partner_display_name: 'Partner User',
  partner_avatar_url: null,
}

let mockClient: ReturnType<typeof createMockSupabaseClient>

beforeEach(() => {
  vi.clearAllMocks()
  mockClient = createMockSupabaseClient()
  vi.mocked(supabaseServer.createClient).mockResolvedValue(mockClient as never)
})

describe('GET /api/dating/matches', () => {
  it('returns 401 when unauthenticated', async () => {
    mockClient.auth.getUser.mockResolvedValue({ data: { user: null }, error: null })

    const req = createNextRequest('http://localhost:3000/api/dating/matches')
    const res = await GET(req)

    expect(res.status).toBe(401)
  })

  it('returns 200 with mapped MatchWithPartner array', async () => {
    mockClient.auth.getUser.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null })
    mockClient.rpc.mockResolvedValue({ data: [mockMatchRow], error: null })

    const req = createNextRequest('http://localhost:3000/api/dating/matches')
    const res = await GET(req)

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.matches).toHaveLength(1)
    expect(body.matches[0]).toMatchObject({
      id: MATCH_ID,
      thread_id: mockMatchRow.thread_id,
      matched_at: mockMatchRow.matched_at,
      expires_at: mockMatchRow.expires_at,
      partner: {
        id: PARTNER_ID,
        username: 'partner_user',
        display_name: 'Partner User',
        avatar_url: null,
      },
    })
  })

  it('returns 200 with empty array when no matches', async () => {
    mockClient.auth.getUser.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null })
    mockClient.rpc.mockResolvedValue({ data: [], error: null })

    const req = createNextRequest('http://localhost:3000/api/dating/matches')
    const res = await GET(req)

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.matches).toEqual([])
  })

  it('returns 500 when RPC errors', async () => {
    mockClient.auth.getUser.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null })
    mockClient.rpc.mockResolvedValue({ data: null, error: { message: 'DB error' } })

    const req = createNextRequest('http://localhost:3000/api/dating/matches')
    const res = await GET(req)

    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.code).toBe('MATCHES_FETCH_FAILED')
  })
})

describe('POST /api/dating/matches/[matchId]/unmatch', () => {
  const routeCtx = { params: Promise.resolve({ matchId: MATCH_ID }) } as never

  it('returns 401 when unauthenticated', async () => {
    mockClient.auth.getUser.mockResolvedValue({ data: { user: null }, error: null })

    const req = createNextRequest(
      `http://localhost:3000/api/dating/matches/${MATCH_ID}/unmatch`,
      { method: 'POST' }
    )
    const res = await POST(req, routeCtx)

    expect(res.status).toBe(401)
  })

  it('returns 200 with success=true on valid unmatch', async () => {
    mockClient.auth.getUser.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null })
    mockClient.rpc.mockResolvedValue({ data: { success: true }, error: null })

    const req = createNextRequest(
      `http://localhost:3000/api/dating/matches/${MATCH_ID}/unmatch`,
      { method: 'POST' }
    )
    const res = await POST(req, routeCtx)

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)
  })

  it('returns 403 when RPC returns FORBIDDEN', async () => {
    mockClient.auth.getUser.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null })
    mockClient.rpc.mockResolvedValue({
      data: { error: 'FORBIDDEN', status: 403 },
      error: null,
    })

    const req = createNextRequest(
      `http://localhost:3000/api/dating/matches/${MATCH_ID}/unmatch`,
      { method: 'POST' }
    )
    const res = await POST(req, routeCtx)

    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body.code).toBe('FORBIDDEN')
  })

  it('returns 404 when RPC returns NOT_FOUND', async () => {
    mockClient.auth.getUser.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null })
    mockClient.rpc.mockResolvedValue({
      data: { error: 'NOT_FOUND', status: 404 },
      error: null,
    })

    const req = createNextRequest(
      `http://localhost:3000/api/dating/matches/${MATCH_ID}/unmatch`,
      { method: 'POST' }
    )
    const res = await POST(req, routeCtx)

    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.code).toBe('NOT_FOUND')
  })

  it('returns 500 on RPC transport error', async () => {
    mockClient.auth.getUser.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null })
    mockClient.rpc.mockResolvedValue({ data: null, error: { message: 'DB error' } })

    const req = createNextRequest(
      `http://localhost:3000/api/dating/matches/${MATCH_ID}/unmatch`,
      { method: 'POST' }
    )
    const res = await POST(req, routeCtx)

    expect(res.status).toBe(500)
  })
})
