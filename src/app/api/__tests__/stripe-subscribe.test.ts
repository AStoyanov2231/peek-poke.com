import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMockSupabaseClient, createMockQueryBuilder } from '../../../../test/mocks/supabase'
import { createNextRequest } from '../../../../test/mocks/next'

vi.mock('next/headers', () => ({ headers: vi.fn(() => new Headers()), cookies: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn(), createServiceClient: vi.fn() }))

const mockStripe = vi.hoisted(() => ({
  customers: { create: vi.fn(() => Promise.resolve({ id: 'cus_test123' })) },
  checkout: { sessions: { create: vi.fn(() => Promise.resolve({ url: 'https://checkout.stripe.com/test' })) } },
  subscriptions: { retrieve: vi.fn(), create: vi.fn(() => Promise.resolve({ id: 'sub_test', status: 'active', latest_invoice: null })) },
  paymentMethods: { attach: vi.fn(() => Promise.resolve({})) },
  webhooks: { constructEvent: vi.fn() },
  billingPortal: { sessions: { create: vi.fn(() => Promise.resolve({ url: 'https://billing.stripe.com/test' })) } },
  prices: { retrieve: vi.fn(() => Promise.resolve({ unit_amount: 999, currency: 'usd' })) },
}))
vi.mock('@/lib/stripe', () => ({ stripe: mockStripe }))

const mockHasSubscriberRole = vi.hoisted(() => vi.fn(() => Promise.resolve(false)))
vi.mock('@/lib/auth', async () => {
  const actual = await vi.importActual<typeof import('@/lib/auth')>('@/lib/auth')
  return { ...actual, hasSubscriberRole: mockHasSubscriberRole }
})

import { POST } from '@/app/api/stripe/payment-method-subscribe/route'
import * as supabaseServer from '@/lib/supabase/server'

let mockClient: ReturnType<typeof createMockSupabaseClient>

beforeEach(() => {
  vi.clearAllMocks()
  process.env.STRIPE_PREMIUM_PRICE_ID = 'price_test123'
  process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3000'
  mockHasSubscriberRole.mockResolvedValue(false)
  mockClient = createMockSupabaseClient()
  vi.mocked(supabaseServer.createClient).mockResolvedValue(mockClient as never)
})

