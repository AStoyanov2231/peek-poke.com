import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { collectBot } from '@/lib/bots'
import { useAppStore } from '@/stores/appStore'
import type { Bot } from '@/stores/appStore'

const BOT: Bot = { id: 'bot-1', lat: 42.0, lng: 23.0 } as Bot

beforeEach(() => {
  useAppStore.setState({
    userLocation: { lat: 42.0, lng: 23.0 },
    bots: [BOT],
    coins: 5,
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('collectBot', () => {
  it('returns false without a user location', async () => {
    useAppStore.setState({ userLocation: null })
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    expect(await collectBot('bot-1')).toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('collects: removes the bot, updates the balance, refills the pool', async () => {
    const refill: Bot[] = [{ id: 'bot-2', lat: 42.1, lng: 23.1 } as Bot]
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ json: () => Promise.resolve({ ok: true, balance: 6 }) })
      .mockResolvedValueOnce({ json: () => Promise.resolve(refill) })
    vi.stubGlobal('fetch', fetchMock)

    expect(await collectBot('bot-1')).toBe(true)
    expect(useAppStore.getState().bots.find((b) => b.id === 'bot-1')).toBeUndefined()
    expect(useAppStore.getState().coins).toBe(6)

    // POST body carries the current position
    expect(fetchMock.mock.calls[0][0]).toBe('/api/bots')
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      id: 'bot-1',
      lat: 42.0,
      lng: 23.0,
    })

    // Refill is fire-and-forget — wait for it to land
    await vi.waitFor(() => {
      expect(useAppStore.getState().bots).toEqual(refill)
    })
  })

  it('keeps the bot and balance when the API rejects the collect', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ json: () => Promise.resolve({ ok: false }) })
    vi.stubGlobal('fetch', fetchMock)

    expect(await collectBot('bot-1')).toBe(false)
    expect(useAppStore.getState().bots).toEqual([BOT])
    expect(useAppStore.getState().coins).toBe(5)
  })

  it('returns false on network failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
    expect(await collectBot('bot-1')).toBe(false)
    expect(useAppStore.getState().bots).toEqual([BOT])
  })
})
