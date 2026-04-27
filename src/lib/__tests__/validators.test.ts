import { describe, it, expect } from 'vitest'
import {
  usernameSchema,
  profileUpdateSchema,
  datingProfileSchema,
  profilePatchSchema,
  friendRequestSchema,
  dmThreadCreateSchema,
  dmMessageSchema,
  dmMessageEditSchema,
  moderationActionSchema,
  photoUpdateSchema,
  parseBody,
} from '../validators'

const VALID_UUID = '550e8400-e29b-41d4-a716-446655440000'
const VALID_MEDIA_URL = 'https://ttojvnwpnpuhkyjncwxn.supabase.co/storage/v1/object/public/avatars/test.jpg'

describe('usernameSchema', () => {
  it('should pass for a valid username', () => {
    expect(usernameSchema.safeParse({ username: 'valid_user' }).success).toBe(true)
  })

  it('should fail when username is less than 3 characters', () => {
    expect(usernameSchema.safeParse({ username: 'ab' }).success).toBe(false)
  })

  it('should fail when username exceeds 20 characters', () => {
    expect(usernameSchema.safeParse({ username: 'a'.repeat(21) }).success).toBe(false)
  })

  it('should fail when username contains spaces', () => {
    expect(usernameSchema.safeParse({ username: 'invalid user' }).success).toBe(false)
  })

  it('should fail when username contains special chars like @', () => {
    expect(usernameSchema.safeParse({ username: 'user@name' }).success).toBe(false)
  })

  it('should pass when username contains underscores', () => {
    expect(usernameSchema.safeParse({ username: 'user_name_123' }).success).toBe(true)
  })

  it('should pass for all-numeric username', () => {
    expect(usernameSchema.safeParse({ username: '12345' }).success).toBe(true)
  })

  it('should pass for 3-character username', () => {
    expect(usernameSchema.safeParse({ username: 'abc' }).success).toBe(true)
  })
})

describe('profileUpdateSchema', () => {
  it('should pass for a valid partial update', () => {
    expect(profileUpdateSchema.safeParse({ display_name: 'Alice' }).success).toBe(true)
  })

  it('should pass for an empty object', () => {
    expect(profileUpdateSchema.safeParse({}).success).toBe(true)
  })

  it('should fail when display_name exceeds 50 characters', () => {
    expect(profileUpdateSchema.safeParse({ display_name: 'a'.repeat(51) }).success).toBe(false)
  })

  it('should fail when bio exceeds 500 characters', () => {
    expect(profileUpdateSchema.safeParse({ bio: 'a'.repeat(501) }).success).toBe(false)
  })

  it('should fail when location_text exceeds 100 characters', () => {
    expect(profileUpdateSchema.safeParse({ location_text: 'a'.repeat(101) }).success).toBe(false)
  })

  it('should fail for an invalid avatar_url (wrong host)', () => {
    expect(profileUpdateSchema.safeParse({ avatar_url: 'https://evil.com/image.jpg' }).success).toBe(false)
  })

  it('should pass for a valid https Supabase avatar_url', () => {
    expect(profileUpdateSchema.safeParse({ avatar_url: VALID_MEDIA_URL }).success).toBe(true)
  })

  it('should fail when unknown fields are provided (strict mode)', () => {
    expect(profileUpdateSchema.safeParse({ unknown_field: 'value' }).success).toBe(false)
  })
})

describe('friendRequestSchema', () => {
  it('should pass for a valid UUID', () => {
    expect(friendRequestSchema.safeParse({ addressee_id: VALID_UUID }).success).toBe(true)
  })

  it('should fail for a non-UUID string', () => {
    expect(friendRequestSchema.safeParse({ addressee_id: 'not-a-uuid' }).success).toBe(false)
  })

  it('should fail when field is missing', () => {
    expect(friendRequestSchema.safeParse({}).success).toBe(false)
  })
})

describe('dmThreadCreateSchema', () => {
  it('should pass for a valid UUID', () => {
    expect(dmThreadCreateSchema.safeParse({ user_id: VALID_UUID }).success).toBe(true)
  })

  it('should fail for an invalid UUID', () => {
    expect(dmThreadCreateSchema.safeParse({ user_id: 'bad-id' }).success).toBe(false)
  })
})

