import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMockSupabaseClient, createMockQueryBuilder } from '../../../../test/mocks/supabase'
import { createNextRequest, createFormDataRequest } from '../../../../test/mocks/next'
import { buildProfile, buildProfilePhoto } from '../../../../test/helpers/factories'
import { MAX_PHOTOS, MIN_INTERESTS_REQUIRED } from '@/lib/constants'

// RFC 4122 compliant UUIDs (zod uuid validator requires version 1-5 and variant bits)
const UUID1 = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'
const UUID2 = 'b1eebc99-9c0b-4ef8-bb6d-6bb9bd380a22'
const UUID3 = 'c2eebc99-9c0b-4ef8-bb6d-6bb9bd380a33'
const UUID4 = 'd3eebc99-9c0b-4ef8-bb6d-6bb9bd380a44'

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
  createServiceClient: vi.fn(),
}))

function createCountBuilder(count: number | null) {
  const b = createMockQueryBuilder(null)
  b.then = vi.fn((resolve: (v: unknown) => void) => resolve({ data: null, error: null, count }))
  return b
}

vi.mock('@/lib/upload', () => ({
  validateImageFile: vi.fn(() => null),
  sanitizeExtension: vi.fn(() => 'jpg'),
  uploadFile: vi.fn(() => Promise.resolve({ url: 'https://test.supabase.co/photos/user/file.jpg' })),
  uploadThumbnail: vi.fn(() => Promise.resolve('https://test.supabase.co/photos/user/file_thumb.jpg')),
}))

import { GET as profileGet } from '@/app/api/profile/[userId]/route'
import { POST as completeOnboardingPost } from '@/app/api/profile/complete-onboarding/route'
import { GET as interestsGet, POST as interestsPost } from '@/app/api/profile/interests/route'
import { DELETE as interestDelete } from '@/app/api/profile/interests/[interestId]/route'
import { GET as photosGet, POST as photosPost } from '@/app/api/profile/photos/route'
import { PATCH as photoPatch, DELETE as photoDelete } from '@/app/api/profile/photos/[photoId]/route'
import { validateImageFile, uploadFile } from '@/lib/upload'
import { PATCH as usernamePatch } from '@/app/api/profile/username/route'
import * as supabaseServer from '@/lib/supabase/server'

let mockClient: ReturnType<typeof createMockSupabaseClient>

beforeEach(() => {
  vi.clearAllMocks()
  mockClient = createMockSupabaseClient()
  vi.mocked(supabaseServer.createClient).mockResolvedValue(mockClient as never)
})

function authUser(id = 'user-123') {
  mockClient.auth.getUser.mockResolvedValue({ data: { user: { id } }, error: null })
}

function noAuth() {
  mockClient.auth.getUser.mockResolvedValue({ data: { user: null }, error: null })
}

// ---------------------------------------------------------------------------
// 1. GET /api/profile/[userId]
// ---------------------------------------------------------------------------
describe('GET /api/profile/[userId]', () => {
  it('returns 401 when unauthenticated', async () => {
    noAuth()
    const req = createNextRequest(`/api/profile/${UUID1}`)
    const res = await profileGet(req, { params: Promise.resolve({ userId: UUID1 }) })
    expect(res.status).toBe(401)
  })

  it('returns 400 for invalid UUID', async () => {
    authUser()
    const req = createNextRequest('/api/profile/not-a-uuid')
    const res = await profileGet(req, { params: Promise.resolve({ userId: 'not-a-uuid' }) })
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.code).toBe('INVALID_USER_ID')
  })

  it('returns 500 when RPC errors', async () => {
    authUser()
    mockClient.rpc.mockResolvedValue({ data: null, error: { message: 'db error' } })
    const req = createNextRequest(`/api/profile/${UUID1}`)
    const res = await profileGet(req, { params: Promise.resolve({ userId: UUID1 }) })
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.code).toBe('PROFILE_FETCH_FAILED')
  })

  it('returns 404 when data.error is present', async () => {
    authUser()
    mockClient.rpc.mockResolvedValue({ data: { error: 'User not found' }, error: null })
    const req = createNextRequest(`/api/profile/${UUID1}`)
    const res = await profileGet(req, { params: Promise.resolve({ userId: UUID1 }) })
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.code).toBe('USER_NOT_FOUND')
  })

  it('returns 200 with profile data on success', async () => {
    authUser()
    const profile = buildProfile()
    mockClient.rpc.mockResolvedValue({ data: profile, error: null })
    const req = createNextRequest(`/api/profile/${UUID1}`)
    const res = await profileGet(req, { params: Promise.resolve({ userId: UUID1 }) })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.id).toBe(profile.id)
  })
})

