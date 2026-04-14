import { vi } from 'vitest'

export function createMockStripe() {
  return {
    customers: {
      create: vi.fn(() => Promise.resolve({ id: 'cus_test123' })),
    },
    checkout: {
      sessions: {
        create: vi.fn(() => Promise.resolve({ url: 'https://checkout.stripe.com/test' })),
      },
    },
    subscriptions: {
      retrieve: vi.fn(() =>
        Promise.resolve({
          id: 'sub_test123',
          status: 'active',
          current_period_end: Math.floor(Date.now() / 1000) + 86400,
          items: { data: [{ price: { id: 'price_test_fake' } }] },
        })
      ),
    },
    webhooks: {
      constructEvent: vi.fn(),
    },
    billingPortal: {
      sessions: {
        create: vi.fn(() => Promise.resolve({ url: 'https://billing.stripe.com/test' })),
      },
    },
  }
}

export function mockStripeModule(mockStripe = createMockStripe()) {
  // vi.doMock (not vi.mock) — avoids hoisting, required when called from within functions
  vi.doMock('@/lib/stripe', () => ({
    stripe: mockStripe,
  }))
  return mockStripe
}
