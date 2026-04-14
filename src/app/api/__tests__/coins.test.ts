import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMockSupabaseClient, createMockQueryBuilder } from '../../../../test/mocks/supabase'
import { createNextRequest } from '../../../../test/mocks/next'

vi.mock('next/headers', () => ({ headers: vi.fn(() => new Headers()), cookies: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn(), createServiceClient: vi.fn() }))

import { GET } from '@/app/api/coins/route'
import * as supabaseServer from '@/lib/supabase/server'

let mockClient: ReturnType<typeof createMockSupabaseClient>

beforeEach(() => {
  vi.clearAllMocks()
  mockClient = createMockSupabaseClient()
  vi.mocked(supabaseServer.createClient).mockResolvedValue(mockClient as never)
})

describe('GET /api/coins', () => {
  it('returns balance when authenticated', async () => {
    mockClient.auth.getUser.mockResolvedValue({ data: { user: { id: 'user-123' } }, error: null })
    mockClient.from.mockReturnValue(createMockQueryBuilder({ balance: 42 }, null))

    const req = createNextRequest('http://localhost:3000/api/coins')
    const res = await GET(req)
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.balance).toBe(42)
  })

  it('returns 500 on DB error', async () => {
    mockClient.auth.getUser.mockResolvedValue({ data: { user: { id: 'user-123' } }, error: null })
    mockClient.from.mockReturnValue(createMockQueryBuilder(null, { message: 'DB error' }))

    const req = createNextRequest('http://localhost:3000/api/coins')
    const res = await GET(req)
    const json = await res.json()

    expect(res.status).toBe(500)
    expect(json.error).toBeDefined()
  })

  it('returns 401 when not authenticated', async () => {
    mockClient.auth.getUser.mockResolvedValue({ data: { user: null }, error: null })

    const req = createNextRequest('http://localhost:3000/api/coins')
    const res = await GET(req)
    const json = await res.json()

    expect(res.status).toBe(401)
    expect(json.error).toBe('Unauthorized')
  })
})
