import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMockSupabaseClient, createMockQueryBuilder } from '../../../../test/mocks/supabase'
import { createNextRequest } from '../../../../test/mocks/next'
import { buildDMMessage } from '../../../../test/helpers/factories'

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
  createServiceClient: vi.fn(),
}))

import { GET, POST } from '@/app/api/dm/[threadId]/route'
import { PATCH, DELETE } from '@/app/api/dm/[threadId]/[messageId]/route'
import * as supabaseServer from '@/lib/supabase/server'

const THREAD_ID = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'
const MESSAGE_ID = 'b1eebc99-9c0b-4ef8-bb6d-6bb9bd380a22'
const USER_ID = 'user-123'

function makeThreadParams() {
  return { params: Promise.resolve({ threadId: THREAD_ID }) }
}

function makeMessageParams() {
  return { params: Promise.resolve({ threadId: THREAD_ID, messageId: MESSAGE_ID }) }
}

let mockClient: ReturnType<typeof createMockSupabaseClient>

beforeEach(() => {
  vi.clearAllMocks()
  mockClient = createMockSupabaseClient()
  vi.mocked(supabaseServer.createClient).mockResolvedValue(mockClient as never)
})

describe('GET /api/dm/[threadId] (get conversation)', () => {
  it('should return conversation messages', async () => {
    mockClient.auth.getUser.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null })
    const messages = [buildDMMessage(), buildDMMessage()]
    mockClient.rpc.mockResolvedValue({ data: { messages, thread: {} }, error: null })

    const req = createNextRequest(`http://localhost:3000/api/dm/${THREAD_ID}`)
    const res = await GET(req, makeThreadParams())

    expect(res.status).toBe(200)
  })

  it('should return 400 for invalid thread ID', async () => {
    mockClient.auth.getUser.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null })

    const req = createNextRequest('http://localhost:3000/api/dm/not-a-uuid')
    const res = await GET(req, { params: Promise.resolve({ threadId: 'not-a-uuid' }) })

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body).toHaveProperty('error')
  })
})

describe('POST /api/dm/[threadId] (send message)', () => {
  it('should send text message', async () => {
    mockClient.auth.getUser.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null })
    const message = buildDMMessage({ sender_id: USER_ID, content: 'Hello!' })
    mockClient.rpc.mockResolvedValue({ data: message, error: null })

    const req = createNextRequest(`http://localhost:3000/api/dm/${THREAD_ID}`, {
      method: 'POST',
      body: { content: 'Hello!' },
    })
    const res = await POST(req, makeThreadParams())

    expect(res.status).toBe(200)
  })

  it('should return 400 for empty content', async () => {
    mockClient.auth.getUser.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null })

    const req = createNextRequest(`http://localhost:3000/api/dm/${THREAD_ID}`, {
      method: 'POST',
      body: { content: '' },
    })
    const res = await POST(req, makeThreadParams())

    expect(res.status).toBe(400)
  })

  it('should return 400 for content >4000 chars', async () => {
    mockClient.auth.getUser.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null })

    const req = createNextRequest(`http://localhost:3000/api/dm/${THREAD_ID}`, {
      method: 'POST',
      body: { content: 'a'.repeat(4001) },
    })
    const res = await POST(req, makeThreadParams())

    expect(res.status).toBe(400)
  })
})

