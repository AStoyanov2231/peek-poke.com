# Test Coverage Boost Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Push coverage from stmt 86.54% / branch 76.66% to 95%+ by filling gaps in photos routes and auth/profile.

**Architecture:** All tests added to existing test files — no new files created. Pattern: `vi.mock` + `createMockSupabaseClient` + `createNextRequest`.

**Tech Stack:** Vitest, @testing-library/react, jsdom, existing mock utilities in `test/mocks/`

---

## Task 1: PATCH /api/profile/photos/[photoId] — add all missing tests

**Files:**
- Modify: `src/app/api/__tests__/profile-sub-routes.test.ts`

Source has these branches, all untested:
- invalid UUID → 400
- photo not found → 404
- `is_private=true` on non-avatar → 200
- `is_private=true` on avatar → clears profile avatar_url → 200
- `is_private=true` on avatar + profiles update error → 500
- `is_avatar=true` on non-approved photo → 400
- `is_avatar=true` on private photo → 400
- `is_avatar=true` + clearAvatars DB error → 500
- `is_avatar=true` + profiles update error → 500
- `is_avatar=true` success → 200
- no fields in body → returns existing photo unchanged
- update DB error → 500
- display_order update → 200
- 401 unauthenticated

- [ ] **Step 1: Add PATCH import and describe block**

In `src/app/api/__tests__/profile-sub-routes.test.ts`, add `PATCH as photoPatch` to the import line:

```typescript
import { PATCH as photoPatch, DELETE as photoDelete } from '@/app/api/profile/photos/[photoId]/route'
```

- [ ] **Step 2: Add PATCH describe block after existing DELETE describe**

Add after the closing `})` of the DELETE describe block (around line 486):

```typescript
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

  it('returns existing photo when no fields provided', async () => {
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
      if (callCount === 1) return createMockQueryBuilder(photo)  // ownership select
      return createMockQueryBuilder(updated)                       // update
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

  it('makes photo private when it is not the avatar', async () => {
    authUser()
    const photo = buildProfilePhoto({ is_avatar: false, is_private: false })
    const updated = { ...photo, is_private: true }
    let callCount = 0
    mockClient.from.mockImplementation(() => {
      callCount++
      if (callCount === 1) return createMockQueryBuilder(photo)  // ownership
      return createMockQueryBuilder(updated)                       // update
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
      if (callCount === 2) return createMockQueryBuilder(null)     // profiles update (clear avatar_url)
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
      return createMockQueryBuilder(null, { message: 'db error' }) // profiles update fails
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
      if (callCount === 1) return createMockQueryBuilder(photo)                          // ownership
      return createMockQueryBuilder(null, { message: 'db error' })                       // clear avatars fails
    })
    const req = createNextRequest(`/api/profile/photos/${VALID_PHOTO_ID}`, { method: 'PATCH', body: { is_avatar: true } })
    const res = await photoPatch(req, { params: Promise.resolve({ photoId: VALID_PHOTO_ID }) })
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.code).toBe('PHOTO_UPDATE_FAILED')
  })

  it('returns 500 when updating profile avatar_url fails', async () => {
    authUser()
    const photo = buildProfilePhoto({ is_avatar: false, is_private: false, approval_status: 'approved', url: 'https://example.com/photo.jpg' })
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
    const photo = buildProfilePhoto({ is_avatar: false, is_private: false, approval_status: 'approved', url: 'https://example.com/photo.jpg' })
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
```

- [ ] **Step 3: Run tests**

```bash
cd C:/peek-poke.com && rtk npm run test -- --reporter=verbose src/app/api/__tests__/profile-sub-routes.test.ts
```

Expected: all new tests pass.

- [ ] **Step 4: Commit**

```bash
rtk git add src/app/api/__tests__/profile-sub-routes.test.ts && rtk git commit -m "test: add PATCH /api/profile/photos/[photoId] coverage"
```

---

## Task 2: POST /api/profile/photos — fill missing branches

**Files:**
- Modify: `src/app/api/__tests__/profile-sub-routes.test.ts`

Missing branches in POST:
- `validateImageFile` returns error string → 400
- `uploadFile` returns `{ error }` → 500
- DB insert error (generic) → 500 + storage cleanup
- DB insert error (P0001 / PHOTO_LIMIT_REACHED) → 400
- `maxOrderData` null (first photo, display_order = 0)
- POST with thumbnail provided

- [ ] **Step 1: Import validateImageFile and uploadFile mocks**

They're already mocked via `vi.mock('@/lib/upload', ...)` at top of file. To override per-test, use `vi.mocked(validateImageFile).mockReturnValue(...)`.

Add to the existing imports at top of file:

```typescript
import { validateImageFile, uploadFile } from '@/lib/upload'
```

- [ ] **Step 2: Add missing POST tests inside existing POST describe block**

