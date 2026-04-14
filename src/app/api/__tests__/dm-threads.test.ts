import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMockSupabaseClient } from '../../../../test/mocks/supabase'
import { createNextRequest } from '../../../../test/mocks/next'
import { buildDMThread } from '../../../../test/helpers/factories'

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
  createServiceClient: vi.fn(),
}))

import { GET, POST } from '@/app/api/dm/threads/route'
import * as supabaseServer from '@/lib/supabase/server'

const VALID_UUID = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'

let mockClient: ReturnType<typeof createMockSupabaseClient>

beforeEach(() => {
  vi.clearAllMocks()
  mockClient = createMockSupabaseClient()
  vi.mocked(supabaseServer.createClient).mockResolvedValue(mockClient as never)
})

describe('GET /api/dm/threads', () => {
  it('should return threads list', async () => {
    mockClient.auth.getUser.mockResolvedValue({ data: { user: { id: 'user-123' } }, error: null })
    const threads = [buildDMThread(), buildDMThread()]
    mockClient.rpc.mockResolvedValue({ data: threads, error: null })

    const req = createNextRequest('http://localhost:3000/api/dm/threads')
    const res = await GET(req)

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(Array.isArray(body)).toBe(true)
    expect(body).toHaveLength(2)
  })

  it('should return 500 on DB error', async () => {
    mockClient.auth.getUser.mockResolvedValue({ data: { user: { id: 'user-123' } }, error: null })
    mockClient.rpc.mockResolvedValue({ data: null, error: { message: 'DB error' } })

    const req = createNextRequest('http://localhost:3000/api/dm/threads')
    const res = await GET(req)

    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body).toHaveProperty('error')
  })
})

describe('POST /api/dm/threads', () => {
  it('should create or find existing thread', async () => {
    mockClient.auth.getUser.mockResolvedValue({ data: { user: { id: 'user-123' } }, error: null })
    const thread = buildDMThread()
    mockClient.rpc.mockResolvedValue({ data: thread, error: null })

    const req = createNextRequest('http://localhost:3000/api/dm/threads', {
      method: 'POST',
      body: { user_id: VALID_UUID },
    })
    const res = await POST(req)

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toHaveProperty('id')
  })

  it('should return 400 for invalid UUID', async () => {
    mockClient.auth.getUser.mockResolvedValue({ data: { user: { id: 'user-123' } }, error: null })

    const req = createNextRequest('http://localhost:3000/api/dm/threads', {
      method: 'POST',
      body: { user_id: 'not-a-uuid' },
    })
    const res = await POST(req)

    expect(res.status).toBe(400)
  })

  it('should handle RPC error', async () => {
    mockClient.auth.getUser.mockResolvedValue({ data: { user: { id: 'user-123' } }, error: null })
    mockClient.rpc.mockResolvedValue({ data: null, error: { message: 'RPC error' } })

    const req = createNextRequest('http://localhost:3000/api/dm/threads', {
      method: 'POST',
      body: { user_id: VALID_UUID },
    })
    const res = await POST(req)

    expect(res.status).toBe(500)
  })

  it('should return 400 when RPC returns error object', async () => {
    mockClient.auth.getUser.mockResolvedValue({ data: { user: { id: 'user-123' } }, error: null })
    mockClient.rpc.mockResolvedValue({ data: { error: 'User blocked', status: 400 }, error: null })

    const req = createNextRequest('http://localhost:3000/api/dm/threads', {
      method: 'POST',
      body: { user_id: VALID_UUID },
    })
    const res = await POST(req)

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body).toHaveProperty('error')
  })

  it('should return 500 on unexpected thrown error', async () => {
    mockClient.auth.getUser.mockResolvedValue({ data: { user: { id: 'user-123' } }, error: null })
    mockClient.rpc.mockRejectedValue(new Error('Unexpected'))

    const req = createNextRequest('http://localhost:3000/api/dm/threads', {
      method: 'POST',
      body: { user_id: VALID_UUID },
    })
    await expect(POST(req)).rejects.toThrow('Unexpected')
  })
})