// ---------------------------------------------------------------------------
// 2. POST /api/profile/complete-onboarding
// ---------------------------------------------------------------------------
describe('POST /api/profile/complete-onboarding', () => {
  it('returns 400 when profile not found', async () => {
    authUser()
    mockClient.from.mockReturnValue(createMockQueryBuilder(null))
    const req = createNextRequest('/api/profile/complete-onboarding', { method: 'POST' })
    const res = await completeOnboardingPost(req, { params: Promise.resolve({}) })
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/username/i)
  })

  it('returns 400 when username is still temporary', async () => {
    authUser()
    // First call: profile with temp username; second call: interests count
    let callCount = 0
    mockClient.from.mockImplementation(() => {
      callCount++
      if (callCount === 1) return createMockQueryBuilder({ username: 'user_a1b2c3d4' })
      return createMockQueryBuilder(null)
    })
    const req = createNextRequest('/api/profile/complete-onboarding', { method: 'POST' })
    const res = await completeOnboardingPost(req, { params: Promise.resolve({}) })
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/username/i)
  })

  it('returns 400 when not enough interests', async () => {
    authUser()
    let callCount = 0
    mockClient.from.mockImplementation(() => {
      callCount++
      if (callCount === 1) return createMockQueryBuilder({ username: 'realuser' })
      // second call is interest count — count=2, under minimum
      return createCountBuilder(2)
    })
    const req = createNextRequest('/api/profile/complete-onboarding', { method: 'POST' })
    const res = await completeOnboardingPost(req, { params: Promise.resolve({}) })
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toContain(String(MIN_INTERESTS_REQUIRED))
  })

  it('returns 500 on DB update error', async () => {
    authUser()
    let callCount = 0
    mockClient.from.mockImplementation(() => {
      callCount++
      if (callCount === 1) return createMockQueryBuilder({ username: 'realuser' })
      if (callCount === 2) return createCountBuilder(MIN_INTERESTS_REQUIRED)
      return createMockQueryBuilder(null, { message: 'db error' })
    })
    const req = createNextRequest('/api/profile/complete-onboarding', { method: 'POST' })
    const res = await completeOnboardingPost(req, { params: Promise.resolve({}) })
    expect(res.status).toBe(500)
  })

  it('returns 200 with updated profile on success', async () => {
    authUser()
    const profile = buildProfile({ onboarding_completed: true })
    let callCount = 0
    mockClient.from.mockImplementation(() => {
      callCount++
      if (callCount === 1) return createMockQueryBuilder({ username: 'realuser' })
      if (callCount === 2) return createCountBuilder(MIN_INTERESTS_REQUIRED)
      return createMockQueryBuilder(profile)
    })
    const req = createNextRequest('/api/profile/complete-onboarding', { method: 'POST' })
    const res = await completeOnboardingPost(req, { params: Promise.resolve({}) })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// 3. GET + POST /api/profile/interests
// ---------------------------------------------------------------------------
describe('GET /api/profile/interests', () => {
  it('returns 500 on DB error', async () => {
    authUser()
    mockClient.from.mockReturnValue(createMockQueryBuilder(null, { message: 'db error' }))
    const req = createNextRequest('/api/profile/interests')
    const res = await interestsGet(req, { params: Promise.resolve({}) })
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.code).toBe('INTERESTS_FETCH_FAILED')
  })

  it('returns empty array when no interests', async () => {
    authUser()
    mockClient.from.mockReturnValue(createMockQueryBuilder(null))
    const req = createNextRequest('/api/profile/interests')
    const res = await interestsGet(req, { params: Promise.resolve({}) })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.interests).toEqual([])
  })

  it('returns interests array on success', async () => {
    authUser()
    const interests = [{ id: UUID1, tag_id: UUID2 }, { id: UUID3, tag_id: UUID4 }]
    mockClient.from.mockReturnValue(createMockQueryBuilder(interests))
    const req = createNextRequest('/api/profile/interests')
    const res = await interestsGet(req, { params: Promise.resolve({}) })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.interests).toHaveLength(2)
  })
})

