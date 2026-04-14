import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockStripe = vi.hoisted(() => ({
  prices: { retrieve: vi.fn(() => Promise.resolve({ unit_amount: 999, currency: 'usd' })) },
}))
vi.mock('@/lib/stripe', () => ({ stripe: mockStripe }))

import { GET } from '@/app/api/stripe/price/route'

beforeEach(() => {
  vi.clearAllMocks()
  process.env.STRIPE_PREMIUM_PRICE_ID = 'price_test123'
})

describe('GET /api/stripe/price', () => {
  it('returns 500 when STRIPE_PREMIUM_PRICE_ID is not set', async () => {
    delete process.env.STRIPE_PREMIUM_PRICE_ID

    const res = await GET()
    const json = await res.json()

    expect(res.status).toBe(500)
    expect(json.error).toBe('Payment not configured')
  })

  it('returns 500 when stripe.prices.retrieve throws', async () => {
    mockStripe.prices.retrieve.mockRejectedValueOnce(new Error('Stripe error'))

    const res = await GET()
    const json = await res.json()

    expect(res.status).toBe(500)
    expect(json.error).toBe('Failed to fetch price')
  })

  it('returns 200 with amount and currency on success', async () => {
    mockStripe.prices.retrieve.mockResolvedValueOnce({ unit_amount: 999, currency: 'usd' })

    const res = await GET()
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.amount).toBe(999)
    expect(json.currency).toBe('usd')
    expect(mockStripe.prices.retrieve).toHaveBeenCalledWith('price_test123')
  })

  it('uses 999 fallback when unit_amount is null', async () => {
    mockStripe.prices.retrieve.mockResolvedValueOnce({ unit_amount: null, currency: 'eur' })

    const res = await GET()
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.amount).toBe(999)
    expect(json.currency).toBe('eur')
  })
})
