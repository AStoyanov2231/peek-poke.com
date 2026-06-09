import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// mockLimit must be vi.hoisted so it's accessible inside the vi.mock factory
const mockLimit = vi.hoisted(() => vi.fn())
const mockConstructorThrow = vi.hoisted(() => vi.fn(() => false))

// Mock @upstash/redis — Redis must be a constructor (code uses `new Redis(...)`)
vi.mock('@upstash/redis', () => {
  function MockRedis(this: Record<string, unknown>) {
    if (mockConstructorThrow()) throw new Error('init error')
  }
  return { Redis: MockRedis }
})

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
    mockConstructorThrow.mockReturnValue(false)
  })

  afterEach(() => {
    process.env = OLD_ENV
  })

  it('returns null when env vars are absent (dev/CI mode)', async () => {
    delete process.env.UPSTASH_REDIS_REST_URL
    delete process.env.UPSTASH_REDIS_REST_TOKEN
    delete process.env.KV_REST_API_URL
    delete process.env.KV_REST_API_TOKEN

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

  it('returns null (fail-open) when Redis constructor throws', async () => {
    process.env.UPSTASH_REDIS_REST_URL = 'https://redis.example.com'
    process.env.UPSTASH_REDIS_REST_TOKEN = 'token'
    mockConstructorThrow.mockReturnValue(true)

    const { enforceRateLimit } = await import('@/lib/rate-limit')
    const result = await enforceRateLimit('coinMeeting', 'user-3')
    expect(result).toBeNull()
  })

  it('accepts KV_REST_API_URL / KV_REST_API_TOKEN as fallback env vars', async () => {
    delete process.env.UPSTASH_REDIS_REST_URL
    delete process.env.UPSTASH_REDIS_REST_TOKEN
    process.env.KV_REST_API_URL = 'https://redis.example.com'
    process.env.KV_REST_API_TOKEN = 'kv-token'
    mockLimit.mockResolvedValue({ success: true, limit: 30, remaining: 29, reset: Date.now() + 60_000 })

    const { enforceRateLimit } = await import('@/lib/rate-limit')
    const result = await enforceRateLimit('sendMessage', 'user-1')
    expect(result).toBeNull()
  })
})
