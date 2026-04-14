import { describe, it, expect } from 'vitest'
import { cn, getInitials } from '../utils'

describe('cn', () => {
  it('should merge multiple class strings', () => {
    expect(cn('foo', 'bar')).toBe('foo bar')
  })

  it('should handle conditional classes (truthy)', () => {
    expect(cn('foo', true && 'bar')).toBe('foo bar')
  })

  it('should handle conditional classes (falsy)', () => {
    expect(cn('foo', false && 'bar')).toBe('foo')
  })

  it('should resolve Tailwind conflicts (last wins)', () => {
    const result = cn('p-4', 'p-2')
    expect(result).toBe('p-2')
  })

  it('should handle empty string input', () => {
    expect(cn('')).toBe('')
  })

  it('should handle null and undefined inputs', () => {
    expect(cn(null, undefined, 'foo')).toBe('foo')
  })

  it('should handle no arguments', () => {
    expect(cn()).toBe('')
  })
})

describe('getInitials', () => {
  it('should return first 2 chars uppercased for "John Doe"', () => {
    // getInitials takes first 2 chars of the string, uppercased
    expect(getInitials('John Doe')).toBe('JO')
  })

  it('should return "??" for null', () => {
    expect(getInitials(null)).toBe('??')
  })

  it('should return "??" for undefined', () => {
    expect(getInitials(undefined)).toBe('??')
  })

  it('should return "??" for empty string', () => {
    expect(getInitials('')).toBe('??')
  })

  it('should return single char uppercased for single char input', () => {
    expect(getInitials('a')).toBe('A')
  })

  it('should uppercase the result', () => {
    expect(getInitials('alice')).toBe('AL')
  })

  it('should return first 2 chars for any string', () => {
    expect(getInitials('XY')).toBe('XY')
  })
})
