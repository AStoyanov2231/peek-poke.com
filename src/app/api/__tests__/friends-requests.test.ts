import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMockSupabaseClient, createMockQueryBuilder } from '../../../../test/mocks/supabase'
import { createNextRequest } from '../../../../test/mocks/next'
import { buildFriendship } from '../../../../test/helpers/factories'

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
  createServiceClient: vi.fn(),
}))

import { GET } from '@/app/api/friends/requests/route'
import * as supabaseServer from '@/lib/supabase/server'

let mockClient: ReturnType<typeof createMockSupabaseClient>

beforeEach(() => {
  vi.clearAllMocks()
  mockClient = createMockSupabaseClient()
  vi.mocked(supabaseServer.createClient).mockResolvedValue(mockClient as never)
})

describe('GET /api/friends/requests', () => {
  it('returns 401 when not authenticated', async () => {
    mockClient.auth.getUser.mockResolvedValue({ data: { user: null }, error: null })

    const req = createNextRequest('http://localhost:3000/api/friends/requests')
    const res = await GET(req)

    expect(res.status).toBe(401)
  })

  it('returns empty arrays when no pending requests', async () => {
    mockClient.auth.getUser.mockResolvedValue({ data: { user: { id: 'user-123' } }, error: null })
    mockClient.from
      .mockReturnValueOnce(createMockQueryBuilder(null))
      .mockReturnValueOnce(createMockQueryBuilder(null))

    const req = createNextRequest('http://localhost:3000/api/friends/requests')
    const res = await GET(req)

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.requests).toEqual([])
    expect(body.sentRequests).toEqual([])
  })

  it('returns incoming and sent requests', async () => {
    mockClient.auth.getUser.mockResolvedValue({ data: { user: { id: 'user-123' } }, error: null })
    const incoming = [buildFriendship()]
    const sent = [buildFriendship()]
    mockClient.from
      .mockReturnValueOnce(createMockQueryBuilder(incoming))
      .mockReturnValueOnce(createMockQueryBuilder(sent))

    const req = createNextRequest('http://localhost:3000/api/friends/requests')
    const res = await GET(req)

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.requests).toHaveLength(1)
    expect(body.sentRequests).toHaveLength(1)
  })

  it('falls back to empty array when data is null', async () => {
    mockClient.auth.getUser.mockResolvedValue({ data: { user: { id: 'user-123' } }, error: null })
    mockClient.from
      .mockReturnValueOnce(createMockQueryBuilder(null))
      .mockReturnValueOnce(createMockQueryBuilder(null))

    const req = createNextRequest('http://localhost:3000/api/friends/requests')
    const res = await GET(req)

    expect(res.status).toBe(200)
    const body = await res.json()
    // Both || [] branches hit — null data falls back to empty arrays
    expect(body.requests).toEqual([])
    expect(body.sentRequests).toEqual([])
  })
})
