import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMockSupabaseClient } from '../../../../test/mocks/supabase'
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

// ─── POST /api/dm/[threadId]/delete ─────────────────────────────────────────

describe('POST /api/dm/[threadId]/delete', () => {
  it('should return 401 when unauthenticated', async () => {
    mockClient.auth.getUser.mockResolvedValue({ data: { user: null }, error: null })

    const req = createNextRequest(`http://localhost:3000/api/dm/${THREAD_ID}/delete`, { method: 'POST' })
    const res = await deleteThread(req, makeParams())

    expect(res.status).toBe(401)
  })

  it('should return 400 for invalid thread ID UUID', async () => {
    mockClient.auth.getUser.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null })

    const req = createNextRequest('http://localhost:3000/api/dm/not-a-uuid/delete', { method: 'POST' })
    const res = await deleteThread(req, makeParams('not-a-uuid'))

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body).toHaveProperty('error')
  })

  it('should return 404 when user is not a thread participant', async () => {
    mockClient.auth.getUser.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null })
    mockVerifyThreadParticipant.mockResolvedValueOnce(false)

    const req = createNextRequest(`http://localhost:3000/api/dm/${THREAD_ID}/delete`, { method: 'POST' })
    const res = await deleteThread(req, makeParams())

    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.error).toMatch(/thread not found/i)
  })

  it('should return 500 when RPC errors', async () => {
    mockClient.auth.getUser.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null })
    mockClient.rpc.mockResolvedValue({ data: null, error: { message: 'DB error' } })

    const req = createNextRequest(`http://localhost:3000/api/dm/${THREAD_ID}/delete`, { method: 'POST' })
    const res = await deleteThread(req, makeParams())

    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body).toHaveProperty('error')
  })

  it('should return 400 when RPC returns data.error', async () => {
    mockClient.auth.getUser.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null })
    mockClient.rpc.mockResolvedValue({ data: { error: 'Thread not found', status: 404 }, error: null })

    const req = createNextRequest(`http://localhost:3000/api/dm/${THREAD_ID}/delete`, { method: 'POST' })
    const res = await deleteThread(req, makeParams())

    expect(res.status).toBe(404)
  })

  it('should call delete_thread_and_messages RPC and return 200 on success', async () => {
    mockClient.auth.getUser.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null })
    mockClient.rpc.mockResolvedValue({ data: { success: true }, error: null })

    const req = createNextRequest(`http://localhost:3000/api/dm/${THREAD_ID}/delete`, { method: 'POST' })
    const res = await deleteThread(req, makeParams())

    expect(mockClient.rpc).toHaveBeenCalledWith('delete_thread_and_messages', {
      p_thread_id: THREAD_ID,
      p_user_id: USER_ID,
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ success: true })
  })
})

// ─── DELETE /api/dm/[threadId]/messages ──────────────────────────────────────

describe('DELETE /api/dm/[threadId]/messages', () => {
  it('should return 401 when unauthenticated', async () => {
    mockClient.auth.getUser.mockResolvedValue({ data: { user: null }, error: null })

    const req = createNextRequest(`http://localhost:3000/api/dm/${THREAD_ID}/messages`, { method: 'DELETE' })
    const res = await clearMessages(req, makeParams())

    expect(res.status).toBe(401)
  })

  it('should return 400 for invalid thread ID UUID', async () => {
    mockClient.auth.getUser.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null })

    const req = createNextRequest('http://localhost:3000/api/dm/not-a-uuid/messages', { method: 'DELETE' })
    const res = await clearMessages(req, makeParams('not-a-uuid'))

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body).toHaveProperty('error')
  })

  it('should return 404 when user is not a thread participant', async () => {
    mockClient.auth.getUser.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null })
    mockVerifyThreadParticipant.mockResolvedValueOnce(false)

    const req = createNextRequest(`http://localhost:3000/api/dm/${THREAD_ID}/messages`, { method: 'DELETE' })
    const res = await clearMessages(req, makeParams())

    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.error).toMatch(/thread not found/i)
  })

  it('should return 500 when RPC errors', async () => {
    mockClient.auth.getUser.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null })
    mockClient.rpc.mockResolvedValue({ data: null, error: { message: 'DB error' } })

    const req = createNextRequest(`http://localhost:3000/api/dm/${THREAD_ID}/messages`, { method: 'DELETE' })
    const res = await clearMessages(req, makeParams())

    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body).toHaveProperty('error')
  })

  it('should return 400 when RPC returns data.error', async () => {
    mockClient.auth.getUser.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null })
    mockClient.rpc.mockResolvedValue({ data: { error: 'Thread not found', status: 404 }, error: null })

    const req = createNextRequest(`http://localhost:3000/api/dm/${THREAD_ID}/messages`, { method: 'DELETE' })
    const res = await clearMessages(req, makeParams())

    expect(res.status).toBe(404)
  })

  it('should call clear_thread_messages RPC and return 200 on success', async () => {
    mockClient.auth.getUser.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null })
    mockClient.rpc.mockResolvedValue({ data: { success: true }, error: null })

    const req = createNextRequest(`http://localhost:3000/api/dm/${THREAD_ID}/messages`, { method: 'DELETE' })
    const res = await clearMessages(req, makeParams())

    expect(mockClient.rpc).toHaveBeenCalledWith('clear_thread_messages', {
      p_thread_id: THREAD_ID,
      p_user_id: USER_ID,
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ success: true })
  })
})