describe('POST /api/profile/interests', () => {
  const VALID_TAG_ID = UUID2

  it('returns 400 for invalid body', async () => {
    authUser()
    const req = createNextRequest('/api/profile/interests', {
      method: 'POST',
      body: { tag_id: 'not-a-uuid' },
    })
    const res = await interestsPost(req, { params: Promise.resolve({}) })
    expect(res.status).toBe(400)
  })

  it('returns 400 when max interests reached', async () => {
    authUser()
    mockClient.from.mockReturnValue(
      createMockQueryBuilder(null, { message: `Maximum of ${MIN_INTERESTS_REQUIRED} interests allowed` })
    )
    const req = createNextRequest('/api/profile/interests', {
      method: 'POST',
      body: { tag_id: VALID_TAG_ID },
    })
    const res = await interestsPost(req, { params: Promise.resolve({}) })
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.code).toBe('INTEREST_LIMIT_REACHED')
  })

  it('returns 400 for duplicate interest (23505)', async () => {
    authUser()
    mockClient.from.mockReturnValue(
      createMockQueryBuilder(null, { code: '23505', message: 'duplicate key' })
    )
    const req = createNextRequest('/api/profile/interests', {
      method: 'POST',
      body: { tag_id: VALID_TAG_ID },
    })
    const res = await interestsPost(req, { params: Promise.resolve({}) })
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.code).toBe('INTEREST_DUPLICATE')
  })

  it('returns 500 on generic DB error', async () => {
    authUser()
    mockClient.from.mockReturnValue(
      createMockQueryBuilder(null, { code: '99999', message: 'some error' })
    )
    const req = createNextRequest('/api/profile/interests', {
      method: 'POST',
      body: { tag_id: VALID_TAG_ID },
    })
    const res = await interestsPost(req, { params: Promise.resolve({}) })
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.code).toBe('INTEREST_ADD_FAILED')
  })

  it('returns 201 on success', async () => {
    authUser()
    const interest = { id: UUID1, tag_id: VALID_TAG_ID }
    mockClient.from.mockReturnValue(createMockQueryBuilder(interest))
    const req = createNextRequest('/api/profile/interests', {
      method: 'POST',
      body: { tag_id: VALID_TAG_ID },
    })
    const res = await interestsPost(req, { params: Promise.resolve({}) })
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.interest.id).toBe(UUID1)
  })
})

// ---------------------------------------------------------------------------
// 4. DELETE /api/profile/interests/[interestId]
// ---------------------------------------------------------------------------
describe('DELETE /api/profile/interests/[interestId]', () => {
  const VALID_ID = UUID3

  it('returns 401 when unauthenticated', async () => {
    noAuth()
    const req = createNextRequest(`/api/profile/interests/${VALID_ID}`, { method: 'DELETE' })
    const res = await interestDelete(req, { params: Promise.resolve({ interestId: VALID_ID }) })
    expect(res.status).toBe(401)
  })

  it('returns 400 for invalid UUID', async () => {
    authUser()
    const req = createNextRequest('/api/profile/interests/bad-id', { method: 'DELETE' })
    const res = await interestDelete(req, { params: Promise.resolve({ interestId: 'bad-id' }) })
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.code).toBe('INTEREST_NOT_FOUND')
  })

  it('returns 500 on DB error', async () => {
    authUser()
    mockClient.from.mockReturnValue(
      createMockQueryBuilder(null, { message: 'db error' })
    )
    const req = createNextRequest(`/api/profile/interests/${VALID_ID}`, { method: 'DELETE' })
    const res = await interestDelete(req, { params: Promise.resolve({ interestId: VALID_ID }) })
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.code).toBe('INTEREST_DELETE_FAILED')
  })

  it('returns 200 on success', async () => {
    authUser()
    mockClient.from.mockReturnValue(createMockQueryBuilder(null))
    const req = createNextRequest(`/api/profile/interests/${VALID_ID}`, { method: 'DELETE' })
    const res = await interestDelete(req, { params: Promise.resolve({ interestId: VALID_ID }) })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// 5. GET + POST /api/profile/photos
// ---------------------------------------------------------------------------
describe('GET /api/profile/photos', () => {
  it('returns 500 on DB error', async () => {
    authUser()
    mockClient.from.mockReturnValue(createMockQueryBuilder(null, { message: 'db error' }))
    const req = createNextRequest('/api/profile/photos')
    const res = await photosGet(req, { params: Promise.resolve({}) })
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.code).toBe('PHOTOS_FETCH_FAILED')
  })

  it('returns photos array on success', async () => {
    authUser()
    const photos = [buildProfilePhoto(), buildProfilePhoto()]
    mockClient.from.mockReturnValue(createMockQueryBuilder(photos))
    const req = createNextRequest('/api/profile/photos')
    const res = await photosGet(req, { params: Promise.resolve({}) })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.photos).toHaveLength(2)
  })
})

