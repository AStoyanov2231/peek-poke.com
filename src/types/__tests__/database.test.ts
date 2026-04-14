import { describe, it, expect } from 'vitest'
import { hasRole, isPremium } from '../database'
import type { Profile } from '../database'

function makeProfile(roles: string[]): Profile {
  return {
    id: 'test-id',
    username: 'testuser',
    display_name: null,
    bio: null,
    avatar_url: null,
    location_text: null,
    is_online: false,
    last_seen_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    stripe_customer_id: null,
    onboarding_completed: true,
    roles: roles as Profile['roles'],
  }
}

describe('hasRole', () => {
  it('should return true when profile has the specified role', () => {
    expect(hasRole(makeProfile(['user', 'subscriber']), 'subscriber')).toBe(true)
  })

  it('should return false when profile does not have the specified role', () => {
    expect(hasRole(makeProfile(['user']), 'moderator')).toBe(false)
  })

  it('should return false for null profile', () => {
    expect(hasRole(null, 'user')).toBe(false)
  })

  it('should return false for undefined profile', () => {
    expect(hasRole(undefined, 'user')).toBe(false)
  })

  it('should return false for empty roles array', () => {
    expect(hasRole(makeProfile([]), 'user')).toBe(false)
  })

  it('should return true when profile has the target role among multiple roles', () => {
    expect(hasRole(makeProfile(['user', 'moderator', 'subscriber']), 'moderator')).toBe(true)
  })
})

describe('isPremium', () => {
  it('should return true for profile with "subscriber" role', () => {
    expect(isPremium(makeProfile(['user', 'subscriber']))).toBe(true)
  })

  it('should return false for profile without "subscriber" role', () => {
    expect(isPremium(makeProfile(['user']))).toBe(false)
  })

  it('should return false for null profile', () => {
    expect(isPremium(null)).toBe(false)
  })
})
