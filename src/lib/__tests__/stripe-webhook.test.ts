import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMockSupabaseClient } from '../../../test/mocks/supabase'
import { createMockStripe } from '../../../test/mocks/stripe'
import type Stripe from 'stripe'

vi.mock('next/headers', () => ({ headers: vi.fn(() => new Headers()), cookies: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn(), createServiceClient: vi.fn() }))

const mockStripe = vi.hoisted(() => ({
  customers: { create: vi.fn() },
  checkout: { sessions: { create: vi.fn() } },
  subscriptions: { retrieve: vi.fn(() => Promise.resolve({ id: 'sub_test123', status: 'active', metadata: { supabase_user_id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' }, items: { data: [{ current_period_start: 0, current_period_end: 9999999999, price: { id: 'price_test' } }] }, customer: 'cus_test123' })) },
  webhooks: { constructEvent: vi.fn() },
  billingPortal: { sessions: { create: vi.fn() } },
}))
vi.mock('@/lib/stripe', () => ({ stripe: mockStripe }))

import { handleCheckoutCompleted, handleSubscriptionUpdated, handleSubscriptionDeleted } from '@/lib/stripe-webhook'

const VALID_USER_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'

function makeSubscription(overrides: Record<string, unknown> = {}): Stripe.Subscription {
  return {
    id: 'sub_test123',
    status: 'active',
    metadata: { supabase_user_id: VALID_USER_ID },
    cancel_at_period_end: false,
    customer: 'cus_test123',
    items: {
      data: [
        {
          current_period_start: Math.floor(Date.now() / 1000) - 86400,
          current_period_end: Math.floor(Date.now() / 1000) + 86400,
          price: { id: 'price_test' },
        },
      ],
    },
    ...overrides,
  } as unknown as Stripe.Subscription
}

function makeSession(overrides: Record<string, unknown> = {}): Stripe.Checkout.Session {
  return {
    id: 'cs_test123',
    subscription: 'sub_test123',
    ...overrides,
  } as unknown as Stripe.Checkout.Session
}

let mockClient: ReturnType<typeof createMockSupabaseClient>

beforeEach(() => {
  vi.clearAllMocks()
  mockClient = createMockSupabaseClient()
})

// Helper: make mockClient.from return a chainable builder that resolves with given error
function mockFromUpdate(error: unknown = null) {
  const builder = {
    update: vi.fn().mockReturnThis(),
    upsert: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    then: vi.fn((resolve: (v: unknown) => void) => resolve({ data: null, error })),
  }
  mockClient.from.mockReturnValue(builder as never)
  return builder
}

describe('handleCheckoutCompleted', () => {
  it('returns null when session has no subscription', async () => {
    const result = await handleCheckoutCompleted(makeSession({ subscription: null }), mockClient as never)
    expect(result).toBeNull()
  })

  it('returns 500 when Stripe subscription retrieve fails', async () => {
    mockStripe.subscriptions.retrieve.mockRejectedValue(new Error('Stripe error'))

    const result = await handleCheckoutCompleted(makeSession(), mockClient as never)

    expect(result).not.toBeNull()
    expect(result!.status).toBe(500)
    const json = await result!.json()
    expect(json.error).toBeDefined()
  })

  it('returns warning when supabase_user_id missing in metadata', async () => {
    const sub = makeSubscription({ metadata: {} })
    mockStripe.subscriptions.retrieve.mockResolvedValue(sub)

    const result = await handleCheckoutCompleted(makeSession(), mockClient as never)

    expect(result).not.toBeNull()
    const json = await result!.json()
    expect(json.warning).toBeDefined()
  })

  it('updates DB and grants subscriber role on success', async () => {
    const sub = makeSubscription()
    mockStripe.subscriptions.retrieve.mockResolvedValue(sub)
    mockFromUpdate(null) // upsert subscriptions succeeds
    mockClient.rpc.mockResolvedValue({ data: null, error: null }) // grant_role succeeds

    const result = await handleCheckoutCompleted(makeSession(), mockClient as never)

    expect(result).toBeNull()
    expect(mockClient.rpc).toHaveBeenCalledWith('grant_role', expect.objectContaining({ p_role_name: 'subscriber' }))
  })

  it('returns 500 when DB upsert fails', async () => {
    const sub = makeSubscription()
    mockStripe.subscriptions.retrieve.mockResolvedValue(sub)
    mockFromUpdate({ message: 'DB error' })

    const result = await handleCheckoutCompleted(makeSession(), mockClient as never)

    expect(result).not.toBeNull()
    expect(result!.status).toBe(500)
  })
})

describe('handleSubscriptionUpdated', () => {
  it('grants subscriber role when status is active', async () => {
    mockFromUpdate(null)
    mockClient.rpc.mockResolvedValue({ data: null, error: null })

    const result = await handleSubscriptionUpdated(makeSubscription({ status: 'active' }), mockClient as never)

    expect(result).toBeNull()
    expect(mockClient.rpc).toHaveBeenCalledWith('grant_role', expect.objectContaining({ p_role_name: 'subscriber' }))
  })

  it('revokes subscriber role when status is canceled', async () => {
    mockFromUpdate(null)
    mockClient.rpc.mockResolvedValue({ data: null, error: null })

    const result = await handleSubscriptionUpdated(makeSubscription({ status: 'canceled' }), mockClient as never)

    expect(result).toBeNull()
    expect(mockClient.rpc).toHaveBeenCalledWith('revoke_role', expect.objectContaining({ p_role_name: 'subscriber' }))
  })

  it('returns warning when supabase_user_id missing in metadata', async () => {
    const result = await handleSubscriptionUpdated(makeSubscription({ metadata: {} }), mockClient as never)

    expect(result).not.toBeNull()
    const json = await result!.json()
    expect(json.warning).toBeDefined()
  })

  it('returns 500 when DB update fails', async () => {
    mockFromUpdate({ message: 'DB error' })

    const result = await handleSubscriptionUpdated(makeSubscription(), mockClient as never)

    expect(result).not.toBeNull()
    expect(result!.status).toBe(500)
  })
})

describe('handleSubscriptionDeleted', () => {
  it('removes subscriber role', async () => {
    mockFromUpdate(null)
    mockClient.rpc.mockResolvedValue({ data: null, error: null })

    const result = await handleSubscriptionDeleted(makeSubscription(), mockClient as never)

    expect(result).toBeNull()
    expect(mockClient.rpc).toHaveBeenCalledWith('revoke_role', expect.objectContaining({ p_role_name: 'subscriber' }))
  })

  it('returns warning when supabase_user_id missing in metadata', async () => {
    const result = await handleSubscriptionDeleted(makeSubscription({ metadata: {} }), mockClient as never)

    expect(result).not.toBeNull()
    const json = await result!.json()
    expect(json.warning).toBeDefined()
  })

  it('returns 500 when DB update fails', async () => {
    mockFromUpdate({ message: 'DB error' })

    const result = await handleSubscriptionDeleted(makeSubscription(), mockClient as never)

    expect(result).not.toBeNull()
    expect(result!.status).toBe(500)
  })
})
