import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMockSupabaseClient } from '../../../../test/mocks/supabase'
import { createNextRequest } from '../../../../test/mocks/next'

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
  createServiceClient: vi.fn(),
}))

import { GET } from '@/app/api/preload/route'
import * as supabaseServer from '@/lib/supabase/server'

const USER_ID = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'

let mockClient: ReturnType<typeof createMockSupabaseClient>

beforeEach(() => {
  vi.clearAllMocks()
  mockClient = createMockSupabaseClient()
  vi.mocked(supabaseServer.createClient).mockResolvedValue(mockClient as never)
})

describe('GET /api/preload', () => {
  it('returns 401 when unauthenticated', async () => {
    mockClient.auth.getUser.mockResolvedValue({ data: { user: null }, error: null })

    const req = createNextRequest('http://localhost:3000/api/preload')
    const res = await GET(req)

    expect(res.status).toBe(401)
  })

  it('returns 500 when preload RPC fails', async () => {
    mockClient.auth.getUser.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null })
    mockClient.rpc
      .mockResolvedValueOnce({ data: null, error: { message: 'RPC error' } })  // get_preload fails
      .mockResolvedValueOnce({ data: null, error: null })                        // get_user_coins_data

    const req = createNextRequest('http://localhost:3000/api/preload')
    const res = await GET(req)

    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body).toHaveProperty('error', 'Failed to preload data')
  })

  it('returns 500 when preload data contains error field', async () => {
    mockClient.auth.getUser.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null })
    mockClient.rpc
      .mockResolvedValueOnce({ data: { error: 'some db error' }, error: null })  // get_preload has data.error
      .mockResolvedValueOnce({ data: null, error: null })                          // get_user_coins_data

    const req = createNextRequest('http://localhost:3000/api/preload')
    const res = await GET(req)

    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body).toHaveProperty('error', 'some db error')
  })

  it('merges coins data into response', async () => {
    mockClient.auth.getUser.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null })
    const coinsData = { balance: 100, metFriendIds: ['id1'] }
    mockClient.rpc
      .mockResolvedValueOnce({ data: { profile: { id: USER_ID } }, error: null })  // get_preload success
      .mockResolvedValueOnce({ data: coinsData, error: null })                       // get_user_coins_data success

    const req = createNextRequest('http://localhost:3000/api/preload')
    const res = await GET(req)

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.coins.balance).toBe(100)
    expect(body.coins.metFriendIds).toEqual(['id1'])
  })

  it('falls back to default coins when coins RPC returns null data', async () => {
    mockClient.auth.getUser.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null })
    mockClient.rpc
      .mockResolvedValueOnce({ data: { profile: { id: USER_ID } }, error: null })  // get_preload success
      .mockResolvedValueOnce({ data: null, error: null })                            // get_user_coins_data → null

    const req = createNextRequest('http://localhost:3000/api/preload')
    const res = await GET(req)

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.coins.balance).toBe(5)
    expect(body.coins.metFriendIds).toEqual([])
  })
})
