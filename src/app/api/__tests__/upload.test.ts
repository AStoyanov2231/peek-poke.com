import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMockSupabaseClient } from '../../../../test/mocks/supabase'
import { NextRequest } from 'next/server'

vi.mock('next/headers', () => ({ headers: vi.fn(() => new Headers()), cookies: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn(), createServiceClient: vi.fn() }))

// Mock upload helpers — avoids instanceof File cross-realm issues in jsdom
const mockValidateImageFile = vi.hoisted(() => vi.fn(() => null as string | null))
const mockValidateThumbnail = vi.hoisted(() => vi.fn(() => null as string | null))
const mockSanitizeExtension = vi.hoisted(() => vi.fn(() => 'jpg'))
const mockUploadFile = vi.hoisted(() => vi.fn(() => Promise.resolve({ url: 'https://storage.example.com/file.jpg' } as { url: string } | { error: string })))
const mockUploadThumbnail = vi.hoisted(() => vi.fn(() => Promise.resolve('https://storage.example.com/thumb.jpg') as Promise<string | null>))

vi.mock('@/lib/upload', () => ({
  validateImageFile: mockValidateImageFile,
  validateThumbnail: mockValidateThumbnail,
  sanitizeExtension: mockSanitizeExtension,
  uploadFile: mockUploadFile,
  uploadThumbnail: mockUploadThumbnail,
}))

import { POST } from '@/app/api/upload/route'
import * as supabaseServer from '@/lib/supabase/server'

let mockClient: ReturnType<typeof createMockSupabaseClient>

// Build a NextRequest whose formData() resolves to a controlled FormData
// We put real File objects in formData so the route's `instanceof File` check works
function makeRequest(files: { file?: File; thumbnail?: File } = {}): NextRequest {
  const url = 'http://localhost:3000/api/upload'
  const req = new NextRequest(url, { method: 'POST', body: 'placeholder' })
  // Override formData() to return what we want
  const fd = new FormData()
  if (files.file) fd.append('file', files.file)
  if (files.thumbnail) fd.append('thumbnail', files.thumbnail)
  req.formData = vi.fn(() => Promise.resolve(fd))
  return req
}

function makeFile(name = 'photo.jpg', type = 'image/jpeg', size = 1024): File {
  return new File([new Uint8Array(size)], name, { type })
}

beforeEach(() => {
  vi.clearAllMocks()
  mockClient = createMockSupabaseClient()
  vi.mocked(supabaseServer.createClient).mockResolvedValue(mockClient as never)
  mockValidateImageFile.mockReturnValue(null)
  mockValidateThumbnail.mockReturnValue(null)
  mockSanitizeExtension.mockReturnValue('jpg')
  mockUploadFile.mockResolvedValue({ url: 'https://storage.example.com/file.jpg' })
  mockUploadThumbnail.mockResolvedValue('https://storage.example.com/thumb.jpg')
})

describe('POST /api/upload', () => {
  it('uploads file and returns URL', async () => {
    mockClient.auth.getUser.mockResolvedValue({ data: { user: { id: 'user-123' } }, error: null })

    const res = await POST(makeRequest({ file: makeFile() }))
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.url).toBe('https://storage.example.com/file.jpg')
    expect(json.thumbnailUrl).toBeNull()
  })

  it('returns 400 when no file', async () => {
    mockClient.auth.getUser.mockResolvedValue({ data: { user: { id: 'user-123' } }, error: null })

    const res = await POST(makeRequest({}))
    const json = await res.json()

    expect(res.status).toBe(400)
    expect(json.error).toBe('No file provided')
  })

  it('returns 400 for invalid file type (not image)', async () => {
    mockClient.auth.getUser.mockResolvedValue({ data: { user: { id: 'user-123' } }, error: null })
    mockValidateImageFile.mockReturnValue('File type not allowed')

    const res = await POST(makeRequest({ file: makeFile('doc.pdf', 'application/pdf') }))
    const json = await res.json()

    expect(res.status).toBe(400)
    expect(json.error).toBe('File type not allowed')
  })

  it('returns 400 for file >2MB', async () => {
    mockClient.auth.getUser.mockResolvedValue({ data: { user: { id: 'user-123' } }, error: null })
    mockValidateImageFile.mockReturnValue('File too large. Maximum size is 2MB.')

    const res = await POST(makeRequest({ file: makeFile('big.jpg', 'image/jpeg', 2 * 1024 * 1024 + 1) }))
    const json = await res.json()

    expect(res.status).toBe(400)
    expect(json.error).toContain('too large')
  })

  it('uploads thumbnail and returns both URLs', async () => {
    mockClient.auth.getUser.mockResolvedValue({ data: { user: { id: 'user-123' } }, error: null })

    const res = await POST(makeRequest({ file: makeFile(), thumbnail: makeFile('thumb.jpg') }))
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.url).toBe('https://storage.example.com/file.jpg')
    expect(json.thumbnailUrl).toBe('https://storage.example.com/thumb.jpg')
  })

  it('returns 500 on storage error', async () => {
    mockClient.auth.getUser.mockResolvedValue({ data: { user: { id: 'user-123' } }, error: null })
    mockUploadFile.mockResolvedValue({ error: 'Storage error' })

    const res = await POST(makeRequest({ file: makeFile() }))
    const json = await res.json()

    expect(res.status).toBe(500)
    expect(json.error).toBe('Upload failed')
  })

  it('continues without thumbnail when thumbnail upload fails', async () => {
    mockClient.auth.getUser.mockResolvedValue({ data: { user: { id: 'user-123' } }, error: null })
    mockUploadThumbnail.mockResolvedValue(null)

    const res = await POST(makeRequest({ file: makeFile(), thumbnail: makeFile('thumb.jpg') }))
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.url).toBe('https://storage.example.com/file.jpg')
    expect(json.thumbnailUrl).toBeNull()
  })
})