describe('PATCH /api/dm/[threadId]/[messageId] (edit message)', () => {
  it('should edit own message within 15 min window', async () => {
    mockClient.auth.getUser.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null })

    const thread = { id: THREAD_ID, participant_1_id: USER_ID, participant_2_id: 'other-user' }
    const message = buildDMMessage({
      id: MESSAGE_ID,
      sender_id: USER_ID,
      thread_id: THREAD_ID,
      is_deleted: false,
      created_at: new Date().toISOString(),
    })
    const updatedMessage = { ...message, content: 'Edited!', is_edited: true }

    mockClient.from
      .mockReturnValueOnce(createMockQueryBuilder(thread))
      .mockReturnValueOnce(createMockQueryBuilder(message))
      .mockReturnValueOnce(createMockQueryBuilder(updatedMessage))

    const req = createNextRequest(`http://localhost:3000/api/dm/${THREAD_ID}/${MESSAGE_ID}`, {
      method: 'PATCH',
      body: { content: 'Edited!' },
    })
    const res = await PATCH(req, makeMessageParams())

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toHaveProperty('message')
  })

  it("should return 403 when editing another user's message", async () => {
    mockClient.auth.getUser.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null })

    const thread = { id: THREAD_ID, participant_1_id: USER_ID, participant_2_id: 'other-user' }
    const message = buildDMMessage({
      id: MESSAGE_ID,
      sender_id: 'other-user',
      thread_id: THREAD_ID,
      is_deleted: false,
      created_at: new Date().toISOString(),
    })

    mockClient.from
      .mockReturnValueOnce(createMockQueryBuilder(thread))
      .mockReturnValueOnce(createMockQueryBuilder(message))

    const req = createNextRequest(`http://localhost:3000/api/dm/${THREAD_ID}/${MESSAGE_ID}`, {
      method: 'PATCH',
      body: { content: 'Hacked!' },
    })
    const res = await PATCH(req, makeMessageParams())

    expect(res.status).toBe(403)
  })

  it('should return 400 when edit window expired (>15 min)', async () => {
    mockClient.auth.getUser.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null })

    const thread = { id: THREAD_ID, participant_1_id: USER_ID, participant_2_id: 'other-user' }
    const oldDate = new Date(Date.now() - 20 * 60 * 1000).toISOString()
    const message = buildDMMessage({
      id: MESSAGE_ID,
      sender_id: USER_ID,
      thread_id: THREAD_ID,
      is_deleted: false,
      created_at: oldDate,
    })

    mockClient.from
      .mockReturnValueOnce(createMockQueryBuilder(thread))
      .mockReturnValueOnce(createMockQueryBuilder(message))

    const req = createNextRequest(`http://localhost:3000/api/dm/${THREAD_ID}/${MESSAGE_ID}`, {
      method: 'PATCH',
      body: { content: 'Too late!' },
    })
    const res = await PATCH(req, makeMessageParams())

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/edit window expired/i)
  })

  it('should return 400 when message already deleted', async () => {
    mockClient.auth.getUser.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null })

    const thread = { id: THREAD_ID, participant_1_id: USER_ID, participant_2_id: 'other-user' }
    const message = buildDMMessage({
      id: MESSAGE_ID,
      sender_id: USER_ID,
      thread_id: THREAD_ID,
      is_deleted: true,
      created_at: new Date().toISOString(),
    })

    mockClient.from
      .mockReturnValueOnce(createMockQueryBuilder(thread))
      .mockReturnValueOnce(createMockQueryBuilder(message))

    const req = createNextRequest(`http://localhost:3000/api/dm/${THREAD_ID}/${MESSAGE_ID}`, {
      method: 'PATCH',
      body: { content: 'Edit deleted?' },
    })
    const res = await PATCH(req, makeMessageParams())

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/deleted/i)
  })
})

describe('DELETE /api/dm/[threadId]/[messageId] (delete message)', () => {
  it('should soft-delete own message', async () => {
    mockClient.auth.getUser.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null })

    const thread = { id: THREAD_ID, participant_1_id: USER_ID, participant_2_id: 'other-user' }
    const message = buildDMMessage({
      id: MESSAGE_ID,
      sender_id: USER_ID,
      thread_id: THREAD_ID,
      is_deleted: false,
    })
    const deletedMessage = { ...message, is_deleted: true, content: null }

    mockClient.from
      .mockReturnValueOnce(createMockQueryBuilder(thread))
      .mockReturnValueOnce(createMockQueryBuilder(message))
      .mockReturnValueOnce(createMockQueryBuilder(deletedMessage))

    const req = createNextRequest(`http://localhost:3000/api/dm/${THREAD_ID}/${MESSAGE_ID}`, {
      method: 'DELETE',
    })
    const res = await DELETE(req, makeMessageParams())

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toHaveProperty('message')
  })

  it("should return 403 when deleting another user's message", async () => {
    mockClient.auth.getUser.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null })

    const thread = { id: THREAD_ID, participant_1_id: USER_ID, participant_2_id: 'other-user' }
    const message = buildDMMessage({
      id: MESSAGE_ID,
      sender_id: 'other-user',
      thread_id: THREAD_ID,
      is_deleted: false,
    })

    mockClient.from
      .mockReturnValueOnce(createMockQueryBuilder(thread))
      .mockReturnValueOnce(createMockQueryBuilder(message))

    const req = createNextRequest(`http://localhost:3000/api/dm/${THREAD_ID}/${MESSAGE_ID}`, {
      method: 'DELETE',
    })
    const res = await DELETE(req, makeMessageParams())

    expect(res.status).toBe(403)
  })

  it('should return 400 for already deleted message', async () => {
    mockClient.auth.getUser.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null })

    const thread = { id: THREAD_ID, participant_1_id: USER_ID, participant_2_id: 'other-user' }
    const message = buildDMMessage({
      id: MESSAGE_ID,
      sender_id: USER_ID,
      thread_id: THREAD_ID,
      is_deleted: true,
    })

    mockClient.from
      .mockReturnValueOnce(createMockQueryBuilder(thread))
      .mockReturnValueOnce(createMockQueryBuilder(message))

    const req = createNextRequest(`http://localhost:3000/api/dm/${THREAD_ID}/${MESSAGE_ID}`, {
      method: 'DELETE',
    })
    const res = await DELETE(req, makeMessageParams())

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/already deleted/i)
  })
})