describe('POST /api/profile/photos', () => {
  it('returns 400 when at photo limit', async () => {
    authUser()
    mockClient.from.mockReturnValue(createCountBuilder(MAX_PHOTOS))
    const formData = new FormData()
    formData.append('file', new File(['data'], 'photo.jpg', { type: 'image/jpeg' }))
    const req = createFormDataRequest('/api/profile/photos', formData)
    const res = await photosPost(req, { params: Promise.resolve({}) })
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.code).toBe('PHOTO_LIMIT_REACHED')
  })

  it('returns 400 when no file provided', async () => {
    authUser()
    mockClient.from.mockReturnValue(createCountBuilder(0))
    const formData = new FormData()
    // no file appended
    const req = createFormDataRequest('/api/profile/photos', formData)
    const res = await photosPost(req, { params: Promise.resolve({}) })
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.code).toBe('UPLOAD_FAILED')
  })

  it('returns 400 when file fails validation', async () => {
    authUser()
    vi.mocked(validateImageFile).mockReturnValueOnce('File too large')
    mockClient.from.mockReturnValue(createCountBuilder(0))
    const fd = new FormData()
    fd.append('file', new File([new Uint8Array(1024)], 'photo.jpg', { type: 'image/jpeg' }))
    const req = new (await import('next/server')).NextRequest(
      'http://localhost:3000/api/profile/photos', { method: 'POST', body: 'placeholder' }
    )
    req.formData = vi.fn().mockResolvedValue(fd)
    const res = await photosPost(req as never, { params: Promise.resolve({}) })
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.code).toBe('UPLOAD_FAILED')
  })

  it('returns 500 when file upload fails', async () => {
    authUser()
    vi.mocked(uploadFile).mockResolvedValueOnce({ error: new Error('storage error') } as never)
    mockClient.from.mockReturnValue(createCountBuilder(0))
    const fd = new FormData()
    fd.append('file', new File([new Uint8Array(1024)], 'photo.jpg', { type: 'image/jpeg' }))
    const req = new (await import('next/server')).NextRequest(
      'http://localhost:3000/api/profile/photos', { method: 'POST', body: 'placeholder' }
    )
    req.formData = vi.fn().mockResolvedValue(fd)
    const res = await photosPost(req as never, { params: Promise.resolve({}) })
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.code).toBe('UPLOAD_FAILED')
  })

  it('returns 500 on generic DB insert error', async () => {
    authUser()
    vi.mocked(uploadFile).mockResolvedValueOnce({ url: 'https://example.com/photo.jpg' })
    let callCount = 0
    mockClient.from.mockImplementation(() => {
      callCount++
      if (callCount === 1) return createCountBuilder(0)
      if (callCount === 2) return createMockQueryBuilder({ display_order: 0 })
      return createMockQueryBuilder(null, { code: '50000', message: 'db error' })
    })
    const fd = new FormData()
    fd.append('file', new File([new Uint8Array(1024)], 'photo.jpg', { type: 'image/jpeg' }))
    const req = new (await import('next/server')).NextRequest(
      'http://localhost:3000/api/profile/photos', { method: 'POST', body: 'placeholder' }
    )
    req.formData = vi.fn().mockResolvedValue(fd)
    const res = await photosPost(req as never, { params: Promise.resolve({}) })
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.code).toBe('UPLOAD_FAILED')
  })

  it('returns 400 on P0001 DB error (photo limit via trigger)', async () => {
    authUser()
    vi.mocked(uploadFile).mockResolvedValueOnce({ url: 'https://example.com/photo.jpg' })
    let callCount = 0
    mockClient.from.mockImplementation(() => {
      callCount++
      if (callCount === 1) return createCountBuilder(0)
      if (callCount === 2) return createMockQueryBuilder({ display_order: 0 })
      return createMockQueryBuilder(null, { code: 'P0001', message: 'PHOTO_LIMIT_REACHED' })
    })
    const fd = new FormData()
    fd.append('file', new File([new Uint8Array(1024)], 'photo.jpg', { type: 'image/jpeg' }))
    const req = new (await import('next/server')).NextRequest(
      'http://localhost:3000/api/profile/photos', { method: 'POST', body: 'placeholder' }
    )
    req.formData = vi.fn().mockResolvedValue(fd)
    const res = await photosPost(req as never, { params: Promise.resolve({}) })
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.code).toBe('PHOTO_LIMIT_REACHED')
  })

  it('sets display_order to 0 when no existing photos', async () => {
    authUser()
    vi.mocked(uploadFile).mockResolvedValueOnce({ url: 'https://example.com/photo.jpg' })
    const photo = buildProfilePhoto({ display_order: 0 })
    let callCount = 0
    mockClient.from.mockImplementation(() => {
      callCount++
      if (callCount === 1) return createCountBuilder(0)
      if (callCount === 2) return createMockQueryBuilder(null) // no existing photos
      return createMockQueryBuilder(photo)
    })
    const fd = new FormData()
    fd.append('file', new File([new Uint8Array(1024)], 'photo.jpg', { type: 'image/jpeg' }))
    const req = new (await import('next/server')).NextRequest(
      'http://localhost:3000/api/profile/photos', { method: 'POST', body: 'placeholder' }
    )
    req.formData = vi.fn().mockResolvedValue(fd)
    const res = await photosPost(req as never, { params: Promise.resolve({}) })
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.photo.display_order).toBe(0)
  })

  it('returns 201 on successful upload', async () => {
    authUser()
    const photo = buildProfilePhoto()
    let callCount = 0
    mockClient.from.mockImplementation(() => {
      callCount++
      if (callCount === 1) {
        // count check
        return createCountBuilder(0)
      }
      if (callCount === 2) {
        // max display_order query
        return createMockQueryBuilder({ display_order: 0 })
      }
      // insert
      return createMockQueryBuilder(photo)
    })

    // Use a real File so instanceof File passes; override formData() to avoid
    // body-stream issues with NextRequest in jsdom (same pattern as upload.test.ts)
    const realFile = new File([new Uint8Array(1024)], 'photo.jpg', { type: 'image/jpeg' })
    const fd = new FormData()
    fd.append('file', realFile)

    const req = new (await import('next/server')).NextRequest(
      'http://localhost:3000/api/profile/photos',
      { method: 'POST', body: 'placeholder' }
    )
    req.formData = vi.fn().mockResolvedValue(fd)

    // `as never`: jsdom FormData isn't assignment-compatible with the route handler's
    // NextRequest overload — cast required to satisfy TypeScript without a real body stream.
    const res = await photosPost(req as never, { params: Promise.resolve({}) })
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.photo).toBeDefined()
  })
})

