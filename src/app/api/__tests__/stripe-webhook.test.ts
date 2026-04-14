import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMockSupabaseClient } from '../../../../test/mocks/supabase'
import { createMockStripe } from '../../../../test/mocks/stripe'
import { NextRequest } from 'next/server'

vi.mock('next/headers', () => ({ headers: vi.fn(() => new Headers()), cookies: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn(), createServiceClient: vi.fn() }))

const mockStripe = vi.hoisted(() => ({
  customers: { create: vi.fn() },
  checkout: { sessions: { create: vi.fn() } },
  subscriptions: { retrieve: vi.fn() },
  webhooks: { constructEvent: vi.fn() },
  billingPortal: { sessions: { create: vi.fn() } },
}))
vi.mock('@/lib/stripe', () => ({ stripe: mockStripe }))

const { handleCheckoutCompleted, handleSubscriptionUpdated, handleSubscriptionDeleted } = vi.hoisted(() => ({
  handleCheckoutCompleted: vi.fn(() => Promise.resolve(null)),
  handleSubscriptionUpdated: vi.fn(() => Promise.resolve(null)),
  handleSubscriptionDeleted: vi.fn(() => Promise.resolve(null)),
}))
vi.mock('@/lib/stripe-webhook', () => ({
  handleCheckoutCompleted,
  handleSubscriptionUpdated,
  handleSubscriptionDeleted,
}))

import { POST } from '@/app/api/stripe/webhook/route'
import * as supabaseServer from '@/lib/supabase/server'

let mockServiceClient: ReturnType<typeof createMockSupabaseClient>

beforeEach(() => {
  vi.clearAllMocks()
  mockServiceClient = createMockSupabaseClient()
  vi.mocked(supabaseServer.createServiceClient).mockReturnValue(mockServiceClient as never)
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test'
  // Reset handler mocks to return null (no error)
  handleCheckoutCompleted.mockResolvedValue(null)
  handleSubscriptionUpdated.mockResolvedValue(null)
  handleSubscriptionDeleted.mockResolvedValue(null)
})

function makeWebhookRequest(body: string, signature?: string): NextRequest {
  return new NextRequest('http://localhost:3000/api/stripe/webhook', {
    method: 'POST',
    body,
    headers: {
      'content-type': 'application/json',
      ...(signature ? { 'stripe-signature': signature } : {}),
    },
  })
}

describe('POST /api/stripe/webhook', () => {
  it('returns 400 when stripe-signature header missing', async () => {
    const res = await POST(makeWebhookRequest('{}'))
    const json = await res.json()

    expect(res.status).toBe(400)
    expect(json.error).toBe('Missing signature')
  })

  it('returns 400 when signature invalid (constructEvent throws)', async () => {
    mockStripe.webhooks.constructEvent.mockImplementation(() => {
      throw new Error('Invalid signature')
    })

    const res = await POST(makeWebhookRequest('{}', 'bad-sig'))
    const json = await res.json()

    expect(res.status).toBe(400)
    expect(json.error).toBe('Invalid signature')
  })

  it('handles checkout.session.completed event', async () => {
    const event = {
      type: 'checkout.session.completed',
      data: { object: { id: 'cs_test', subscription: 'sub_test' } },
    }
    mockStripe.webhooks.constructEvent.mockReturnValue(event)

    const res = await POST(makeWebhookRequest(JSON.stringify(event), 'valid-sig'))
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.received).toBe(true)
    expect(handleCheckoutCompleted).toHaveBeenCalledWith(event.data.object, mockServiceClient)
  })

  it('handles customer.subscription.updated (active)', async () => {
    const event = {
      type: 'customer.subscription.updated',
      data: { object: { id: 'sub_test', status: 'active', metadata: { supabase_user_id: 'user-123' } } },
    }
    mockStripe.webhooks.constructEvent.mockReturnValue(event)

    const res = await POST(makeWebhookRequest(JSON.stringify(event), 'valid-sig'))
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.received).toBe(true)
    expect(handleSubscriptionUpdated).toHaveBeenCalledWith(event.data.object, mockServiceClient)
  })

  it('handles customer.subscription.updated (canceled)', async () => {
    const event = {
      type: 'customer.subscription.updated',
      data: { object: { id: 'sub_test', status: 'canceled', metadata: { supabase_user_id: 'user-123' } } },
    }
    mockStripe.webhooks.constructEvent.mockReturnValue(event)

    const res = await POST(makeWebhookRequest(JSON.stringify(event), 'valid-sig'))

    expect(res.status).toBe(200)
    expect(handleSubscriptionUpdated).toHaveBeenCalled()
  })

  it('handles customer.subscription.deleted', async () => {
    const event = {
      type: 'customer.subscription.deleted',
      data: { object: { id: 'sub_test', metadata: { supabase_user_id: 'user-123' } } },
    }
    mockStripe.webhooks.constructEvent.mockReturnValue(event)

    const res = await POST(makeWebhookRequest(JSON.stringify(event), 'valid-sig'))
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(handleSubscriptionDeleted).toHaveBeenCalledWith(event.data.object, mockServiceClient)
  })

  it('handles invoice.payment_failed', async () => {
    const event = {
      type: 'invoice.payment_failed',
      data: { object: { id: 'in_test', customer: 'cus_test' } },
    }
    mockStripe.webhooks.constructEvent.mockReturnValue(event)

    const res = await POST(makeWebhookRequest(JSON.stringify(event), 'valid-sig'))
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.received).toBe(true)
  })

  it('returns 200 for unhandled event type', async () => {
    const event = { type: 'some.unknown.event', data: { object: {} } }
    mockStripe.webhooks.constructEvent.mockReturnValue(event)

    const res = await POST(makeWebhookRequest(JSON.stringify(event), 'valid-sig'))
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.received).toBe(true)
  })
})
