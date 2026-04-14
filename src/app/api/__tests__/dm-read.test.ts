import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMockSupabaseClient, createMockQueryBuilder } from '../../../../test/mocks/supabase'
import { createNextRequest } from '../../../../test/mocks/next'

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
  createServiceClient: vi.fn(),
}))

import { POST } from '@/app/api/dm/[threadId]/read/route'
import * as supabaseServer from '@/lib/supabase/server'

const THREAD_ID = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'
const USER_ID = 'user-123'
const OTHER_USER = 'other-user-456'

function makeThreadParams() {
  return { params: Promise.resolve({ threadId: THREAD_ID }) }
}

let mockClient: ReturnType<typeof createMockSupabaseClient>

beforeEach(() => {
  vi.clearAllMocks()
  mockClient = createMockSupabaseClient()
  vi.mocked(supabaseServer.createClient).mockResolvedValue(mockClient as never)
})

describe('POST /api/dm/[threadId]/read', () => {
  it('should mark messages as read successfully', async () => {
    mockClient.auth.getUser.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null })

    const thread = { id: THREAD_ID, participant_1_id: USER_ID, participant_2_id: OTHER_USER }
    mockClient.from
      .mockReturnValueOnce(createMockQueryBuilder(thread))
      .mockReturnValueOnce(createMockQueryBuilder(null))

    const req = createNextRequest(`http://localhost:3000/api/dm/${THREAD_ID}/read`, {
      method: 'POST',
    })
    const res = await POST(req, makeThreadParams())

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toHaveProperty('success', true)
  })

  it('should return 400 for invalid thread ID', async () => {
    mockClient.auth.getUser.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null })

    const req = createNextRequest('http://localhost:3000/api/dm/not-a-uuid/read', {
      method: 'POST',
    })
    const res = await POST(req, { params: Promise.resolve({ threadId: 'not-a-uuid' }) })

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body).toHaveProperty('error')
  })

  it('should return 404 when user is not a participant', async () => {
    mockClient.auth.getUser.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null })

    // verifyThreadParticipant returns null — user not in thread
    mockClient.from.mockReturnValueOnce(createMockQueryBuilder(null))

    const req = createNextRequest(`http://localhost:3000/api/dm/${THREAD_ID}/read`, {
      method: 'POST',
    })
    const res = await POST(req, makeThreadParams())

    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body).toHaveProperty('error')
  })

  it("should only mark other sender's messages as read (not own)", async () => {
    mockClient.auth.getUser.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null })

    const thread = { id: THREAD_ID, participant_1_id: USER_ID, participant_2_id: OTHER_USER }
    const updateBuilder = createMockQueryBuilder(null)
    mockClient.from
      .mockReturnValueOnce(createMockQueryBuilder(thread))
      .mockReturnValueOnce(updateBuilder)

    const req = createNextRequest(`http://localhost:3000/api/dm/${THREAD_ID}/read`, {
      method: 'POST',
    })
    const res = await POST(req, makeThreadParams())

    expect(res.status).toBe(200)
    // Verify the update excluded the current user's own messages
    expect(updateBuilder.neq).toHaveBeenCalledWith('sender_id', USER_ID)
  })

  it('should return 500 on DB error during update', async () => {
    mockClient.auth.getUser.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null })

    const thread = { id: THREAD_ID, participant_1_id: USER_ID, participant_2_id: OTHER_USER }
    mockClient.from
      .mockReturnValueOnce(createMockQueryBuilder(thread))
      .mockReturnValueOnce(createMockQueryBuilder(null, { message: 'DB error' }))

    const req = createNextRequest(`http://localhost:3000/api/dm/${THREAD_ID}/read`, {
      method: 'POST',
    })
    const res = await POST(req, makeThreadParams())

    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body).toHaveProperty('error')
  })
})