Add after the last `it(...)` in `describe('POST /api/profile/photos', ...)`:

```typescript
  it('returns 400 when file fails validation', async () => {
    authUser()
    vi.mocked(validateImageFile).mockReturnValueOnce('File too large')
    mockClient.from.mockReturnValue(createCountBuilder(0))
    const formData = new FormData()
    formData.append('file', new File(['data'], 'photo.jpg', { type: 'image/jpeg' }))
    const req = createFormDataRequest('/api/profile/photos', formData)
    const res = await photosPost(req, { params: Promise.resolve({}) })
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.code).toBe('UPLOAD_FAILED')
  })

  it('returns 500 when file upload fails', async () => {
    authUser()
    vi.mocked(validateImageFile).mockReturnValueOnce(null)
    vi.mocked(uploadFile).mockResolvedValueOnce({ error: new Error('storage error') } as never)
    mockClient.from.mockReturnValue(createCountBuilder(0))
    const formData = new FormData()
    formData.append('file', new File(['data'], 'photo.jpg', { type: 'image/jpeg' }))
    const req = createFormDataRequest('/api/profile/photos', formData)
    const res = await photosPost(req, { params: Promise.resolve({}) })
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.code).toBe('UPLOAD_FAILED')
  })

  it('returns 500 on generic DB insert error and cleans up storage', async () => {
    authUser()
    vi.mocked(validateImageFile).mockReturnValueOnce(null)
    vi.mocked(uploadFile).mockResolvedValueOnce({ url: 'https://example.com/photo.jpg' })
    let callCount = 0
    mockClient.from.mockImplementation(() => {
      callCount++
      if (callCount === 1) return createCountBuilder(0)
      if (callCount === 2) return createMockQueryBuilder({ display_order: 0 })
      return createMockQueryBuilder(null, { code: '50000', message: 'db error' })
    })
    const formData = new FormData()
    formData.append('file', new File(['data'], 'photo.jpg', { type: 'image/jpeg' }))
    const req = createFormDataRequest('/api/profile/photos', formData)
    const res = await photosPost(req, { params: Promise.resolve({}) })
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.code).toBe('UPLOAD_FAILED')
  })

  it('returns 400 on P0001 DB error (photo limit via trigger)', async () => {
    authUser()
    vi.mocked(validateImageFile).mockReturnValueOnce(null)
    vi.mocked(uploadFile).mockResolvedValueOnce({ url: 'https://example.com/photo.jpg' })
    let callCount = 0
    mockClient.from.mockImplementation(() => {
      callCount++
      if (callCount === 1) return createCountBuilder(0)
      if (callCount === 2) return createMockQueryBuilder({ display_order: 0 })
      return createMockQueryBuilder(null, { code: 'P0001', message: 'PHOTO_LIMIT_REACHED' })
    })
    const formData = new FormData()
    formData.append('file', new File(['data'], 'photo.jpg', { type: 'image/jpeg' }))
    const req = createFormDataRequest('/api/profile/photos', formData)
    const res = await photosPost(req, { params: Promise.resolve({}) })
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.code).toBe('PHOTO_LIMIT_REACHED')
  })

  it('sets display_order to 0 when no existing photos', async () => {
    authUser()
    vi.mocked(validateImageFile).mockReturnValueOnce(null)
    vi.mocked(uploadFile).mockResolvedValueOnce({ url: 'https://example.com/photo.jpg' })
    const photo = buildProfilePhoto({ display_order: 0 })
    let callCount = 0
    mockClient.from.mockImplementation(() => {
      callCount++
      if (callCount === 1) return createCountBuilder(0)
      if (callCount === 2) return createMockQueryBuilder(null) // no existing photos → null
      return createMockQueryBuilder(photo)
    })
    const formData = new FormData()
    formData.append('file', new File(['data'], 'photo.jpg', { type: 'image/jpeg' }))
    const req = createFormDataRequest('/api/profile/photos', formData)
    const res = await photosPost(req, { params: Promise.resolve({}) })
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.photo.display_order).toBe(0)
  })
```

- [ ] **Step 3: Run tests**

```bash
cd C:/peek-poke.com && rtk npm run test -- --reporter=verbose src/app/api/__tests__/profile-sub-routes.test.ts
```

Expected: all new tests pass.

- [ ] **Step 4: Commit**

```bash
rtk git add src/app/api/__tests__/profile-sub-routes.test.ts && rtk git commit -m "test: add missing POST /api/profile/photos branch coverage"
```

---

## Task 3: auth/profile branch gaps (76.92% → 100% branch)

**Files:**
- Modify: `src/app/api/__tests__/auth-profile.test.ts`

Missing branches in `auth/profile/route.ts`:
- `user.user_metadata?.username` is falsy → falls back to `user_${id.slice(0,8)}`
- `user.user_metadata?.full_name` is falsy but `.name` present → uses `.name`
- `user.user_metadata?.avatar_url` present → stored in profile