describe('POST /api/stripe/payment-method-subscribe', () => {
  it('returns 401 when not authenticated', async () => {
    mockClient.auth.getUser.mockResolvedValue({ data: { user: null }, error: null })

    const req = createNextRequest('http://localhost:3000/api/stripe/payment-method-subscribe', {
      method: 'POST',
      body: { paymentMethodId: 'pm_test123' },
    })
    const res = await POST(req)
    const json = await res.json()

    expect(res.status).toBe(401)
    expect(json.error).toBe('Unauthorized')
  })

  it('returns 500 when STRIPE_PREMIUM_PRICE_ID is not set', async () => {
    delete process.env.STRIPE_PREMIUM_PRICE_ID
    mockClient.auth.getUser.mockResolvedValue({
      data: { user: { id: 'user-123', email: 'test@example.com' } },
      error: null,
    })

    const req = createNextRequest('http://localhost:3000/api/stripe/payment-method-subscribe', {
      method: 'POST',
      body: { paymentMethodId: 'pm_test123' },
    })
    const res = await POST(req)
    const json = await res.json()

    expect(res.status).toBe(500)
    expect(json.error).toBe('Payment configuration error')
  })

  it('returns 400 when paymentMethodId is missing', async () => {
    mockClient.auth.getUser.mockResolvedValue({
      data: { user: { id: 'user-123', email: 'test@example.com' } },
      error: null,
    })

    const req = createNextRequest('http://localhost:3000/api/stripe/payment-method-subscribe', {
      method: 'POST',
      body: {},
    })
    const res = await POST(req)
    const json = await res.json()

    expect(res.status).toBe(400)
    expect(json.error).toBe('Missing paymentMethodId')
  })

  it('returns 400 when user is already premium', async () => {
    mockHasSubscriberRole.mockResolvedValueOnce(true)
    mockClient.auth.getUser.mockResolvedValue({
      data: { user: { id: 'user-123', email: 'test@example.com' } },
      error: null,
    })
    mockClient.from.mockReturnValue(
      createMockQueryBuilder({ stripe_customer_id: 'cus_existing' }, null)
    )

    const req = createNextRequest('http://localhost:3000/api/stripe/payment-method-subscribe', {
      method: 'POST',
      body: { paymentMethodId: 'pm_test123' },
    })
    const res = await POST(req)
    const json = await res.json()

    expect(res.status).toBe(400)
    expect(json.error).toBe('Already premium')
  })

  it('returns 404 when profile not found', async () => {
    mockClient.auth.getUser.mockResolvedValue({
      data: { user: { id: 'user-123', email: 'test@example.com' } },
      error: null,
    })
    mockClient.from.mockReturnValue(createMockQueryBuilder(null, { message: 'Not found' }))

    const req = createNextRequest('http://localhost:3000/api/stripe/payment-method-subscribe', {
      method: 'POST',
      body: { paymentMethodId: 'pm_test123' },
    })
    const res = await POST(req)
    const json = await res.json()

    expect(res.status).toBe(404)
    expect(json.error).toBe('Profile not found')
  })

  it('returns 200 with success when existing customer subscribes', async () => {
    mockClient.auth.getUser.mockResolvedValue({
      data: { user: { id: 'user-123', email: 'test@example.com' } },
      error: null,
    })
    mockClient.from.mockReturnValue(
      createMockQueryBuilder({ stripe_customer_id: 'cus_existing' }, null)
    )
    mockStripe.subscriptions.create.mockResolvedValueOnce({
      id: 'sub_test',
      status: 'active',
      latest_invoice: null,
    })

    const req = createNextRequest('http://localhost:3000/api/stripe/payment-method-subscribe', {
      method: 'POST',
      body: { paymentMethodId: 'pm_test123' },
    })
    const res = await POST(req)
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.success).toBe(true)
    expect(mockStripe.customers.create).not.toHaveBeenCalled()
    expect(mockStripe.paymentMethods.attach).toHaveBeenCalledWith('pm_test123', { customer: 'cus_existing' })
  })

  it('creates new customer when profile has no stripe_customer_id', async () => {
    mockClient.auth.getUser.mockResolvedValue({
      data: { user: { id: 'user-123', email: 'test@example.com' } },
      error: null,
    })
    mockClient.from
      .mockReturnValueOnce(createMockQueryBuilder({ stripe_customer_id: null }, null))
      .mockReturnValueOnce(createMockQueryBuilder(null, null))
    mockStripe.customers.create.mockResolvedValueOnce({ id: 'cus_new123' })
    mockStripe.subscriptions.create.mockResolvedValueOnce({
      id: 'sub_test',
      status: 'active',
      latest_invoice: null,
    })

    const req = createNextRequest('http://localhost:3000/api/stripe/payment-method-subscribe', {
      method: 'POST',
      body: { paymentMethodId: 'pm_test123' },
    })
    const res = await POST(req)
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.success).toBe(true)
    expect(mockStripe.customers.create).toHaveBeenCalledWith({
      email: 'test@example.com',
      metadata: { supabase_user_id: 'user-123' },
    })
  })

  it('returns clientSecret when subscription is incomplete (3DS required)', async () => {
    mockClient.auth.getUser.mockResolvedValue({
      data: { user: { id: 'user-123', email: 'test@example.com' } },
      error: null,
    })
    mockClient.from.mockReturnValue(
      createMockQueryBuilder({ stripe_customer_id: 'cus_existing' }, null)
    )
    mockStripe.subscriptions.create.mockResolvedValueOnce({
      id: 'sub_test',
      status: 'incomplete',
      latest_invoice: { payment_intent: { client_secret: 'pi_secret_test' } },
    })

    const req = createNextRequest('http://localhost:3000/api/stripe/payment-method-subscribe', {
      method: 'POST',
      body: { paymentMethodId: 'pm_test123' },
    })
    const res = await POST(req)
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.clientSecret).toBe('pi_secret_test')
    expect(json.success).toBeUndefined()
  })

  it('returns 500 when Stripe throws during subscription creation', async () => {
    mockClient.auth.getUser.mockResolvedValue({
      data: { user: { id: 'user-123', email: 'test@example.com' } },
      error: null,
    })
    mockClient.from.mockReturnValue(
      createMockQueryBuilder({ stripe_customer_id: 'cus_existing' }, null)
    )
    mockStripe.subscriptions.create.mockRejectedValueOnce(new Error('Stripe error'))

    const req = createNextRequest('http://localhost:3000/api/stripe/payment-method-subscribe', {
      method: 'POST',
      body: { paymentMethodId: 'pm_test123' },
    })
    const res = await POST(req)
    const json = await res.json()

    expect(res.status).toBe(500)
    expect(json.error).toBe('Failed to create subscription')
  })
})
