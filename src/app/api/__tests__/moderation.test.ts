import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMockSupabaseClient, createMockQueryBuilder } from '../../../../test/mocks/supabase'
import { createNextRequest } from '../../../../test/mocks/next'

vi.mock('next/headers', () => ({ headers: vi.fn(() => new Headers()), cookies: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn(), createServiceClient: vi.fn() }))

import { GET } from '@/app/api/moderation/photos/route'
import { PATCH } from '@/app/api/moderation/photos/[photoId]/route'
import * as supabaseServer from '@/lib/supabase/server'

const VALID_PHOTO_ID = 'b2c3d4e5-f6a7-8901-bcde-f12345678901'

let mockClient: ReturnType<typeof createMockSupabaseClient>

beforeEach(() => {
  vi.clearAllMocks()
  mockClient = createMockSupabaseClient()
  vi.mocked(supabaseServer.createClient).mockResolvedValue(mockClient as never)
})

describe('GET /api/moderation/photos', () => {
  it('returns pending queue for moderator', async () => {
    mockClient.auth.getUser.mockResolvedValue({ data: { user: { id: 'mod-123' } }, error: null })
    mockClient.rpc
      .mockResolvedValueOnce({ data: true, error: null })   // user_has_role moderator
      .mockResolvedValueOnce({ data: false, error: null })  // user_has_role admin
      .mockResolvedValueOnce({ data: { photos: [], total: 0 }, error: null }) // get_moderation_queue

    const req = createNextRequest('http://localhost:3000/api/moderation/photos', {
      searchParams: { status: 'pending' },
    })
    const res = await GET(req)

    expect(res.status).toBe(200)
  })

  it('returns 403 for non-moderator', async () => {
    mockClient.auth.getUser.mockResolvedValue({ data: { user: { id: 'regular-user' } }, error: null })
    // GET route delegates permission check to the RPC itself
    mockClient.rpc.mockResolvedValue({
      data: { error: 'Forbidden', status: 403 },
      error: null,
    })

    const req = createNextRequest('http://localhost:3000/api/moderation/photos')
    const res = await GET(req)
    const json = await res.json()

    expect(res.status).toBe(403)
    expect(json.error).toBe('Forbidden')
  })

  it('defaults to "pending" status filter', async () => {
    mockClient.auth.getUser.mockResolvedValue({ data: { user: { id: 'mod-123' } }, error: null })
    mockClient.rpc
      .mockResolvedValueOnce({ data: true, error: null })
      .mockResolvedValueOnce({ data: false, error: null })
      .mockResolvedValueOnce({ data: { photos: [], total: 0 }, error: null })

    // No status param -> defaults to "pending"
    const req = createNextRequest('http://localhost:3000/api/moderation/photos')
    await GET(req)

    const queueCall = mockClient.rpc.mock.calls.find(
      (c: unknown[]) => c[0] === 'get_moderation_queue'
    )
    expect(queueCall?.[1]).toMatchObject({ p_status: 'pending' })
  })

  it('returns 400 for invalid status param', async () => {
    mockClient.auth.getUser.mockResolvedValue({ data: { user: { id: 'mod-123' } }, error: null })
    mockClient.rpc
      .mockResolvedValueOnce({ data: true, error: null })
      .mockResolvedValueOnce({ data: false, error: null })

    const req = createNextRequest('http://localhost:3000/api/moderation/photos', {
      searchParams: { status: 'invalid_status' },
    })
    const res = await GET(req)
    const json = await res.json()

    expect(res.status).toBe(400)
    expect(json.error).toBeDefined()
  })
})

describe('PATCH /api/moderation/photos/[photoId]', () => {
  it('approves photo', async () => {
    mockClient.auth.getUser.mockResolvedValue({ data: { user: { id: 'mod-123' } }, error: null })
    mockClient.rpc
      .mockResolvedValueOnce({ data: true, error: null })
      .mockResolvedValueOnce({ data: false, error: null })
    mockClient.from.mockReturnValue(
      createMockQueryBuilder({ id: VALID_PHOTO_ID, approval_status: 'approved', user: { id: 'owner' } }, null)
    )

    const req = createNextRequest(`http://localhost:3000/api/moderation/photos/${VALID_PHOTO_ID}`, {
      method: 'PATCH',
      body: { action: 'approve' },
    })
    const res = await PATCH(req, { params: Promise.resolve({ photoId: VALID_PHOTO_ID }) })
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.photo.approval_status).toBe('approved')
  })

  it('rejects photo with reason', async () => {
    mockClient.auth.getUser.mockResolvedValue({ data: { user: { id: 'mod-123' } }, error: null })
    mockClient.rpc
      .mockResolvedValueOnce({ data: true, error: null })
      .mockResolvedValueOnce({ data: false, error: null })
    mockClient.from.mockReturnValue(
      createMockQueryBuilder(
        { id: VALID_PHOTO_ID, approval_status: 'rejected', rejection_reason: 'Inappropriate' },
        null
      )
    )

    const req = createNextRequest(`http://localhost:3000/api/moderation/photos/${VALID_PHOTO_ID}`, {
      method: 'PATCH',
      body: { action: 'reject', reason: 'Inappropriate' },
    })
    const res = await PATCH(req, { params: Promise.resolve({ photoId: VALID_PHOTO_ID }) })
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.photo.approval_status).toBe('rejected')
  })

  it('returns 400 for reject without reason', async () => {
    mockClient.auth.getUser.mockResolvedValue({ data: { user: { id: 'mod-123' } }, error: null })
    mockClient.rpc
      .mockResolvedValueOnce({ data: true, error: null })
      .mockResolvedValueOnce({ data: false, error: null })

    const req = createNextRequest(`http://localhost:3000/api/moderation/photos/${VALID_PHOTO_ID}`, {
      method: 'PATCH',
      body: { action: 'reject' },
    })
    const res = await PATCH(req, { params: Promise.resolve({ photoId: VALID_PHOTO_ID }) })
    const json = await res.json()

    expect(res.status).toBe(400)
    expect(json.error).toBeDefined()
  })

  it('returns 400 for invalid photo ID', async () => {
    mockClient.auth.getUser.mockResolvedValue({ data: { user: { id: 'mod-123' } }, error: null })
    mockClient.rpc
      .mockResolvedValueOnce({ data: true, error: null })
      .mockResolvedValueOnce({ data: false, error: null })

    const req = createNextRequest('/api/moderation/photos/not-a-uuid', {
      method: 'PATCH',
      body: { action: 'approve' },
    })
    const res = await PATCH(req, { params: Promise.resolve({ photoId: 'not-a-uuid' }) })
    const json = await res.json()

    expect(res.status).toBe(400)
    expect(json.error).toBe('Invalid photo ID')
  })
})