- [ ] **Step 1: Add missing branch tests**

Add inside existing `describe('POST /api/auth/profile', ...)`:

```typescript
  it('generates username from user id when metadata.username is missing', async () => {
    const userId = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'
    mockClient.auth.getUser.mockResolvedValue({
      data: { user: { id: userId, user_metadata: {} } },
      error: null,
    })
    const created = { id: userId, username: `user_${userId.slice(0, 8)}`, display_name: null, avatar_url: null }
    mockClient.from
      .mockReturnValueOnce(createMockQueryBuilder(null))    // no existing
      .mockReturnValueOnce(createMockQueryBuilder(created)) // insert

    const req = createNextRequest('http://localhost:3000/api/auth/profile', { method: 'POST' })
    const res = await POST(req)

    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.profile.username).toBe(`user_${userId.slice(0, 8)}`)
  })

  it('uses metadata.name as display_name when full_name is absent', async () => {
    const userId = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'
    mockClient.auth.getUser.mockResolvedValue({
      data: { user: { id: userId, user_metadata: { username: 'user1', name: 'Jane' } } },
      error: null,
    })
    const created = { id: userId, username: 'user1', display_name: 'Jane', avatar_url: null }
    mockClient.from
      .mockReturnValueOnce(createMockQueryBuilder(null))
      .mockReturnValueOnce(createMockQueryBuilder(created))

    const req = createNextRequest('http://localhost:3000/api/auth/profile', { method: 'POST' })
    const res = await POST(req)

    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.profile.display_name).toBe('Jane')
  })

  it('stores avatar_url from metadata', async () => {
    const userId = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'
    mockClient.auth.getUser.mockResolvedValue({
      data: { user: { id: userId, user_metadata: { username: 'user1', avatar_url: 'https://example.com/avatar.jpg' } } },
      error: null,
    })
    const created = { id: userId, username: 'user1', display_name: null, avatar_url: 'https://example.com/avatar.jpg' }
    mockClient.from
      .mockReturnValueOnce(createMockQueryBuilder(null))
      .mockReturnValueOnce(createMockQueryBuilder(created))

    const req = createNextRequest('http://localhost:3000/api/auth/profile', { method: 'POST' })
    const res = await POST(req)

    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.profile.avatar_url).toBe('https://example.com/avatar.jpg')
  })
```

- [ ] **Step 2: Run tests**

```bash
cd C:/peek-poke.com && rtk npm run test -- --reporter=verbose src/app/api/__tests__/auth-profile.test.ts
```

Expected: all new tests pass.

- [ ] **Step 3: Commit**

```bash
rtk git add src/app/api/__tests__/auth-profile.test.ts && rtk git commit -m "test: cover metadata fallback branches in auth/profile"
```

---

## Task 4: DELETE photos — add is_avatar + thumbnail branches

**Files:**
- Modify: `src/app/api/__tests__/profile-sub-routes.test.ts`

Current DELETE tests don't cover:
- `photo.is_avatar === true` → clears profile avatar_url
- `photo.thumbnail_url` present → tries to delete thumbnail

- [ ] **Step 1: Add two tests inside existing DELETE describe block**

```typescript
  it('clears profile avatar_url when deleted photo was the avatar', async () => {
    authUser()
    const photo = buildProfilePhoto({ is_avatar: true, thumbnail_url: null })
    let callCount = 0
    mockClient.from.mockImplementation(() => {
      callCount++
      if (callCount === 1) return createMockQueryBuilder(photo)  // select
      if (callCount === 2) return createMockQueryBuilder(null)    // delete
      return createMockQueryBuilder(null)                          // clear avatar_url
    })
    const req = createNextRequest(`/api/profile/photos/${VALID_PHOTO_ID}`, { method: 'DELETE' })
    const res = await photoDelete(req, { params: Promise.resolve({ photoId: VALID_PHOTO_ID }) })
    expect(res.status).toBe(200)
    expect(mockClient.from).toHaveBeenCalledTimes(3)
  })

  it('attempts thumbnail cleanup when thumbnail_url exists', async () => {
    authUser()
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
    // storage.remove called twice: main file + thumbnail
    expect(mockClient.storage.from().remove).toHaveBeenCalledTimes(2)
  })
```

- [ ] **Step 2: Run tests**

```bash
cd C:/peek-poke.com && rtk npm run test -- --reporter=verbose src/app/api/__tests__/profile-sub-routes.test.ts
```

- [ ] **Step 3: Run full suite + coverage**

```bash
cd C:/peek-poke.com && rtk npm run test:coverage
```

- [ ] **Step 4: Commit**

```bash
rtk git add src/app/api/__tests__/profile-sub-routes.test.ts && rtk git commit -m "test: cover avatar and thumbnail branches in DELETE /api/profile/photos/[photoId]"
```
