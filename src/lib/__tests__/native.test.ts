import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { isNativeApp, postToNative } from '../native'

describe('isNativeApp', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('should return true when window.isNativeApp is true', () => {
    vi.stubGlobal('window', { isNativeApp: true })
    expect(isNativeApp()).toBe(true)
  })

  it('should return false when window.isNativeApp is false', () => {
    vi.stubGlobal('window', { isNativeApp: false })
    expect(isNativeApp()).toBe(false)
  })

  it('should return false when window.isNativeApp is undefined', () => {
    vi.stubGlobal('window', {})
    expect(isNativeApp()).toBe(false)
  })

  it('should return false when window is undefined (SSR)', () => {
    vi.stubGlobal('window', undefined)
    expect(isNativeApp()).toBe(false)
  })
})

describe('postToNative', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('should call webkit.messageHandlers.nativeBridge.postMessage when bridge is present', () => {
    const postMessage = vi.fn()
    vi.stubGlobal('window', {
      isNativeApp: true,
      webkit: { messageHandlers: { nativeBridge: { postMessage } } },
    })
    postToNative('TEST_ACTION', { key: 'value' })
    expect(postMessage).toHaveBeenCalledOnce()
    expect(postMessage).toHaveBeenCalledWith(JSON.stringify({ action: 'TEST_ACTION', payload: { key: 'value' } }))
  })

  it('should be a no-op when window.isNativeApp is false', () => {
    const postMessage = vi.fn()
    vi.stubGlobal('window', {
      isNativeApp: false,
      webkit: { messageHandlers: { nativeBridge: { postMessage } } },
    })
    postToNative('TEST_ACTION')
    expect(postMessage).not.toHaveBeenCalled()
  })

  it('should be a no-op when webkit bridge is not present', () => {
    // Should not throw even without webkit bridge
    vi.stubGlobal('window', { isNativeApp: true })
    expect(() => postToNative('TEST_ACTION')).not.toThrow()
  })
})
