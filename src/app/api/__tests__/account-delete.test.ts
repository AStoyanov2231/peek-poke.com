import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMockSupabaseClient, createMockQueryBuilder } from '../../../../test/mocks/supabase'
import { createNextRequest } from '../../../../test/mocks/next'

vi.mock('next/headers', () => ({ headers: vi.fn(() => new Headers()), cookies: vi.fn() }))

// Both createClient (for auth/signOut) and createServiceClient (for the delete) are mocked
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
  createServiceClient: vi.fn(),
}))

import { POST } from '@/app/api/account/delete/route'
import * as supabaseServer from '@/lib/supabase/server'

let mockClient: ReturnType<typeof createMockSupabaseClient>
let mockServiceClient: ReturnType<typeof createMockSupabaseClient>

beforeEach(() => {
  vi.clearAllMocks()
  mockClient = createMockSupabaseClient()
  mockServiceClient = createMockSupabaseClient()
  vi.mocked(supabaseServer.createClient).mockResolvedValue(mockClient as never)
  vi.mocked(supabaseServer.createServiceClient).mockReturnValue(mockServiceClient as never)
})

describe('POST /api/account/delete', () => {
  it('soft-deletes account', async () => {
    mockClient.auth.getUser.mockResolvedValue({ data: { user: { id: 'user-123' } }, error: null })
    mockServiceClient.from.mockReturnValue(createMockQueryBuilder(null, null))

    const req = createNextRequest('http://localhost:3000/api/account/delete', { method: 'POST' })
    const res = await POST(req)
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.success).toBe(true)
  })

  it('signs out user after deletion', async () => {
    mockClient.auth.getUser.mockResolvedValue({ data: { user: { id: 'user-123' } }, error: null })
    mockServiceClient.from.mockReturnValue(createMockQueryBuilder(null, null))

    const req = createNextRequest('http://localhost:3000/api/account/delete', { method: 'POST' })
    await POST(req)

    expect(mockClient.auth.signOut).toHaveBeenCalled()
  })

  it('returns 500 on DB error', async () => {
    mockClient.auth.getUser.mockResolvedValue({ data: { user: { id: 'user-123' } }, error: null })
    mockServiceClient.from.mockReturnValue(createMockQueryBuilder(null, { message: 'DB error' }))

    const req = createNextRequest('http://localhost:3000/api/account/delete', { method: 'POST' })
    const res = await POST(req)
    const json = await res.json()

    expect(res.status).toBe(500)
    expect(json.error).toBeDefined()
  })

  it('uses service client (not regular client) for deletion', async () => {
    mockClient.auth.getUser.mockResolvedValue({ data: { user: { id: 'user-123' } }, error: null })
    mockServiceClient.from.mockReturnValue(createMockQueryBuilder(null, null))

    const req = createNextRequest('http://localhost:3000/api/account/delete', { method: 'POST' })
    await POST(req)

    // Service client used for the profile update
    expect(mockServiceClient.from).toHaveBeenCalledWith('profiles')
    // Regular client NOT used for profile update
    expect(mockClient.from).not.toHaveBeenCalledWith('profiles')
  })
})
