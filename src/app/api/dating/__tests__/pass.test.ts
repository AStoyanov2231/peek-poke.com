import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMockSupabaseClient } from '../../../../../test/mocks/supabase'
import { createNextRequest } from '../../../../../test/mocks/next'

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
  createServiceClient: vi.fn(),
}))

import { POST } from '@/app/api/dating/pass/route'
import * as supabaseServer from '@/lib/supabase/server'

const VALID_PASSEE_ID = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'
const USER_ID = 'b1eebc99-9c0b-4ef8-bb6d-6bb9bd380a22'

let mockClient: ReturnType<typeof createMockSupabaseClient>

beforeEach(() => {
  vi.clearAllMocks()
  mockClient = createMockSupabaseClient()
  vi.mocked(supabaseServer.createClient).mockResolvedValue(mockClient as never)
})

describe('POST /api/dating/pass', () => {
  it('returns 401 when unauthenticated', async () => {
    mockClient.auth.getUser.mockResolvedValue({ data: { user: null }, error: null })

    const req = createNextRequest('http://localhost:3000/api/dating/pass', {
      method: 'POST',
      body: { passee_id: VALID_PASSEE_ID },
    })
    const res = await POST(req)

    expect(res.status).toBe(401)
  })

  it('returns 400 for missing passee_id', async () => {
    mockClient.auth.getUser.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null })

    const req = createNextRequest('http://localhost:3000/api/dating/pass', {
      method: 'POST',
      body: {},
    })
    const res = await POST(req)

    expect(res.status).toBe(400)
  })

  it('returns 400 for invalid UUID passee_id', async () => {
    mockClient.auth.getUser.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null })

    const req = createNextRequest('http://localhost:3000/api/dating/pass', {
      method: 'POST',
      body: { passee_id: 'not-a-uuid' },
    })
    const res = await POST(req)

    expect(res.status).toBe(400)
  })

  it('returns 200 with passed=true on successful pass', async () => {
    mockClient.auth.getUser.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null })
    mockClient.rpc.mockResolvedValue({
      data: { passed: true, passes_remaining: 49 },
      error: null,
    })

    const req = createNextRequest('http://localhost:3000/api/dating/pass', {
      method: 'POST',
      body: { passee_id: VALID_PASSEE_ID },
    })
    const res = await POST(req)

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toMatchObject({ passed: true, dailyPassesRemaining: 49 })
  })

  it('returns 429 when RPC returns QUOTA_EXCEEDED', async () => {
    mockClient.auth.getUser.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null })
    mockClient.rpc.mockResolvedValue({
      data: { error: 'QUOTA_EXCEEDED', status: 429 },
      error: null,
    })

    const req = createNextRequest('http://localhost:3000/api/dating/pass', {
      method: 'POST',
      body: { passee_id: VALID_PASSEE_ID },
    })
    const res = await POST(req)

    expect(res.status).toBe(429)
    const body = await res.json()
    expect(body.code).toBe('QUOTA_EXCEEDED')
  })

  it('returns 500 on RPC transport error', async () => {
    mockClient.auth.getUser.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null })
    mockClient.rpc.mockResolvedValue({ data: null, error: { message: 'DB error' } })

    const req = createNextRequest('http://localhost:3000/api/dating/pass', {
      method: 'POST',
      body: { passee_id: VALID_PASSEE_ID },
    })
    const res = await POST(req)

    expect(res.status).toBe(500)
  })
})
