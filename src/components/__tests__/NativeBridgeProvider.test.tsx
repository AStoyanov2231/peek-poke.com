import { render, screen, act } from '@testing-library/react'
import { NativeBridgeProvider } from '@/components/NativeBridgeProvider'

// Helper to simulate native app environment
function simulateNativeApp(value = true) {
  Object.defineProperty(window, 'isNativeApp', {
    value,
    writable: true,
    configurable: true,
  })
}

afterEach(() => {
  // Clean up window properties
  delete (window as any).isNativeApp
  delete (window as any).navigateFromNative
})

describe('NativeBridgeProvider', () => {
  it('renders children', () => {
    render(
      <NativeBridgeProvider>
        <div>child content</div>
      </NativeBridgeProvider>
    )
    expect(screen.getByText('child content')).toBeInTheDocument()
  })

  it('does not inject navigateFromNative when not a native app', () => {
    // window.isNativeApp is falsy by default in jsdom
    render(
      <NativeBridgeProvider>
        <span>hello</span>
      </NativeBridgeProvider>
    )
    expect((window as any).navigateFromNative).toBeUndefined()
  })

  it('injects window.navigateFromNative on mount in native app', () => {
    simulateNativeApp()
    render(
      <NativeBridgeProvider>
        <span>hello</span>
      </NativeBridgeProvider>
    )
    expect(typeof (window as any).navigateFromNative).toBe('function')
  })

  it('navigates to allowed routes', () => {
    simulateNativeApp()
    // Mock window.location.href assignment
    const original = window.location
    delete (window as any).location
    window.location = { ...original, href: '' } as any

    render(
      <NativeBridgeProvider>
        <span />
      </NativeBridgeProvider>
    )

    act(() => {
      ;(window as any).navigateFromNative('/inbox')
    })
    expect(window.location.href).toBe('/inbox')

    // Restore
    window.location = original
  })

  it('rejects external / non-allowed URLs', () => {
    simulateNativeApp()
    const original = window.location
    delete (window as any).location
    window.location = { ...original, href: '' } as any

    render(
      <NativeBridgeProvider>
        <span />
      </NativeBridgeProvider>
    )

    act(() => {
      ;(window as any).navigateFromNative('https://evil.com')
    })
    // href should not have been changed to external URL
    expect(window.location.href).not.toBe('https://evil.com')

    window.location = original
  })

  it('cleans up navigateFromNative on unmount', () => {
    simulateNativeApp()
    const { unmount } = render(
      <NativeBridgeProvider>
        <span />
      </NativeBridgeProvider>
    )
    expect(typeof (window as any).navigateFromNative).toBe('function')
    unmount()
    expect((window as any).navigateFromNative).toBeUndefined()
  })
})