// ---------------------------------------------------------------------------
// 6. DELETE /api/profile/photos/[photoId]
// ---------------------------------------------------------------------------
describe('DELETE /api/profile/photos/[photoId]', () => {
  const VALID_PHOTO_ID = UUID4

  it('returns 400 for invalid UUID', async () => {
    authUser()
    const req = createNextRequest('/api/profile/photos/bad-id', { method: 'DELETE' })
    const res = await photoDelete(req, { params: Promise.resolve({ photoId: 'bad-id' }) })
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.code).toBe('PHOTO_NOT_FOUND')
  })

  it('returns 404 when photo not found or not owned', async () => {
    authUser()
    mockClient.from.mockReturnValue(createMockQueryBuilder(null))
    const req = createNextRequest(`/api/profile/photos/${VALID_PHOTO_ID}`, { method: 'DELETE' })
    const res = await photoDelete(req, { params: Promise.resolve({ photoId: VALID_PHOTO_ID }) })
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.code).toBe('PHOTO_NOT_FOUND')
  })

  it('returns 500 on DB delete error', async () => {
    authUser()
    const photo = buildProfilePhoto({ is_avatar: false, thumbnail_url: null })
    let callCount = 0
    mockClient.from.mockImplementation(() => {
      callCount++
      if (callCount === 1) return createMockQueryBuilder(photo) // select
      return createMockQueryBuilder(null, { message: 'db error' }) // delete fails
    })
    const req = createNextRequest(`/api/profile/photos/${VALID_PHOTO_ID}`, { method: 'DELETE' })
    const res = await photoDelete(req, { params: Promise.resolve({ photoId: VALID_PHOTO_ID }) })
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.code).toBe('PHOTO_DELETE_FAILED')
  })

  it('returns 200 on success', async () => {
    authUser()
    const photo = buildProfilePhoto({ is_avatar: false, thumbnail_url: null })
    let callCount = 0
    mockClient.from.mockImplementation(() => {
      callCount++
      if (callCount === 1) return createMockQueryBuilder(photo) // select
      return createMockQueryBuilder(null) // delete succeeds
    })
    const req = createNextRequest(`/api/profile/photos/${VALID_PHOTO_ID}`, { method: 'DELETE' })
    const res = await photoDelete(req, { params: Promise.resolve({ photoId: VALID_PHOTO_ID }) })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)
  })

  it('clears profile avatar_url when deleted photo was the avatar', async () => {
    authUser()
    const photo = buildProfilePhoto({ is_avatar: true, thumbnail_url: null })
    let callCount = 0
    mockClient.from.mockImplementation(() => {
      callCount++
      if (callCount === 1) return createMockQueryBuilder(photo)  // select
      if (callCount === 2) return createMockQueryBuilder(null)    // delete
      return createMockQueryBuilder(null)                          // clear avatar_url on profiles
    })
    const req = createNextRequest(`/api/profile/photos/${VALID_PHOTO_ID}`, { method: 'DELETE' })
    const res = await photoDelete(req, { params: Promise.resolve({ photoId: VALID_PHOTO_ID }) })
    expect(res.status).toBe(200)
    expect(mockClient.from).toHaveBeenCalledTimes(3)
  })

  it('attempts thumbnail cleanup when thumbnail_url exists', async () => {
    authUser()
    const removeMock = vi.fn(() => Promise.resolve({ data: null, error: null }))
    mockClient.storage.from.mockReturnValue({ upload: vi.fn(), getPublicUrl: vi.fn(), remove: removeMock })
    const photo = buildProfilePhoto({ is_avatar: false, thumbnail_url: 'https://example.com/thumb.jpg', storage_path: 'user/123.jpg' })
    let callCount = 0
    mockClient.from.mockImplementation(() => {
      callCount++
      if (callCount === 1) return createMockQueryBuilder(photo)
      return createMockQueryBuilder(null)
    })
    const req = createNextRequest(`/api/profile/photos/${VALID_PHOTO_ID}`, { method: 'DELETE' })
    const res = await photoDelete(req, { params: Promise.resolve({ photoId: VALID_PHOTO_ID }) })
    expect(res.status).toBe(200)
    expect(removeMock).toHaveBeenCalledTimes(2)
  })
})

