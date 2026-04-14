import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMockSupabaseClient, createMockQueryBuilder } from '../../../../test/mocks/supabase'
import { createNextRequest } from '../../../../test/mocks/next'

vi.mock('next/headers', () => ({ headers: vi.fn(() => new Headers()), cookies: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn(), createServiceClient: vi.fn() }))

const mockStripe = vi.hoisted(() => ({
  customers: { create: vi.fn(() => Promise.resolve({ id: 'cus_test123' })) },
  checkout: { sessions: { create: vi.fn(() => Promise.resolve({ url: 'https://checkout.stripe.com/test' })) } },
  subscriptions: { retrieve: vi.fn(), create: vi.fn() },
  paymentMethods: { attach: vi.fn(() => Promise.resolve({})) },
  webhooks: { constructEvent: vi.fn() },
  billingPortal: { sessions: { create: vi.fn(() => Promise.resolve({ url: 'https://billing.stripe.com/test' })) } },
  prices: { retrieve: vi.fn(() => Promise.resolve({ unit_amount: 999, currency: 'usd' })) },
}))
vi.mock('@/lib/stripe', () => ({ stripe: mockStripe }))

import { POST } from '@/app/api/stripe/portal/route'
import * as supabaseServer from '@/lib/supabase/server'

let mockClient: ReturnType<typeof createMockSupabaseClient>

beforeEach(() => {
  vi.clearAllMocks()
  process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3000'
  mockClient = createMockSupabaseClient()
  vi.mocked(supabaseServer.createClient).mockResolvedValue(mockClient as never)
})

describe('POST /api/stripe/portal', () => {
  it('returns 401 when not authenticated', async () => {
    mockClient.auth.getUser.mockResolvedValue({ data: { user: null }, error: null })

    const req = createNextRequest('http://localhost:3000/api/stripe/portal', { method: 'POST' })
    const res = await POST(req)
    const json = await res.json()

    expect(res.status).toBe(401)
    expect(json.error).toBe('Unauthorized')
  })

  it('returns 500 when DB query errors', async () => {
    mockClient.auth.getUser.mockResolvedValue({
      data: { user: { id: 'user-123', email: 'test@example.com' } },
      error: null,
    })
    mockClient.from.mockReturnValue(
      createMockQueryBuilder(null, { message: 'DB error' })
    )

    const req = createNextRequest('http://localhost:3000/api/stripe/portal', { method: 'POST' })
    const res = await POST(req)
    const json = await res.json()

    expect(res.status).toBe(500)
    expect(json.error).toBe('Failed to look up subscription')
  })

  it('returns 400 when no subscription found (null data)', async () => {
    mockClient.auth.getUser.mockResolvedValue({
      data: { user: { id: 'user-123', email: 'test@example.com' } },
      error: null,
    })
    mockClient.from.mockReturnValue(createMockQueryBuilder(null, null))

    const req = createNextRequest('http://localhost:3000/api/stripe/portal', { method: 'POST' })
    const res = await POST(req)
    const json = await res.json()

    expect(res.status).toBe(400)
    expect(json.error).toBe('No subscription found')
  })

  it('returns 400 when subscription has no stripe_customer_id', async () => {
    mockClient.auth.getUser.mockResolvedValue({
      data: { user: { id: 'user-123', email: 'test@example.com' } },
      error: null,
    })
    mockClient.from.mockReturnValue(
      createMockQueryBuilder({ stripe_customer_id: null }, null)
    )

    const req = createNextRequest('http://localhost:3000/api/stripe/portal', { method: 'POST' })
    const res = await POST(req)
    const json = await res.json()

    expect(res.status).toBe(400)
    expect(json.error).toBe('No subscription found')
  })

  it('returns 500 when Stripe throws', async () => {
    mockClient.auth.getUser.mockResolvedValue({
      data: { user: { id: 'user-123', email: 'test@example.com' } },
      error: null,
    })
    mockClient.from.mockReturnValue(
      createMockQueryBuilder({ stripe_customer_id: 'cus_test123' }, null)
    )
    mockStripe.billingPortal.sessions.create.mockRejectedValueOnce(new Error('Stripe error'))

    const req = createNextRequest('http://localhost:3000/api/stripe/portal', { method: 'POST' })
    const res = await POST(req)
    const json = await res.json()

    expect(res.status).toBe(500)
    expect(json.error).toBe('Internal server error')
  })

  it('returns 200 with portal url on success', async () => {
    mockClient.auth.getUser.mockResolvedValue({
      data: { user: { id: 'user-123', email: 'test@example.com' } },
      error: null,
    })
    mockClient.from.mockReturnValue(
      createMockQueryBuilder({ stripe_customer_id: 'cus_test123' }, null)
    )
    mockStripe.billingPortal.sessions.create.mockResolvedValueOnce({
      url: 'https://billing.stripe.com/test',
    })

    const req = createNextRequest('http://localhost:3000/api/stripe/portal', { method: 'POST' })
    const res = await POST(req)
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.url).toBe('https://billing.stripe.com/test')
    expect(mockStripe.billingPortal.sessions.create).toHaveBeenCalledWith({
      customer: 'cus_test123',
      return_url: 'http://localhost:3000/profile',
    })
  })
})