describe('dmMessageSchema', () => {
  it('should pass for a valid text message', () => {
    expect(dmMessageSchema.safeParse({ content: 'Hello!' }).success).toBe(true)
  })

  it('should fail for empty content', () => {
    expect(dmMessageSchema.safeParse({ content: '' }).success).toBe(false)
  })

  it('should fail for content exceeding 4000 characters', () => {
    expect(dmMessageSchema.safeParse({ content: 'a'.repeat(4001) }).success).toBe(false)
  })

  it('should trim whitespace from content', () => {
    const result = dmMessageSchema.safeParse({ content: '  hello  ' })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.content).toBe('hello')
  })

  it('should fail for whitespace-only content', () => {
    expect(dmMessageSchema.safeParse({ content: '   ' }).success).toBe(false)
  })

  it('should default message_type to "text"', () => {
    const result = dmMessageSchema.safeParse({ content: 'Hello' })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.message_type).toBe('text')
  })

  it('should accept "image" as message_type', () => {
    const result = dmMessageSchema.safeParse({ content: 'img', message_type: 'image' })
    expect(result.success).toBe(true)
  })

  it('should fail for invalid media_url', () => {
    expect(dmMessageSchema.safeParse({ content: 'img', media_url: 'https://evil.com/img.jpg' }).success).toBe(false)
  })
})

describe('dmMessageEditSchema', () => {
  it('should pass for valid content', () => {
    expect(dmMessageEditSchema.safeParse({ content: 'Updated message' }).success).toBe(true)
  })

  it('should trim content', () => {
    const result = dmMessageEditSchema.safeParse({ content: '  edited  ' })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.content).toBe('edited')
  })

  it('should fail for empty or whitespace-only content', () => {
    expect(dmMessageEditSchema.safeParse({ content: '' }).success).toBe(false)
    expect(dmMessageEditSchema.safeParse({ content: '   ' }).success).toBe(false)
  })
})

describe('moderationActionSchema', () => {
  it('should pass for "approve" action', () => {
    expect(moderationActionSchema.safeParse({ action: 'approve' }).success).toBe(true)
  })

  it('should pass for "reject" with a reason', () => {
    expect(moderationActionSchema.safeParse({ action: 'reject', reason: 'Inappropriate content' }).success).toBe(true)
  })

  it('should fail for "reject" without a reason', () => {
    expect(moderationActionSchema.safeParse({ action: 'reject' }).success).toBe(false)
  })

  it('should fail for an invalid action', () => {
    expect(moderationActionSchema.safeParse({ action: 'delete' }).success).toBe(false)
  })

  it('should fail for "reject" with whitespace-only reason', () => {
    expect(moderationActionSchema.safeParse({ action: 'reject', reason: '   ' }).success).toBe(false)
  })
})

describe('photoUpdateSchema', () => {
  it('should pass for valid integer display_order', () => {
    expect(photoUpdateSchema.safeParse({ display_order: 3 }).success).toBe(true)
  })

  it('should pass for boolean is_avatar', () => {
    expect(photoUpdateSchema.safeParse({ is_avatar: true }).success).toBe(true)
  })

  it('should fail for non-integer display_order', () => {
    expect(photoUpdateSchema.safeParse({ display_order: 1.5 }).success).toBe(false)
  })
})

