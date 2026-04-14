import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMockSupabaseClient, createMockQueryBuilder } from '../../../../test/mocks/supabase'
import { createNextRequest } from '../../../../test/mocks/next'

const mockVerifyThreadParticipant = vi.hoisted(() => vi.fn(() => Promise.resolve(true)))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
  createServiceClient: vi.fn(),
}))

vi.mock('@/lib/auth', async () => {
  const actual = await vi.importActual<typeof import('@/lib/auth')>('@/lib/auth')
  return { ...actual, verifyThreadParticipant: mockVerifyThreadParticipant }
})

import { POST as deleteThread } from '@/app/api/dm/[threadId]/delete/route'
import { DELETE as clearMessages } from '@/app/api/dm/[threadId]/messages/route'
import * as supabaseServer from '@/lib/supabase/server'

const THREAD_ID = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'
const USER_ID = 'c2eebc99-9c0b-4ef8-bb6d-6bb9bd380a33'

function makeParams(threadId = THREAD_ID) {
  return { params: Promise.resolve({ threadId }) }
}

let mockClient: ReturnType<typeof createMockSupabaseClient>

beforeEach(() => {
  vi.clearAllMocks()
  mockVerifyThreadParticipant.mockResolvedValue(true)
  mockClient = createMockSupabaseClient()
  vi.mocked(supabaseServer.createClient).mockResolvedValue(mockClient as never)
})

describe('POST /api/dm/[threadId]/delete', () => {
  it('should return 401 when unauthenticated', async () => {
    mockClient.auth.getUser.mockResolvedValue({ data: { user: null }, error: null })

    const req = createNextRequest(`http://localhost:3000/api/dm/${THREAD_ID}/delete`, {
      method: 'POST',
    })
    const res = await deleteThread(req, makeParams())

    expect(res.status).toBe(401)
  })

  it('should return 400 for invalid thread ID UUID', async () => {
    mockClient.auth.getUser.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null })

    const req = createNextRequest('http://localhost:3000/api/dm/not-a-uuid/delete', {
      method: 'POST',
    })
    const res = await deleteThread(req, makeParams('not-a-uuid'))

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body).toHaveProperty('error')
  })

  it('should return 404 when user is not a thread participant', async () => {
    mockClient.auth.getUser.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null })
    mockVerifyThreadParticipant.mockResolvedValueOnce(false)

    const req = createNextRequest(`http://localhost:3000/api/dm/${THREAD_ID}/delete`, {
      method: 'POST',
    })
    const res = await deleteThread(req, makeParams())

    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.error).toMatch(/thread not found/i)
  })

  it('should return 500 when messages update fails', async () => {
    mockClient.auth.getUser.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null })
    mockClient.from.mockReturnValueOnce(createMockQueryBuilder(null, { message: 'DB error' }))

    const req = createNextRequest(`http://localhost:3000/api/dm/${THREAD_ID}/delete`, {
      method: 'POST',
    })
    const res = await deleteThread(req, makeParams())

    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body).toHaveProperty('error')
  })

  it('should return 500 when thread delete fails', async () => {
    mockClient.auth.getUser.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null })
    mockClient.from
      .mockReturnValueOnce(createMockQueryBuilder(null, null))
      .mockReturnValueOnce(createMockQueryBuilder(null, { message: 'DB error' }))

    const req = createNextRequest(`http://localhost:3000/api/dm/${THREAD_ID}/delete`, {
      method: 'POST',
    })
    const res = await deleteThread(req, makeParams())

    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body).toHaveProperty('error')
  })

  it('should return 200 with success on valid delete', async () => {
    mockClient.auth.getUser.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null })
    mockClient.from
      .mockReturnValueOnce(createMockQueryBuilder(null, null))
      .mockReturnValueOnce(createMockQueryBuilder(null, null))

    const req = createNextRequest(`http://localhost:3000/api/dm/${THREAD_ID}/delete`, {
      method: 'POST',
    })
    const res = await deleteThread(req, makeParams())

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ success: true })
  })
})

describe('DELETE /api/dm/[threadId]/messages', () => {
  it('should return 401 when unauthenticated', async () => {
    mockClient.auth.getUser.mockResolvedValue({ data: { user: null }, error: null })

    const req = createNextRequest(`http://localhost:3000/api/dm/${THREAD_ID}/messages`, {
      method: 'DELETE',
    })
    const res = await clearMessages(req, makeParams())

    expect(res.status).toBe(401)
  })

  it('should return 400 for invalid thread ID UUID', async () => {
    mockClient.auth.getUser.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null })

    const req = createNextRequest('http://localhost:3000/api/dm/not-a-uuid/messages', {
      method: 'DELETE',
    })
    const res = await clearMessages(req, makeParams('not-a-uuid'))

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body).toHaveProperty('error')
  })

  it('should return 404 when user is not a thread participant', async () => {
    mockClient.auth.getUser.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null })
    mockVerifyThreadParticipant.mockResolvedValueOnce(false)

    const req = createNextRequest(`http://localhost:3000/api/dm/${THREAD_ID}/messages`, {
      method: 'DELETE',
    })
    const res = await clearMessages(req, makeParams())

    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.error).toMatch(/thread not found/i)
  })

  it('should return 500 when messages soft-delete fails', async () => {
    mockClient.auth.getUser.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null })
    mockClient.from.mockReturnValueOnce(createMockQueryBuilder(null, { message: 'DB error' }))

    const req = createNextRequest(`http://localhost:3000/api/dm/${THREAD_ID}/messages`, {
      method: 'DELETE',
    })
    const res = await clearMessages(req, makeParams())

    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body).toHaveProperty('error')
  })

  it('should return 500 when thread metadata update fails', async () => {
    mockClient.auth.getUser.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null })
    mockClient.from
      .mockReturnValueOnce(createMockQueryBuilder(null, null))
      .mockReturnValueOnce(createMockQueryBuilder(null, { message: 'DB error' }))

    const req = createNextRequest(`http://localhost:3000/api/dm/${THREAD_ID}/messages`, {
      method: 'DELETE',
    })
    const res = await clearMessages(req, makeParams())

    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body).toHaveProperty('error')
  })

  it('should return 200 with success on valid clear', async () => {
    mockClient.auth.getUser.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null })
    mockClient.from
      .mockReturnValueOnce(createMockQueryBuilder(null, null))
      .mockReturnValueOnce(createMockQueryBuilder(null, null))

    const req = createNextRequest(`http://localhost:3000/api/dm/${THREAD_ID}/messages`, {
      method: 'DELETE',
    })
    const res = await clearMessages(req, makeParams())

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ success: true })
  })
})
