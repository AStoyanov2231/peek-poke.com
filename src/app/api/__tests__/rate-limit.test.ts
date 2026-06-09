import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// mockLimit must be vi.hoisted so it's accessible inside the vi.mock factory
const mockLimit = vi.hoisted(() => vi.fn())
const mockFromEnv = vi.hoisted(() => vi.fn(() => ({})))

// Mock @upstash/ratelimit and @upstash/redis BEFORE importing the module under test
vi.mock('@upstash/redis', () => ({
  Redis: { fromEnv: mockFromEnv },
}))

vi.mock('@upstash/ratelimit', () => {
  // Must be a class/function so `new Ratelimit(...)` works as a constructor
  function MockRatelimit(this: Record<string, unknown>) {
    this.limit = mockLimit
  }
  MockRatelimit.slidingWindow = vi.fn().mockReturnValue({})
  return { Ratelimit: MockRatelimit }
})

describe('enforceRateLimit', () => {
  const OLD_ENV = process.env

  beforeEach(() => {
    vi.resetModules()
    process.env = { ...OLD_ENV }
    mockLimit.mockReset()
  })

  afterEach(() => {
    process.env = OLD_ENV
  })

  it('returns null when env vars are absent (dev/CI mode)', async () => {
    delete process.env.UPSTASH_REDIS_REST_URL
    delete process.env.UPSTASH_REDIS_REST_TOKEN

    // Re-import so the module re-initialises with the stripped env
    const { enforceRateLimit } = await import('@/lib/rate-limit')
    const result = await enforceRateLimit('sendMessage', 'user-1')
    expect(result).toBeNull()
  })

  it('returns null when under the limit', async () => {
    process.env.UPSTASH_REDIS_REST_URL = 'https://redis.example.com'
    process.env.UPSTASH_REDIS_REST_TOKEN = 'token'
    mockLimit.mockResolvedValue({ success: true, limit: 30, remaining: 29, reset: Date.now() + 60_000 })

    const { enforceRateLimit } = await import('@/lib/rate-limit')
    const result = await enforceRateLimit('sendMessage', 'user-1')
    expect(result).toBeNull()
  })

  it('returns 429 response with Retry-After header when over the limit', async () => {
    process.env.UPSTASH_REDIS_REST_URL = 'https://redis.example.com'
    process.env.UPSTASH_REDIS_REST_TOKEN = 'token'
    const resetAt = Date.now() + 30_000
    mockLimit.mockResolvedValue({ success: false, limit: 30, remaining: 0, reset: resetAt })

    const { enforceRateLimit } = await import('@/lib/rate-limit')
    const result = await enforceRateLimit('sendMessage', 'user-1')

    expect(result).not.toBeNull()
    expect(result!.status).toBe(429)
    const body = await result!.json()
    expect(body.error).toMatch(/too many requests/i)
    expect(body.code).toBe('RATE_LIMITED')
    expect(result!.headers.get('Retry-After')).toBeTruthy()
    expect(result!.headers.get('X-RateLimit-Limit')).toBe('30')
    expect(result!.headers.get('X-RateLimit-Remaining')).toBe('0')
  })

  it('returns null (fail-open) when Redis throws', async () => {
    process.env.UPSTASH_REDIS_REST_URL = 'https://redis.example.com'
    process.env.UPSTASH_REDIS_REST_TOKEN = 'token'
    mockLimit.mockRejectedValue(new Error('connection refused'))

    const { enforceRateLimit } = await import('@/lib/rate-limit')
    const result = await enforceRateLimit('friendRequest', 'user-2')
    expect(result).toBeNull()
  })

  it('returns null (fail-open) when Redis.fromEnv throws', async () => {
    process.env.UPSTASH_REDIS_REST_URL = 'https://redis.example.com'
    process.env.UPSTASH_REDIS_REST_TOKEN = 'token'
    mockFromEnv.mockImplementationOnce(() => { throw new Error('init error') })

    const { enforceRateLimit } = await import('@/lib/rate-limit')
    const result = await enforceRateLimit('coinMeeting', 'user-3')
    expect(result).toBeNull()
  })
})
