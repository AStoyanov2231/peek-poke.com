import { renderHook, act } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import { useKeyboardVisible } from '@/hooks/useKeyboardVisible'

let resizeHandler: (() => void) | null = null

const buildMockVisualViewport = (height: number) => ({
  height,
  addEventListener: vi.fn((event: string, handler: () => void) => {
    if (event === 'resize') resizeHandler = handler
  }),
  removeEventListener: vi.fn(),
})

afterEach(() => {
  vi.restoreAllMocks()
  resizeHandler = null
})

describe('useKeyboardVisible', () => {
  it('returns false initially', () => {
    const mockVV = buildMockVisualViewport(800)
    Object.defineProperty(window, 'visualViewport', { value: mockVV, configurable: true })

    const { result } = renderHook(() => useKeyboardVisible())
    expect(result.current).toBe(false)
  })

  it('returns false when visualViewport is null', () => {
    Object.defineProperty(window, 'visualViewport', { value: null, configurable: true })

    const { result } = renderHook(() => useKeyboardVisible())
    expect(result.current).toBe(false)
  })

  it('returns true when keyboard opens (height diff > 150)', () => {
    const mockVV = buildMockVisualViewport(800)
    Object.defineProperty(window, 'visualViewport', { value: mockVV, configurable: true })

    const { result } = renderHook(() => useKeyboardVisible())
    expect(result.current).toBe(false)

    act(() => {
      // diff = 800 - 600 = 200 > 150
      mockVV.height = 600
      resizeHandler?.()
    })

    expect(result.current).toBe(true)
  })

  it('returns false when height diff is below threshold', () => {
    const mockVV = buildMockVisualViewport(800)
    Object.defineProperty(window, 'visualViewport', { value: mockVV, configurable: true })

    const { result } = renderHook(() => useKeyboardVisible())

    act(() => {
      // diff = 800 - 750 = 50 <= 150
      mockVV.height = 750
      resizeHandler?.()
    })

    expect(result.current).toBe(false)
  })

  it('removes event listener on unmount', () => {
    const mockVV = buildMockVisualViewport(800)
    Object.defineProperty(window, 'visualViewport', { value: mockVV, configurable: true })

    const { unmount } = renderHook(() => useKeyboardVisible())
    unmount()
    expect(mockVV.removeEventListener).toHaveBeenCalledWith('resize', expect.any(Function))
  })
})
