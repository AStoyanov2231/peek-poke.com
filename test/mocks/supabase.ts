import { vi } from 'vitest'

// Chainable query builder
export function createMockQueryBuilder(returnData: unknown = null, returnError: unknown = null) {
  const terminal = () => Promise.resolve({ data: returnData, error: returnError })
  const builder: Record<string, unknown> = {}
  const chain = (obj: Record<string, unknown>) => {
    ;['select', 'insert', 'update', 'delete', 'upsert', 'eq', 'neq', 'in', 'order', 'limit', 'range', 'ilike', 'or', 'filter', 'not', 'is', 'gte', 'lte', 'gt', 'lt', 'match', 'contains', 'overlaps', 'textSearch', 'returns', 'throwOnError'].forEach(
      (m) => (obj[m] = vi.fn(() => obj))
    )
    obj.single = vi.fn(terminal)
    obj.maybeSingle = vi.fn(terminal)
    obj.then = vi.fn((resolve: (v: unknown) => void) => resolve({ data: returnData, error: returnError }))
    // Make it a proper thenable / awaitable
    return obj
  }
  return chain(builder)
}

export function createMockSupabaseClient(overrides: Record<string, unknown> = {}) {
  const defaultClient = {
    from: vi.fn(() => createMockQueryBuilder()),
    rpc: vi.fn(() => Promise.resolve({ data: null, error: null })),
    auth: {
      getUser: vi.fn(() => Promise.resolve({ data: { user: null }, error: null })),
      getSession: vi.fn(() => Promise.resolve({ data: { session: null }, error: null })),
      signOut: vi.fn(() => Promise.resolve({ error: null })),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
    },
    storage: {
      from: vi.fn(() => ({
        upload: vi.fn(() => Promise.resolve({ data: { path: 'test/path' }, error: null })),
        getPublicUrl: vi.fn(() => ({ data: { publicUrl: 'https://test.supabase.co/storage/v1/object/public/test/path' } })),
        remove: vi.fn(() => Promise.resolve({ data: null, error: null })),
      })),
    },
    channel: vi.fn(() => ({
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn((cb?: (status: string) => void) => { cb?.('SUBSCRIBED'); return { unsubscribe: vi.fn() } }),
      untrack: vi.fn(() => Promise.resolve()),
      track: vi.fn(() => Promise.resolve()),
      presenceState: vi.fn(() => ({})),
    })),
    removeChannel: vi.fn(() => Promise.resolve()),
  }
  return { ...defaultClient, ...overrides }
}

export function mockSupabaseServer(mockClient = createMockSupabaseClient()) {
  vi.mock('@/lib/supabase/server', () => ({
    createClient: vi.fn(async () => mockClient),
    createServiceClient: vi.fn(() => mockClient),
  }))
  return mockClient
}

export function mockSupabaseBrowser(mockClient = createMockSupabaseClient()) {
  vi.mock('@/lib/supabase/client', () => ({
    createClient: vi.fn(() => mockClient),
  }))
  return mockClient
}