// ---------------------------------------------------------------------------
// 7. PATCH /api/profile/username
// ---------------------------------------------------------------------------
describe('PATCH /api/profile/username', () => {
  it('returns 400 for invalid body', async () => {
    authUser()
    const req = createNextRequest('/api/profile/username', {
      method: 'PATCH',
      body: { username: 'a' }, // too short
    })
    const res = await usernamePatch(req, { params: Promise.resolve({}) })
    expect(res.status).toBe(400)
  })

  it('returns 409 when username already taken (23505)', async () => {
    authUser()
    mockClient.from.mockReturnValue(
      createMockQueryBuilder(null, { code: '23505', message: 'duplicate key' })
    )
    const req = createNextRequest('/api/profile/username', {
      method: 'PATCH',
      body: { username: 'newusername' },
    })
    const res = await usernamePatch(req, { params: Promise.resolve({}) })
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toMatch(/already taken/i)
  })

  it('returns 500 on generic DB error', async () => {
    authUser()
    mockClient.from.mockReturnValue(
      createMockQueryBuilder(null, { code: '50000', message: 'internal' })
    )
    const req = createNextRequest('/api/profile/username', {
      method: 'PATCH',
      body: { username: 'validuser' },
    })
    const res = await usernamePatch(req, { params: Promise.resolve({}) })
    expect(res.status).toBe(500)
  })

  it('returns 200 with profile on success', async () => {
    authUser()
    const profile = buildProfile({ username: 'validuser' })
    mockClient.from.mockReturnValue(createMockQueryBuilder(profile))
    const req = createNextRequest('/api/profile/username', {
      method: 'PATCH',
      body: { username: 'validuser' },
    })
    const res = await usernamePatch(req, { params: Promise.resolve({}) })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.profile.username).toBe('validuser')
  })
})

