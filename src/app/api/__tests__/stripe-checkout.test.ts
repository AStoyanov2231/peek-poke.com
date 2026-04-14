import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMockSupabaseClient, createMockQueryBuilder } from '../../../../test/mocks/supabase'
import { createMockStripe } from '../../../../test/mocks/stripe'
import { createNextRequest } from '../../../../test/mocks/next'

vi.mock('next/headers', () => ({ headers: vi.fn(() => new Headers()), cookies: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn(), createServiceClient: vi.fn() }))

// vi.hoisted runs before imports — create the mock object inline
const mockStripe = vi.hoisted(() => ({
  customers: { create: vi.fn(() => Promise.resolve({ id: 'cus_test123' })) },
  checkout: { sessions: { create: vi.fn(() => Promise.resolve({ url: 'https://checkout.stripe.com/test' })) } },
  subscriptions: { retrieve: vi.fn() },
  webhooks: { constructEvent: vi.fn() },
  billingPortal: { sessions: { create: vi.fn() } },
}))
vi.mock('@/lib/stripe', () => ({ stripe: mockStripe }))

import { POST } from '@/app/api/stripe/checkout/route'
import * as supabaseServer from '@/lib/supabase/server'

let mockClient: ReturnType<typeof createMockSupabaseClient>

beforeEach(() => {
  vi.clearAllMocks()
  mockClient = createMockSupabaseClient()
  vi.mocked(supabaseServer.createClient).mockResolvedValue(mockClient as never)
  process.env.STRIPE_PREMIUM_PRICE_ID = 'price_test123'
  process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3000'
})

describe('POST /api/stripe/checkout', () => {
  it('creates checkout session successfully (new Stripe customer)', async () => {
    mockClient.auth.getUser.mockResolvedValue({
      data: { user: { id: 'user-123', email: 'test@example.com' } },
      error: null,
    })
    // first from() call: fetch profile (no existing customer)
    mockClient.from
      .mockReturnValueOnce(createMockQueryBuilder({ stripe_customer_id: null, username: 'testuser' }, null))
      // second from() call: update profile with new customer ID
      .mockReturnValueOnce(createMockQueryBuilder(null, null))
    // rpc: hasSubscriberRole -> false
    mockClient.rpc.mockResolvedValue({ data: false, error: null })

    mockStripe.customers.create.mockResolvedValue({ id: 'cus_new123' })
    mockStripe.checkout.sessions.create.mockResolvedValue({ url: 'https://checkout.stripe.com/test' })

    const req = createNextRequest('http://localhost:3000/api/stripe/checkout', { method: 'POST' })
    const res = await POST(req)
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.url).toBe('https://checkout.stripe.com/test')
    expect(mockStripe.customers.create).toHaveBeenCalled()
  })

  it('reuses existing Stripe customer ID', async () => {
    mockClient.auth.getUser.mockResolvedValue({
      data: { user: { id: 'user-123', email: 'test@example.com' } },
      error: null,
    })
    mockClient.from.mockReturnValue(
      createMockQueryBuilder({ stripe_customer_id: 'cus_existing', username: 'testuser' }, null)
    )
    mockClient.rpc.mockResolvedValue({ data: false, error: null })
    mockStripe.checkout.sessions.create.mockResolvedValue({ url: 'https://checkout.stripe.com/existing' })

    const req = createNextRequest('http://localhost:3000/api/stripe/checkout', { method: 'POST' })
    const res = await POST(req)
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.url).toBe('https://checkout.stripe.com/existing')
    expect(mockStripe.customers.create).not.toHaveBeenCalled()
  })

  it('returns 400 when user is already premium', async () => {
    mockClient.auth.getUser.mockResolvedValue({
      data: { user: { id: 'user-123', email: 'test@example.com' } },
      error: null,
    })
    mockClient.from.mockReturnValue(
      createMockQueryBuilder({ stripe_customer_id: 'cus_existing', username: 'testuser' }, null)
    )
    // hasSubscriberRole -> true
    mockClient.rpc.mockResolvedValue({ data: true, error: null })

    const req = createNextRequest('http://localhost:3000/api/stripe/checkout', { method: 'POST' })
    const res = await POST(req)
    const json = await res.json()

    expect(res.status).toBe(400)
    expect(json.error).toBe('Already premium')
  })

  it('returns 500 when STRIPE_PREMIUM_PRICE_ID env missing', async () => {
    delete process.env.STRIPE_PREMIUM_PRICE_ID
    mockClient.auth.getUser.mockResolvedValue({
      data: { user: { id: 'user-123', email: 'test@example.com' } },
      error: null,
    })

    const req = createNextRequest('http://localhost:3000/api/stripe/checkout', { method: 'POST' })
    const res = await POST(req)
    const json = await res.json()

    expect(res.status).toBe(500)
    expect(json.error).toBeDefined()
  })

  it('returns 404 when profile not found', async () => {
    mockClient.auth.getUser.mockResolvedValue({
      data: { user: { id: 'user-123', email: 'test@example.com' } },
      error: null,
    })
    mockClient.from.mockReturnValue(createMockQueryBuilder(null, { message: 'Not found' }))

    const req = createNextRequest('http://localhost:3000/api/stripe/checkout', { method: 'POST' })
    const res = await POST(req)
    const json = await res.json()

    expect(res.status).toBe(404)
    expect(json.error).toBe('Profile not found')
  })

  it('returns 500 on Stripe API error', async () => {
    mockClient.auth.getUser.mockResolvedValue({
      data: { user: { id: 'user-123', email: 'test@example.com' } },
      error: null,
    })
    mockClient.from.mockReturnValue(
      createMockQueryBuilder({ stripe_customer_id: 'cus_existing', username: 'testuser' }, null)
    )
    mockClient.rpc.mockResolvedValue({ data: false, error: null })
    mockStripe.checkout.sessions.create.mockRejectedValue(new Error('Stripe API error'))

    const req = createNextRequest('http://localhost:3000/api/stripe/checkout', { method: 'POST' })
    const res = await POST(req)
    const json = await res.json()

    expect(res.status).toBe(500)
    expect(json.error).toBeDefined()
  })

  it('returns 401 when not authenticated', async () => {
    mockClient.auth.getUser.mockResolvedValue({ data: { user: null }, error: null })

    const req = createNextRequest('http://localhost:3000/api/stripe/checkout', { method: 'POST' })
    const res = await POST(req)
    const json = await res.json()

    expect(res.status).toBe(401)
    expect(json.error).toBe('Unauthorized')
  })
})