describe('datingProfileSchema', () => {
  // DOB relative to 2026-04-27 (current date per env): clearly adult
  const adultDob = '2000-01-01'
  // DOB relative to 2026-04-27: clearly minor
  const minorDob = '2020-01-01'

  it('should pass for adult DOB', () => {
    expect(datingProfileSchema.safeParse({ date_of_birth: adultDob }).success).toBe(true)
  })

  it('should fail for minor DOB', () => {
    expect(datingProfileSchema.safeParse({ date_of_birth: minorDob }).success).toBe(false)
  })

  it('should fail for invalid date format', () => {
    expect(datingProfileSchema.safeParse({ date_of_birth: '01-01-2000' }).success).toBe(false)
  })

  it('should pass for all valid gender values', () => {
    const genders = ['man', 'woman', 'non_binary', 'other'] as const
    for (const g of genders) {
      expect(datingProfileSchema.safeParse({ gender: g }).success).toBe(true)
    }
  })

  it('should fail for invalid gender string', () => {
    expect(datingProfileSchema.safeParse({ gender: 'alien' }).success).toBe(false)
  })

  it('should pass for all valid orientation values', () => {
    const orientations = ['straight', 'gay', 'lesbian', 'bisexual', 'pansexual', 'other'] as const
    for (const o of orientations) {
      expect(datingProfileSchema.safeParse({ orientation: o }).success).toBe(true)
    }
  })

  it('should fail for invalid orientation string', () => {
    expect(datingProfileSchema.safeParse({ orientation: 'confused' }).success).toBe(false)
  })

  it('should pass for height_cm in valid range (120-230)', () => {
    expect(datingProfileSchema.safeParse({ height_cm: 170 }).success).toBe(true)
    expect(datingProfileSchema.safeParse({ height_cm: 120 }).success).toBe(true)
    expect(datingProfileSchema.safeParse({ height_cm: 230 }).success).toBe(true)
  })

  it('should fail for height_cm below 120', () => {
    expect(datingProfileSchema.safeParse({ height_cm: 119 }).success).toBe(false)
  })

  it('should fail for height_cm above 230', () => {
    expect(datingProfileSchema.safeParse({ height_cm: 231 }).success).toBe(false)
  })

  it('should pass for height_cm null', () => {
    expect(datingProfileSchema.safeParse({ height_cm: null }).success).toBe(true)
  })

  it('should pass for empty object (all fields optional)', () => {
    expect(datingProfileSchema.safeParse({}).success).toBe(true)
  })
})

describe('profilePatchSchema', () => {
  it('should accept base profile fields', () => {
    expect(profilePatchSchema.safeParse({ display_name: 'Alice' }).success).toBe(true)
  })

  it('should accept dating profile fields', () => {
    expect(profilePatchSchema.safeParse({ gender: 'woman', orientation: 'straight' }).success).toBe(true)
  })

  it('should accept combined base + dating fields', () => {
    expect(
      profilePatchSchema.safeParse({ display_name: 'Alice', gender: 'woman', height_cm: 165 }).success
    ).toBe(true)
  })

  it('should reject unknown fields (strict mode)', () => {
    expect(profilePatchSchema.safeParse({ unknown_field: 'value' }).success).toBe(false)
  })
})

describe('parseBody', () => {
  it('should return parsed data for valid JSON matching schema', async () => {
    const request = new Request('http://localhost', {
      method: 'POST',
      body: JSON.stringify({ addressee_id: VALID_UUID }),
      headers: { 'Content-Type': 'application/json' },
    })
    const [data, errorResp] = await parseBody(request, friendRequestSchema)
    expect(data).toEqual({ addressee_id: VALID_UUID })
    expect(errorResp).toBeNull()
  })

  it('should return 400 Response for invalid JSON body', async () => {
    const request = new Request('http://localhost', {
      method: 'POST',
      body: 'not json{{{',
      headers: { 'Content-Type': 'application/json' },
    })
    const [data, errorResp] = await parseBody(request, friendRequestSchema)
    expect(data).toBeNull()
    expect(errorResp?.status).toBe(400)
  })

  it('should return 400 Response when schema validation fails', async () => {
    const request = new Request('http://localhost', {
      method: 'POST',
      body: JSON.stringify({ addressee_id: 'not-a-uuid' }),
      headers: { 'Content-Type': 'application/json' },
    })
    const [data, errorResp] = await parseBody(request, friendRequestSchema)
    expect(data).toBeNull()
    expect(errorResp?.status).toBe(400)
  })

  it('should include Zod error message in the response body', async () => {
    const request = new Request('http://localhost', {
      method: 'POST',
      body: JSON.stringify({ addressee_id: 'bad' }),
      headers: { 'Content-Type': 'application/json' },
    })
    const [, errorResp] = await parseBody(request, friendRequestSchema)
    const body = await errorResp?.json()
    expect(body).toHaveProperty('error')
    expect(typeof body.error).toBe('string')
  })

  it('should handle malformed body gracefully', async () => {
    const request = new Request('http://localhost', {
      method: 'POST',
      body: '}{invalid',
      headers: { 'Content-Type': 'application/json' },
    })
    const [data, errorResp] = await parseBody(request, friendRequestSchema)
    expect(data).toBeNull()
    expect(errorResp?.status).toBe(400)
  })
})