// ---------------------------------------------------------------------------
// 8. PATCH /api/profile/photos/[photoId]
// ---------------------------------------------------------------------------
describe('PATCH /api/profile/photos/[photoId]', () => {
  const VALID_PHOTO_ID = UUID4

  it('returns 401 when unauthenticated', async () => {
    noAuth()
    const req = createNextRequest(`/api/profile/photos/${VALID_PHOTO_ID}`, { method: 'PATCH', body: { display_order: 1 } })
    const res = await photoPatch(req, { params: Promise.resolve({ photoId: VALID_PHOTO_ID }) })
    expect(res.status).toBe(401)
  })

  it('returns 400 for invalid UUID', async () => {
    authUser()
    const req = createNextRequest('/api/profile/photos/bad-id', { method: 'PATCH', body: { display_order: 1 } })
    const res = await photoPatch(req, { params: Promise.resolve({ photoId: 'bad-id' }) })
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.code).toBe('PHOTO_NOT_FOUND')
  })

  it('returns 404 when photo not found or not owned', async () => {
    authUser()
    mockClient.from.mockReturnValue(createMockQueryBuilder(null))
    const req = createNextRequest(`/api/profile/photos/${VALID_PHOTO_ID}`, { method: 'PATCH', body: { display_order: 1 } })
    const res = await photoPatch(req, { params: Promise.resolve({ photoId: VALID_PHOTO_ID }) })
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.code).toBe('PHOTO_NOT_FOUND')
  })

  it('returns existing photo when no updatable fields provided', async () => {
    authUser()
    const photo = buildProfilePhoto({ is_avatar: false, is_private: false })
    mockClient.from.mockReturnValue(createMockQueryBuilder(photo))
    const req = createNextRequest(`/api/profile/photos/${VALID_PHOTO_ID}`, { method: 'PATCH', body: {} })
    const res = await photoPatch(req, { params: Promise.resolve({ photoId: VALID_PHOTO_ID }) })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.photo).toEqual(photo)
  })

  it('updates display_order successfully', async () => {
    authUser()
    const photo = buildProfilePhoto({ is_avatar: false, is_private: false })
    const updated = { ...photo, display_order: 3 }
    let callCount = 0
    mockClient.from.mockImplementation(() => {
      callCount++
      if (callCount === 1) return createMockQueryBuilder(photo)
      return createMockQueryBuilder(updated)
    })
    const req = createNextRequest(`/api/profile/photos/${VALID_PHOTO_ID}`, { method: 'PATCH', body: { display_order: 3 } })
    const res = await photoPatch(req, { params: Promise.resolve({ photoId: VALID_PHOTO_ID }) })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.photo.display_order).toBe(3)
  })

  it('returns 500 on update DB error', async () => {
    authUser()
    const photo = buildProfilePhoto({ is_avatar: false, is_private: false })
    let callCount = 0
    mockClient.from.mockImplementation(() => {
      callCount++
      if (callCount === 1) return createMockQueryBuilder(photo)
      return createMockQueryBuilder(null, { message: 'db error' })
    })
    const req = createNextRequest(`/api/profile/photos/${VALID_PHOTO_ID}`, { method: 'PATCH', body: { display_order: 3 } })
    const res = await photoPatch(req, { params: Promise.resolve({ photoId: VALID_PHOTO_ID }) })
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.code).toBe('PHOTO_UPDATE_FAILED')
  })

  it('makes non-avatar photo private', async () => {
    authUser()
    const photo = buildProfilePhoto({ is_avatar: false, is_private: false })
    const updated = { ...photo, is_private: true }
    let callCount = 0
    mockClient.from.mockImplementation(() => {
      callCount++
      if (callCount === 1) return createMockQueryBuilder(photo)
      return createMockQueryBuilder(updated)
    })
    const req = createNextRequest(`/api/profile/photos/${VALID_PHOTO_ID}`, { method: 'PATCH', body: { is_private: true } })
    const res = await photoPatch(req, { params: Promise.resolve({ photoId: VALID_PHOTO_ID }) })
    expect(res.status).toBe(200)
  })

  it('clears profile avatar_url when making avatar photo private', async () => {
    authUser()
    const photo = buildProfilePhoto({ is_avatar: true, is_private: false })
    const updated = { ...photo, is_private: true, is_avatar: false }
    let callCount = 0
    mockClient.from.mockImplementation(() => {
      callCount++
      if (callCount === 1) return createMockQueryBuilder(photo)   // ownership
      if (callCount === 2) return createMockQueryBuilder(null)     // clear profile avatar_url
      return createMockQueryBuilder(updated)                        // photo update
    })
    const req = createNextRequest(`/api/profile/photos/${VALID_PHOTO_ID}`, { method: 'PATCH', body: { is_private: true } })
    const res = await photoPatch(req, { params: Promise.resolve({ photoId: VALID_PHOTO_ID }) })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.photo.is_avatar).toBe(false)
  })

  it('returns 500 when clearing profile avatar_url fails', async () => {
    authUser()
    const photo = buildProfilePhoto({ is_avatar: true, is_private: false })
    let callCount = 0
    mockClient.from.mockImplementation(() => {
      callCount++
      if (callCount === 1) return createMockQueryBuilder(photo)
      return createMockQueryBuilder(null, { message: 'db error' })
    })
    const req = createNextRequest(`/api/profile/photos/${VALID_PHOTO_ID}`, { method: 'PATCH', body: { is_private: true } })
    const res = await photoPatch(req, { params: Promise.resolve({ photoId: VALID_PHOTO_ID }) })
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.code).toBe('PHOTO_UPDATE_FAILED')
  })

  it('returns 400 when setting non-approved photo as avatar', async () => {
    authUser()
    const photo = buildProfilePhoto({ is_avatar: false, is_private: false, approval_status: 'pending' })
    mockClient.from.mockReturnValue(createMockQueryBuilder(photo))
    const req = createNextRequest(`/api/profile/photos/${VALID_PHOTO_ID}`, { method: 'PATCH', body: { is_avatar: true } })
    const res = await photoPatch(req, { params: Promise.resolve({ photoId: VALID_PHOTO_ID }) })
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.code).toBe('PHOTO_UPDATE_FAILED')
  })

  it('returns 400 when setting private photo as avatar', async () => {
    authUser()
    const photo = buildProfilePhoto({ is_avatar: false, is_private: true, approval_status: 'approved' })
    mockClient.from.mockReturnValue(createMockQueryBuilder(photo))
    const req = createNextRequest(`/api/profile/photos/${VALID_PHOTO_ID}`, { method: 'PATCH', body: { is_avatar: true } })
    const res = await photoPatch(req, { params: Promise.resolve({ photoId: VALID_PHOTO_ID }) })
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.code).toBe('PHOTO_UPDATE_FAILED')
  })

  it('returns 500 when clearing other avatars fails', async () => {
    authUser()
    const photo = buildProfilePhoto({ is_avatar: false, is_private: false, approval_status: 'approved' })
    let callCount = 0
    mockClient.from.mockImplementation(() => {
      callCount++
      if (callCount === 1) return createMockQueryBuilder(photo)
      return createMockQueryBuilder(null, { message: 'db error' })
    })
    const req = createNextRequest(`/api/profile/photos/${VALID_PHOTO_ID}`, { method: 'PATCH', body: { is_avatar: true } })
    const res = await photoPatch(req, { params: Promise.resolve({ photoId: VALID_PHOTO_ID }) })
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.code).toBe('PHOTO_UPDATE_FAILED')
  })

  it('returns 500 when updating profile avatar_url fails', async () => {
    authUser()
    const photo = buildProfilePhoto({ is_avatar: false, is_private: false, approval_status: 'approved' })
    let callCount = 0
    mockClient.from.mockImplementation(() => {
      callCount++
      if (callCount === 1) return createMockQueryBuilder(photo)    // ownership
      if (callCount === 2) return createMockQueryBuilder(null)      // clear other avatars OK
      return createMockQueryBuilder(null, { message: 'db error' }) // profiles update fails
    })
    const req = createNextRequest(`/api/profile/photos/${VALID_PHOTO_ID}`, { method: 'PATCH', body: { is_avatar: true } })
    const res = await photoPatch(req, { params: Promise.resolve({ photoId: VALID_PHOTO_ID }) })
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.code).toBe('PHOTO_UPDATE_FAILED')
  })

  it('sets photo as avatar successfully', async () => {
    authUser()
    const photo = buildProfilePhoto({ is_avatar: false, is_private: false, approval_status: 'approved' })
    const updated = { ...photo, is_avatar: true }
    let callCount = 0
    mockClient.from.mockImplementation(() => {
      callCount++
      if (callCount === 1) return createMockQueryBuilder(photo)    // ownership
      if (callCount === 2) return createMockQueryBuilder(null)      // clear other avatars
      if (callCount === 3) return createMockQueryBuilder(null)      // profiles update
      return createMockQueryBuilder(updated)                         // photo update
    })
    const req = createNextRequest(`/api/profile/photos/${VALID_PHOTO_ID}`, { method: 'PATCH', body: { is_avatar: true } })
    const res = await photoPatch(req, { params: Promise.resolve({ photoId: VALID_PHOTO_ID }) })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.photo.is_avatar).toBe(true)
  })
})