// ─── Additional branch coverage ─────────────────────────────────────────────

describe('GET /api/dm/[threadId] — missing branches', () => {
  it('should return 500 when RPC returns error', async () => {
    mockClient.auth.getUser.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null })
    mockClient.rpc.mockResolvedValue({ data: null, error: { message: 'db error' } })

    const req = createNextRequest(`http://localhost:3000/api/dm/${THREAD_ID}`)
    const res = await GET(req, makeThreadParams())

    expect(res.status).toBe(500)
  })

  it('should return 404 when RPC returns data.error', async () => {
    mockClient.auth.getUser.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null })
    mockClient.rpc.mockResolvedValue({ data: { error: 'Thread not found' }, error: null })

    const req = createNextRequest(`http://localhost:3000/api/dm/${THREAD_ID}`)
    const res = await GET(req, makeThreadParams())

    expect(res.status).toBe(404)
  })
})

describe('POST /api/dm/[threadId] — missing branches', () => {
  it('should return 400 for invalid thread ID', async () => {
    mockClient.auth.getUser.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null })

    const req = createNextRequest('http://localhost:3000/api/dm/not-a-uuid', {
      method: 'POST',
      body: { content: 'Hello!' },
    })
    const res = await POST(req, { params: Promise.resolve({ threadId: 'not-a-uuid' }) })

    expect(res.status).toBe(400)
  })

  it('should return 500 when RPC returns error', async () => {
    mockClient.auth.getUser.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null })
    mockClient.rpc.mockResolvedValue({ data: null, error: { message: 'db error' } })

    const req = createNextRequest(`http://localhost:3000/api/dm/${THREAD_ID}`, {
      method: 'POST',
      body: { content: 'Hello!' },
    })
    const res = await POST(req, makeThreadParams())

    expect(res.status).toBe(500)
  })

  it('should return 403 when RPC returns data.error', async () => {
    mockClient.auth.getUser.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null })
    mockClient.rpc.mockResolvedValue({ data: { error: 'Not a participant' }, error: null })

    const req = createNextRequest(`http://localhost:3000/api/dm/${THREAD_ID}`, {
      method: 'POST',
      body: { content: 'Hello!' },
    })
    const res = await POST(req, makeThreadParams())

    expect(res.status).toBe(403)
  })

  it('should send message with media_url present', async () => {
    mockClient.auth.getUser.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null })
    const VALID_MEDIA_URL = 'https://ttojvnwpnpuhkyjncwxn.supabase.co/storage/v1/object/public/media/img.png'
    const message = buildDMMessage({ sender_id: USER_ID, content: 'pic', media_url: VALID_MEDIA_URL })
    mockClient.rpc.mockResolvedValue({ data: message, error: null })

    const req = createNextRequest(`http://localhost:3000/api/dm/${THREAD_ID}`, {
      method: 'POST',
      body: { content: 'pic', media_url: VALID_MEDIA_URL },
    })
    const res = await POST(req, makeThreadParams())

    expect(res.status).toBe(200)
    // Verify media_url was forwarded (not collapsed to null)
    expect(mockClient.rpc).toHaveBeenCalledWith('send_message', expect.objectContaining({
      p_media_url: VALID_MEDIA_URL,
    }))
  })
})

