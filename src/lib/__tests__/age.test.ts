import { describe, it, expect } from 'vitest'
import { calculateAge } from '@/lib/age'

describe('calculateAge', () => {
  it('returns correct age for birthday already passed this year', () => {
    const result = calculateAge('2000-01-01', new Date('2026-04-27'))
    expect(result).toBe(26)
  })

  it('returns correct age for birthday not yet this year', () => {
    const result = calculateAge('2000-12-31', new Date('2026-04-27'))
    expect(result).toBe(25)
  })

  it('returns 17 for someone born 2008-12-31 on 2026-04-27', () => {
    const result = calculateAge('2008-12-31', new Date('2026-04-27'))
    expect(result).toBe(17)
  })

  it('returns 18 for someone born 2008-04-27 on their birthday 2026-04-27', () => {
    const result = calculateAge('2008-04-27', new Date('2026-04-27'))
    expect(result).toBe(18)
  })

  it('returns 17 for someone born 2008-04-28 one day before their 18th birthday', () => {
    const result = calculateAge('2008-04-28', new Date('2026-04-27'))
    expect(result).toBe(17)
  })
})
