import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useAppStore } from '@/stores/appStore'
import type { DatingPreferences } from '@/types/database'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildDatingPreferences(overrides: Partial<DatingPreferences> = {}): DatingPreferences {
  return {
    user_id: 'user-1',
    interested_in: ['woman'],
    min_age: 18,
    max_age: 35,
    max_distance_km: 50,
    dealbreaker_smoking: false,
    dealbreaker_drinking: false,
    dealbreaker_kids: false,
    dealbreaker_relationship_goal: null,
    verified_only: false,
    women_only: false,
    updated_at: new Date().toISOString(),
    ...overrides,
  }
}

function getState() {
  return useAppStore.getState()
}

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  useAppStore.setState({
    datingPreferences: null,
    isDatingPrefsLoaded: false,
  })
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

// ─── fetchDatingPreferences ───────────────────────────────────────────────────

describe('fetchDatingPreferences', () => {
  it('sets datingPreferences and isDatingPrefsLoaded from API response', async () => {
    const prefs = buildDatingPreferences()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ preferences: prefs }),
    }))

    await getState().fetchDatingPreferences()

    expect(getState().datingPreferences).toEqual(prefs)
    expect(getState().isDatingPrefsLoaded).toBe(true)
  })

  it('does nothing if API returns non-ok response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      json: () => Promise.resolve({}),
    }))

    await getState().fetchDatingPreferences()

    expect(getState().datingPreferences).toBeNull()
    expect(getState().isDatingPrefsLoaded).toBe(true)
  })
})

// ─── updateDatingPreferences ──────────────────────────────────────────────────

describe('updateDatingPreferences', () => {
  it('calls PUT and updates datingPreferences from response', async () => {
    const initial = buildDatingPreferences()
    const updated = buildDatingPreferences({ max_age: 40, verified_only: true })
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ preferences: updated }),
    })
    vi.stubGlobal('fetch', mockFetch)

    useAppStore.setState({ datingPreferences: initial })

    await getState().updateDatingPreferences({ max_age: 40, verified_only: true })

    expect(mockFetch).toHaveBeenCalledWith('/api/dating/preferences', expect.objectContaining({
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ max_age: 40, verified_only: true }),
    }))
    expect(getState().datingPreferences).toEqual(updated)
  })

  it('does nothing if PUT returns non-ok response', async () => {
    const initial = buildDatingPreferences()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      json: () => Promise.resolve({}),
    }))

    useAppStore.setState({ datingPreferences: initial })

    await getState().updateDatingPreferences({ max_age: 99 })

    // State should be unchanged
    expect(getState().datingPreferences).toEqual(initial)
  })
})

// ─── clearStore ───────────────────────────────────────────────────────────────

describe('clearStore — datingPreferences', () => {
  it('resets datingPreferences to null and isDatingPrefsLoaded to false', () => {
    const prefs = buildDatingPreferences()
    useAppStore.setState({ datingPreferences: prefs, isDatingPrefsLoaded: true })

    getState().clearStore()

    expect(getState().datingPreferences).toBeNull()
    expect(getState().isDatingPrefsLoaded).toBe(false)
  })
})
