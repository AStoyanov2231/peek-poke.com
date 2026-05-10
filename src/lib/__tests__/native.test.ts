import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: vi.fn(),
  },
  registerPlugin: vi.fn(() => ({})),
  WebPlugin: class {},
}))

import { Capacitor } from '@capacitor/core'
import { isNativeApp } from '../native'

const mockIsNative = vi.mocked(Capacitor.isNativePlatform)

describe('isNativeApp', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns true when Capacitor reports native platform', () => {
    mockIsNative.mockReturnValue(true)
    expect(isNativeApp()).toBe(true)
  })

  it('returns false when Capacitor reports non-native platform', () => {
    mockIsNative.mockReturnValue(false)
    expect(isNativeApp()).toBe(false)
  })

  it('returns false in SSR context (isNativePlatform returns false server-side)', () => {
    mockIsNative.mockReturnValue(false)
    expect(isNativeApp()).toBe(false)
  })
})
