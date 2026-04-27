import { render, screen, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { MatchCountdownBadge } from '../MatchCountdownBadge'

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

function futureIso(offsetMs: number): string {
  return new Date(Date.now() + offsetMs).toISOString()
}

describe('MatchCountdownBadge', () => {
  it('shows hours when more than 1 hour remaining', () => {
    const expiresAt = futureIso(30 * 3600000) // 30h from now
    render(<MatchCountdownBadge expiresAt={expiresAt} />)
    expect(screen.getByText('30h left')).toBeInTheDocument()
  })

  it('shows minutes when less than 1 hour remaining', () => {
    const expiresAt = futureIso(45 * 60000) // 45m from now
    render(<MatchCountdownBadge expiresAt={expiresAt} />)
    expect(screen.getByText('45m left')).toBeInTheDocument()
  })

  it('shows "Expired" when past expiry', () => {
    const expiresAt = futureIso(-1000) // already expired
    render(<MatchCountdownBadge expiresAt={expiresAt} />)
    expect(screen.getByText('Expired')).toBeInTheDocument()
  })

  it('has amber class at 12h remaining (between 8h and 24h)', () => {
    const expiresAt = futureIso(12 * 3600000) // 12h from now
    const { container } = render(<MatchCountdownBadge expiresAt={expiresAt} />)
    const span = container.querySelector('span')
    expect(span?.className).toContain('text-amber-500')
  })

  it('has danger class at 4h remaining (under 8h)', () => {
    const expiresAt = futureIso(4 * 3600000) // 4h from now
    const { container } = render(<MatchCountdownBadge expiresAt={expiresAt} />)
    const span = container.querySelector('span')
    expect(span?.className).toContain('text-danger-500')
  })

  it('uses muted class when more than 24h remaining', () => {
    const expiresAt = futureIso(48 * 3600000) // 48h from now
    const { container } = render(<MatchCountdownBadge expiresAt={expiresAt} />)
    const span = container.querySelector('span')
    expect(span?.className).toContain('muted')
  })

  it('updates display every second via interval', () => {
    const expiresAt = futureIso(3 * 60000 + 30000) // 3m 30s from now → shows "3m left"
    render(<MatchCountdownBadge expiresAt={expiresAt} />)
    expect(screen.getByText('3m left')).toBeInTheDocument()

    // Advance 60s — now 2m 30s remain
    act(() => { vi.advanceTimersByTime(60000) })
    expect(screen.getByText('2m left')).toBeInTheDocument()
  })
})