describe('PATCH /api/dm/[threadId]/[messageId] — missing branches', () => {
  it('should return 400 for invalid thread or message ID', async () => {
    mockClient.auth.getUser.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null })

    const req = createNextRequest(`http://localhost:3000/api/dm/not-a-uuid/${MESSAGE_ID}`, {
      method: 'PATCH',
      body: { content: 'Hi' },
    })
    const res = await PATCH(req, { params: Promise.resolve({ threadId: 'not-a-uuid', messageId: MESSAGE_ID }) })

    expect(res.status).toBe(400)
  })

  it('should return 404 when not a thread participant', async () => {
    mockClient.auth.getUser.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null })
    // verifyThreadParticipant uses supabase.from("dm_threads").select().eq().single()
    // Returning null data causes it to return null (falsy)
    mockClient.from.mockReturnValueOnce(createMockQueryBuilder(null))

    const req = createNextRequest(`http://localhost:3000/api/dm/${THREAD_ID}/${MESSAGE_ID}`, {
      method: 'PATCH',
      body: { content: 'Hi' },
    })
    const res = await PATCH(req, makeMessageParams())

    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.error).toMatch(/thread not found/i)
  })

  it('should return 404 when message fetch returns error', async () => {
    mockClient.auth.getUser.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null })
    const thread = { id: THREAD_ID, participant_1_id: USER_ID, participant_2_id: 'other-user' }

    mockClient.from
      .mockReturnValueOnce(createMockQueryBuilder(thread))
      .mockReturnValueOnce(createMockQueryBuilder(null, { message: 'not found' }))

    const req = createNextRequest(`http://localhost:3000/api/dm/${THREAD_ID}/${MESSAGE_ID}`, {
      method: 'PATCH',
      body: { content: 'Hi' },
    })
    const res = await PATCH(req, makeMessageParams())

    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.error).toMatch(/message not found/i)
  })

  it('should return 404 when message is null (not found)', async () => {
    mockClient.auth.getUser.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null })
    const thread = { id: THREAD_ID, participant_1_id: USER_ID, participant_2_id: 'other-user' }

    mockClient.from
      .mockReturnValueOnce(createMockQueryBuilder(thread))
      .mockReturnValueOnce(createMockQueryBuilder(null, null))

    const req = createNextRequest(`http://localhost:3000/api/dm/${THREAD_ID}/${MESSAGE_ID}`, {
      method: 'PATCH',
      body: { content: 'Hi' },
    })
    const res = await PATCH(req, makeMessageParams())

    expect(res.status).toBe(404)
  })

  it('should return 500 when DB update fails', async () => {
    mockClient.auth.getUser.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null })
    const thread = { id: THREAD_ID, participant_1_id: USER_ID, participant_2_id: 'other-user' }
    const message = buildDMMessage({
      id: MESSAGE_ID,
      sender_id: USER_ID,
      thread_id: THREAD_ID,
      is_deleted: false,
      created_at: new Date().toISOString(),
    })

    mockClient.from
      .mockReturnValueOnce(createMockQueryBuilder(thread))
      .mockReturnValueOnce(createMockQueryBuilder(message))
      .mockReturnValueOnce(createMockQueryBuilder(null, { message: 'update failed' }))

    const req = createNextRequest(`http://localhost:3000/api/dm/${THREAD_ID}/${MESSAGE_ID}`, {
      method: 'PATCH',
      body: { content: 'Edited!' },
    })
    const res = await PATCH(req, makeMessageParams())

    expect(res.status).toBe(500)
  })
})

describe('DELETE /api/dm/[threadId]/[messageId] — missing branches', () => {
  it('should return 400 for invalid thread or message ID', async () => {
    mockClient.auth.getUser.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null })

    const req = createNextRequest(`http://localhost:3000/api/dm/not-a-uuid/${MESSAGE_ID}`, {
      method: 'DELETE',
    })
    const res = await DELETE(req, { params: Promise.resolve({ threadId: 'not-a-uuid', messageId: MESSAGE_ID }) })

    expect(res.status).toBe(400)
  })

  it('should return 404 when not a thread participant', async () => {
    mockClient.auth.getUser.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null })
    mockClient.from.mockReturnValueOnce(createMockQueryBuilder(null))

    const req = createNextRequest(`http://localhost:3000/api/dm/${THREAD_ID}/${MESSAGE_ID}`, {
      method: 'DELETE',
    })
    const res = await DELETE(req, makeMessageParams())

    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.error).toMatch(/thread not found/i)
  })

  it('should return 404 when message fetch returns error', async () => {
    mockClient.auth.getUser.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null })
    const thread = { id: THREAD_ID, participant_1_id: USER_ID, participant_2_id: 'other-user' }

    mockClient.from
      .mockReturnValueOnce(createMockQueryBuilder(thread))
      .mockReturnValueOnce(createMockQueryBuilder(null, { message: 'not found' }))

    const req = createNextRequest(`http://localhost:3000/api/dm/${THREAD_ID}/${MESSAGE_ID}`, {
      method: 'DELETE',
    })
    const res = await DELETE(req, makeMessageParams())

    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.error).toMatch(/message not found/i)
  })

  it('should return 500 when DB soft-delete update fails', async () => {
    mockClient.auth.getUser.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null })
    const thread = { id: THREAD_ID, participant_1_id: USER_ID, participant_2_id: 'other-user' }
    const message = buildDMMessage({
      id: MESSAGE_ID,
      sender_id: USER_ID,
      thread_id: THREAD_ID,
      is_deleted: false,
    })

    mockClient.from
      .mockReturnValueOnce(createMockQueryBuilder(thread))
      .mockReturnValueOnce(createMockQueryBuilder(message))
      .mockReturnValueOnce(createMockQueryBuilder(null, { message: 'update failed' }))

    const req = createNextRequest(`http://localhost:3000/api/dm/${THREAD_ID}/${MESSAGE_ID}`, {
      method: 'DELETE',
    })
    const res = await DELETE(req, makeMessageParams())

    expect(res.status).toBe(500)
  })
})
