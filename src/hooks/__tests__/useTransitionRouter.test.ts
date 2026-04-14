import { renderHook } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'

vi.mock('next/navigation', () => ({
  useRouter: vi.fn(),
}))

import { useRouter } from 'next/navigation'
import { useTransitionRouter } from '@/hooks/useTransitionRouter'

const buildMockRouter = () => ({
  push: vi.fn(),
  replace: vi.fn(),
  back: vi.fn(),
  forward: vi.fn(),
  prefetch: vi.fn(),
  refresh: vi.fn(),
})

beforeEach(() => {
  delete (document as any).startViewTransition
  vi.mocked(useRouter).mockReturnValue(buildMockRouter() as any)
})

afterEach(() => {
  vi.restoreAllMocks()
  delete (document as any).startViewTransition
})

describe('useTransitionRouter', () => {
  it('push calls startViewTransition when available', () => {
    const mockRouter = buildMockRouter()
    vi.mocked(useRouter).mockReturnValue(mockRouter as any)
    ;(document as any).startViewTransition = vi.fn((fn: () => void) => fn())

    const { result } = renderHook(() => useTransitionRouter())
    result.current.push('/test')

    expect((document as any).startViewTransition).toHaveBeenCalled()
    expect(mockRouter.push).toHaveBeenCalledWith('/test', undefined)
  })

  it('push calls router.push directly when startViewTransition not available', () => {
    const mockRouter = buildMockRouter()
    vi.mocked(useRouter).mockReturnValue(mockRouter as any)

    const { result } = renderHook(() => useTransitionRouter())
    result.current.push('/direct')

    expect(mockRouter.push).toHaveBeenCalledWith('/direct', undefined)
  })

  it('replace calls startViewTransition when available', () => {
    const mockRouter = buildMockRouter()
    vi.mocked(useRouter).mockReturnValue(mockRouter as any)
    ;(document as any).startViewTransition = vi.fn((fn: () => void) => fn())

    const { result } = renderHook(() => useTransitionRouter())
    result.current.replace('/replaced')

    expect((document as any).startViewTransition).toHaveBeenCalled()
    expect(mockRouter.replace).toHaveBeenCalledWith('/replaced', undefined)
  })

  it('replace calls router.replace directly when startViewTransition not available', () => {
    const mockRouter = buildMockRouter()
    vi.mocked(useRouter).mockReturnValue(mockRouter as any)

    const { result } = renderHook(() => useTransitionRouter())
    result.current.replace('/direct-replace')

    expect(mockRouter.replace).toHaveBeenCalledWith('/direct-replace', undefined)
  })
})
