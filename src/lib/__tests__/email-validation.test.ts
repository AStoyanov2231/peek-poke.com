import { describe, it, expect } from 'vitest'
import { validateEmail, isValidEmailFormat } from '../email-validation'

describe('validateEmail', () => {
  it('should return valid for a proper email address', () => {
    const result = validateEmail('user@gmail.com')
    expect(result.isValid).toBe(true)
  })

  it('should return invalid for empty string', () => {
    const result = validateEmail('')
    expect(result.isValid).toBe(false)
    expect(result.error).toMatch(/required/i)
  })

  it('should return invalid when there is no @ symbol', () => {
    const result = validateEmail('notanemail')
    expect(result.isValid).toBe(false)
  })

  it('should detect gmial.com typo and suggest gmail.com', () => {
    const result = validateEmail('user@gmial.com')
    expect(result.isValid).toBe(false)
    expect(result.suggestion).toBe('user@gmail.com')
    expect(result.error).toMatch(/gmail\.com/)
  })

  it('should detect gmail.con typo and suggest gmail.com', () => {
    const result = validateEmail('user@gmail.con')
    expect(result.isValid).toBe(false)
    expect(result.suggestion).toBe('user@gmail.com')
  })

  it('should detect yaho.com typo and suggest yahoo.com', () => {
    const result = validateEmail('user@yaho.com')
    expect(result.isValid).toBe(false)
    expect(result.suggestion).toBe('user@yahoo.com')
  })

  it('should detect hotmial.com typo and suggest hotmail.com', () => {
    const result = validateEmail('user@hotmial.com')
    expect(result.isValid).toBe(false)
    expect(result.suggestion).toBe('user@hotmail.com')
  })

  it('should detect outlok.com typo and suggest outlook.com', () => {
    const result = validateEmail('user@outlok.com')
    expect(result.isValid).toBe(false)
    expect(result.suggestion).toBe('user@outlook.com')
  })

  it('should detect iclod.com typo and suggest icloud.com', () => {
    const result = validateEmail('user@iclod.com')
    expect(result.isValid).toBe(false)
    expect(result.suggestion).toBe('user@icloud.com')
  })

  it('should block disposable domain tempmail.com', () => {
    const result = validateEmail('user@tempmail.com')
    expect(result.isValid).toBe(false)
    expect(result.error).toMatch(/disposable/i)
  })

  it('should block disposable domain yopmail.com', () => {
    const result = validateEmail('user@yopmail.com')
    expect(result.isValid).toBe(false)
    expect(result.error).toMatch(/disposable/i)
  })

  it('should return invalid for email longer than 254 characters', () => {
    const localPart = 'a'.repeat(200)
    const result = validateEmail(`${localPart}@gmail.com`)
    expect(result.isValid).toBe(false)
    expect(result.error).toMatch(/too long/i)
  })

  it('should normalize email to lowercase', () => {
    const result = validateEmail('User@Gmail.COM')
    expect(result.isValid).toBe(true)
  })

  it('should trim whitespace before validating', () => {
    const result = validateEmail('  user@gmail.com  ')
    expect(result.isValid).toBe(true)
  })

  it('should return invalid for whitespace-only input', () => {
    const result = validateEmail('   ')
    expect(result.isValid).toBe(false)
    expect(result.error).toMatch(/required/i)
  })
})

describe('isValidEmailFormat', () => {
  it('should return true for a standard valid email', () => {
    expect(isValidEmailFormat('user@example.com')).toBe(true)
  })

  it('should return false for email without domain', () => {
    expect(isValidEmailFormat('user@')).toBe(false)
  })

  it('should return false for email without @', () => {
    expect(isValidEmailFormat('userexample.com')).toBe(false)
  })

  it('should return true for email with subdomain', () => {
    expect(isValidEmailFormat('user@mail.example.co.uk')).toBe(true)
  })

  it('should return false for empty string', () => {
    expect(isValidEmailFormat('')).toBe(false)
  })
})
