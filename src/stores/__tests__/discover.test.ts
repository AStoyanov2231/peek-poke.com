import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useAppStore } from '@/stores/appStore'
import { buildCandidate, buildMatch } from '../../../test/helpers/factories'
import type { Candidate, Match } from '@/types/database'

function getState() {
  return useAppStore.getState()
}

beforeEach(() => {
  useAppStore.setState({
    candidates: [],
    currentCandidateIndex: 0,
    dailyPokesRemaining: 10,
    dailyPassesRemaining: 50,
    lastMatch: null,
    isCandidatesLoaded: false,
    userLocation: { lat: 51.5, lng: -0.1 },
  })
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

// ─── Initial state ─────────────────────────────────────────────────────────────

describe('initial discover state', () => {
  it('has empty candidates and correct defaults', () => {
    useAppStore.setState({
      candidates: [],
      currentCandidateIndex: 0,
      dailyPokesRemaining: 10,
      dailyPassesRemaining: 50,
      lastMatch: null,
      isCandidatesLoaded: false,
    })
    const s = getState()
    expect(s.candidates).toEqual([])
    expect(s.currentCandidateIndex).toBe(0)
    expect(s.dailyPokesRemaining).toBe(10)
    expect(s.dailyPassesRemaining).toBe(50)
    expect(s.lastMatch).toBeNull()
    expect(s.isCandidatesLoaded).toBe(false)
  })
})

// ─── fetchCandidates ───────────────────────────────────────────────────────────

describe('fetchCandidates', () => {
  it('does not fetch when userLocation is null', async () => {
    const mockFetch = vi.fn()
    vi.stubGlobal('fetch', mockFetch)
    useAppStore.setState({ userLocation: null })

    await getState().fetchCandidates()

    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('sets candidates and quotas from API response', async () => {
    const candidates: Candidate[] = [buildCandidate(), buildCandidate()]
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        candidates,
        dailyPokesRemaining: 7,
        dailyPassesRemaining: 45,
      }),
    }))

    await getState().fetchCandidates()

    const s = getState()
    expect(s.candidates).toHaveLength(2)
    expect(s.dailyPokesRemaining).toBe(7)
    expect(s.dailyPassesRemaining).toBe(45)
    expect(s.isCandidatesLoaded).toBe(true)
  })

  it('deduplicates candidates by id on subsequent fetches', async () => {
    const existing = buildCandidate({ id: 'dup-id' })
    const newOne = buildCandidate()
    useAppStore.setState({ candidates: [existing] })

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        candidates: [existing, newOne], // existing is duplicate
        dailyPokesRemaining: 10,
        dailyPassesRemaining: 50,
      }),
    }))

    await getState().fetchCandidates()

    // Should have original + newOne, but not a second copy of existing
    expect(getState().candidates).toHaveLength(2)
  })

  it('sets isCandidatesLoaded=true even on fetch failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network')))

    await getState().fetchCandidates()

    expect(getState().isCandidatesLoaded).toBe(true)
  })

  it('does not update state when response is not ok', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }))

    await getState().fetchCandidates()

    // isCandidatesLoaded stays false since we return early on !ok
    expect(getState().candidates).toHaveLength(0)
  })
})

// ─── poke ──────────────────────────────────────────────────────────────────────

describe('poke', () => {
  it('increments currentCandidateIndex on success', async () => {
    const candidate = buildCandidate()
    useAppStore.setState({ candidates: [candidate, buildCandidate(), buildCandidate(), buildCandidate(), buildCandidate(), buildCandidate(), buildCandidate()] })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ poked: true, match: null, dailyPokesRemaining: 9 }),
    }))

    await getState().poke(candidate.id)

    expect(getState().currentCandidateIndex).toBe(1)
    expect(getState().dailyPokesRemaining).toBe(9)
  })

  it('sets lastMatch when API returns a match', async () => {
    const candidate = buildCandidate()
    const match: Match = buildMatch({ user_1_id: 'user-1', user_2_id: candidate.id })
    useAppStore.setState({ candidates: [candidate, buildCandidate(), buildCandidate(), buildCandidate(), buildCandidate(), buildCandidate(), buildCandidate()] })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ poked: true, match, dailyPokesRemaining: 8 }),
    }))

    await getState().poke(candidate.id)

    expect(getState().lastMatch).toEqual(match)
  })

  it('does not update state when response is not ok', async () => {
    const candidate = buildCandidate()
    useAppStore.setState({ candidates: [candidate], currentCandidateIndex: 0 })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }))

    await getState().poke(candidate.id)

    expect(getState().currentCandidateIndex).toBe(0)
  })
})

// ─── pass ──────────────────────────────────────────────────────────────────────

describe('pass', () => {
  it('increments currentCandidateIndex on success', async () => {
    const candidate = buildCandidate()
    useAppStore.setState({
      candidates: [candidate, buildCandidate(), buildCandidate(), buildCandidate(), buildCandidate(), buildCandidate(), buildCandidate()],
      currentCandidateIndex: 0,
    })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ passed: true, dailyPassesRemaining: 49 }),
    }))

    await getState().pass(candidate.id)

    expect(getState().currentCandidateIndex).toBe(1)
    expect(getState().dailyPassesRemaining).toBe(49)
  })
})

// ─── dismissMatch ──────────────────────────────────────────────────────────────

describe('dismissMatch', () => {
  it('clears lastMatch', () => {
    const match = buildMatch()
    useAppStore.setState({ lastMatch: match })

    getState().dismissMatch()

    expect(getState().lastMatch).toBeNull()
  })
})

// ─── clearStore ────────────────────────────────────────────────────────────────

describe('clearStore — discover', () => {
  it('resets all discover state', () => {
    const match = buildMatch()
    useAppStore.setState({
      candidates: [buildCandidate()],
      currentCandidateIndex: 5,
      dailyPokesRemaining: 3,
      dailyPassesRemaining: 20,
      lastMatch: match,
      isCandidatesLoaded: true,
    })

    getState().clearStore()

    const s = getState()
    expect(s.candidates).toEqual([])
    expect(s.currentCandidateIndex).toBe(0)
    expect(s.dailyPokesRemaining).toBe(10)
    expect(s.dailyPassesRemaining).toBe(50)
    expect(s.lastMatch).toBeNull()
    expect(s.isCandidatesLoaded).toBe(false)
  })
})
