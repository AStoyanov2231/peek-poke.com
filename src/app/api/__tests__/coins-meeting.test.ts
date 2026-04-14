import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMockSupabaseClient } from '../../../../test/mocks/supabase'
import { createNextRequest } from '../../../../test/mocks/next'

vi.mock('next/headers', () => ({ headers: vi.fn(() => new Headers()), cookies: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn(), createServiceClient: vi.fn() }))

import { POST } from '@/app/api/coins/meeting/route'
import * as supabaseServer from '@/lib/supabase/server'

const VALID_FRIEND_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'

let mockClient: ReturnType<typeof createMockSupabaseClient>

beforeEach(() => {
  vi.clearAllMocks()
  mockClient = createMockSupabaseClient()
  vi.mocked(supabaseServer.createClient).mockResolvedValue(mockClient as never)
})

describe('POST /api/coins/meeting', () => {
  it('records meeting and awards coins', async () => {
    mockClient.auth.getUser.mockResolvedValue({ data: { user: { id: 'user-123' } }, error: null })
    mockClient.rpc.mockResolvedValue({
      data: { success: true, awarded: true, already_met: false, balance_a: 100 },
      error: null,
    })

    const req = createNextRequest('http://localhost:3000/api/coins/meeting', {
      method: 'POST',
      body: { friend_id: VALID_FRIEND_ID },
    })
    const res = await POST(req)
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.awarded).toBe(true)
    expect(json.already_met).toBe(false)
    expect(json.balance).toBe(100)
  })

  it('returns already_met response when previously met', async () => {
    mockClient.auth.getUser.mockResolvedValue({ data: { user: { id: 'user-123' } }, error: null })
    mockClient.rpc.mockResolvedValue({
      data: { success: true, awarded: false, already_met: true, balance_a: 100 },
      error: null,
    })

    const req = createNextRequest('http://localhost:3000/api/coins/meeting', {
      method: 'POST',
      body: { friend_id: VALID_FRIEND_ID },
    })
    const res = await POST(req)
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.already_met).toBe(true)
    expect(json.awarded).toBe(false)
  })

  it('returns 400 for missing friend_id', async () => {
    mockClient.auth.getUser.mockResolvedValue({ data: { user: { id: 'user-123' } }, error: null })

    const req = createNextRequest('http://localhost:3000/api/coins/meeting', {
      method: 'POST',
      body: {},
    })
    const res = await POST(req)
    const json = await res.json()

    expect(res.status).toBe(400)
    expect(json.error).toBeDefined()
  })

  it('returns 400 for invalid UUID friend_id', async () => {
    mockClient.auth.getUser.mockResolvedValue({ data: { user: { id: 'user-123' } }, error: null })

    const req = createNextRequest('http://localhost:3000/api/coins/meeting', {
      method: 'POST',
      body: { friend_id: 'not-a-uuid' },
    })
    const res = await POST(req)
    const json = await res.json()

    expect(res.status).toBe(400)
    expect(json.error).toBeDefined()
  })

  it('handles RPC error', async () => {
    mockClient.auth.getUser.mockResolvedValue({ data: { user: { id: 'user-123' } }, error: null })
    mockClient.rpc.mockResolvedValue({ data: null, error: { message: 'RPC error' } })

    const req = createNextRequest('http://localhost:3000/api/coins/meeting', {
      method: 'POST',
      body: { friend_id: VALID_FRIEND_ID },
    })
    const res = await POST(req)
    const json = await res.json()

    expect(res.status).toBe(500)
    expect(json.error).toBeDefined()
  })

  it('returns data.error response when RPC returns error in data', async () => {
    mockClient.auth.getUser.mockResolvedValue({ data: { user: { id: 'user-123' } }, error: null })
    mockClient.rpc.mockResolvedValue({
      data: { error: 'SELF_MEETING', message: 'Cannot meet yourself', status: 400 },
      error: null,
    })

    const req = createNextRequest('http://localhost:3000/api/coins/meeting', {
      method: 'POST',
      body: { friend_id: VALID_FRIEND_ID },
    })
    const res = await POST(req)
    const json = await res.json()

    expect(res.status).toBe(400)
    expect(json.error).toBe('SELF_MEETING')
  })

  it('returns 401 when not authenticated', async () => {
    mockClient.auth.getUser.mockResolvedValue({ data: { user: null }, error: null })

    const req = createNextRequest('http://localhost:3000/api/coins/meeting', {
      method: 'POST',
      body: { friend_id: VALID_FRIEND_ID },
    })
    const res = await POST(req)
    const json = await res.json()

    expect(res.status).toBe(401)
    expect(json.error).toBe('Unauthorized')
  })
})
