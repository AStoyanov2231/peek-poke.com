import { describe, it, expect } from 'vitest'
import { haversineKm, formatDistance } from '../geo'

describe('haversineKm', () => {
  it('should return 0 for identical coordinates', () => {
    expect(haversineKm(40.7128, -74.006, 40.7128, -74.006)).toBe(0)
  })

  it('should return ~3944km for NYC to LA', () => {
    const dist = haversineKm(40.7128, -74.006, 34.0522, -118.2437)
    expect(dist).toBeGreaterThan(3894)
    expect(dist).toBeLessThan(3994)
  })

  it('should return ~343km for London to Paris', () => {
    const dist = haversineKm(51.5074, -0.1278, 48.8566, 2.3522)
    expect(dist).toBeGreaterThan(323)
    expect(dist).toBeLessThan(363)
  })

  it('should return ~20015km for antipodal points', () => {
    const dist = haversineKm(0, 0, 0, 180)
    expect(dist).toBeGreaterThan(20000)
    expect(dist).toBeLessThan(20040)
  })

  it('should be commutative (a→b === b→a)', () => {
    const ab = haversineKm(51.5074, -0.1278, 48.8566, 2.3522)
    const ba = haversineKm(48.8566, 2.3522, 51.5074, -0.1278)
    expect(ab).toBeCloseTo(ba, 6)
  })

  it('should work with negative coordinates', () => {
    // Sydney to Buenos Aires
    const dist = haversineKm(-33.8688, 151.2093, -34.6037, -58.3816)
    expect(dist).toBeGreaterThan(11700)
    expect(dist).toBeLessThan(11900)
  })
})

describe('formatDistance', () => {
  it('should show meters when distance is less than 1km', () => {
    // Two very close points ~100m apart
    const result = formatDistance(48.8566, 2.3522, 48.8575, 2.3522)
    expect(result).toMatch(/m away$/)
    expect(result).not.toMatch(/km away$/)
  })

  it('should show km when distance is 1km or more', () => {
    // London to Paris (~343km)
    const result = formatDistance(51.5074, -0.1278, 48.8566, 2.3522)
    expect(result).toMatch(/km away$/)
  })

  it('should return "0 m away" for identical coordinates', () => {
    expect(formatDistance(40.7128, -74.006, 40.7128, -74.006)).toBe('0 m away')
  })

  it('should format km with one decimal place', () => {
    const result = formatDistance(51.5074, -0.1278, 48.8566, 2.3522)
    expect(result).toMatch(/^\d+\.\d km away$/)
  })
})
