import { describe, it, expect } from 'vitest'
import { isValidUUID, isValidMediaUrl } from '../validation'

describe('isValidUUID', () => {
  it('should return true for a valid v4 UUID', () => {
    expect(isValidUUID('550e8400-e29b-41d4-a716-446655440000')).toBe(true)
  })

  it('should return true for an uppercase UUID', () => {
    expect(isValidUUID('550E8400-E29B-41D4-A716-446655440000')).toBe(true)
  })

  it('should return false for empty string', () => {
    expect(isValidUUID('')).toBe(false)
  })

  it('should return false for partial UUID', () => {
    expect(isValidUUID('550e8400-e29b-41d4')).toBe(false)
  })

  it('should return false for wrong length UUID', () => {
    expect(isValidUUID('550e8400-e29b-41d4-a716-4466554400')).toBe(false)
  })

  it('should return false for UUID with invalid characters', () => {
    expect(isValidUUID('550e8400-e29b-41d4-a716-44665544000z')).toBe(false)
  })

  it('should return false for UUID without hyphens', () => {
    expect(isValidUUID('550e8400e29b41d4a716446655440000')).toBe(false)
  })
})

describe('isValidMediaUrl', () => {
  const VALID_HOST = 'ttojvnwpnpuhkyjncwxn.supabase.co'

  it('should return true for a valid Supabase storage URL', () => {
    expect(isValidMediaUrl(`https://${VALID_HOST}/storage/v1/object/public/avatars/test.jpg`)).toBe(true)
  })

  it('should return false for non-HTTPS URL', () => {
    expect(isValidMediaUrl(`http://${VALID_HOST}/storage/v1/object/public/avatars/test.jpg`)).toBe(false)
  })

  it('should return false for wrong host', () => {
    expect(isValidMediaUrl('https://other.supabase.co/storage/v1/object/public/test.jpg')).toBe(false)
  })

  it('should return false for empty string', () => {
    expect(isValidMediaUrl('')).toBe(false)
  })

  it('should return false for javascript: protocol', () => {
    expect(isValidMediaUrl('javascript:alert(1)')).toBe(false)
  })

  it('should return false for a plain non-URL string', () => {
    expect(isValidMediaUrl('not-a-url')).toBe(false)
  })
})
