import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMockSupabaseClient, createMockQueryBuilder } from '../../../../test/mocks/supabase'

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
  createServiceClient: vi.fn(),
}))

import { GET } from '@/app/api/interests/route'
import * as supabaseServer from '@/lib/supabase/server'

let mockClient: ReturnType<typeof createMockSupabaseClient>

beforeEach(() => {
  vi.clearAllMocks()
  mockClient = createMockSupabaseClient()
  vi.mocked(supabaseServer.createClient).mockResolvedValue(mockClient as never)
})

describe('GET /api/interests', () => {
  it('returns 500 on DB error', async () => {
    mockClient.from.mockReturnValueOnce(createMockQueryBuilder(null, { message: 'DB error' }))

    const res = await GET()

    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body).toHaveProperty('error')
  })

  it('returns tags list', async () => {
    const tags = [
      { id: '1', name: 'Music', display_order: 1 },
      { id: '2', name: 'Sports', display_order: 2 },
    ]
    mockClient.from.mockReturnValueOnce(createMockQueryBuilder(tags))

    const res = await GET()

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.tags).toEqual(tags)
  })
})
