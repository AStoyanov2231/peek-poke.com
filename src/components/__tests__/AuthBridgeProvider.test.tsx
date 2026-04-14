import { render, screen } from '@testing-library/react'
import { AuthBridgeProvider } from '@/components/AuthBridgeProvider'

// Mock Supabase client
const mockGetSession = vi.fn()
const mockOnAuthStateChange = vi.fn()
const mockUnsubscribe = vi.fn()

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: {
      getSession: mockGetSession,
      onAuthStateChange: mockOnAuthStateChange,
    },
  }),
}))

// Mock native lib
const mockIsNativeApp = vi.fn()
const mockPostToNative = vi.fn()

vi.mock('@/lib/native', () => ({
  isNativeApp: () => mockIsNativeApp(),
  postToNative: (...args: unknown[]) => mockPostToNative(...args),
}))

beforeEach(() => {
  vi.clearAllMocks()
  mockGetSession.mockResolvedValue({ data: { session: null } })
  mockOnAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe: mockUnsubscribe } } })
})

describe('AuthBridgeProvider', () => {
  it('renders children', () => {
    mockIsNativeApp.mockReturnValue(false)
    render(
      <AuthBridgeProvider>
        <div>child</div>
      </AuthBridgeProvider>
    )
    expect(screen.getByText('child')).toBeInTheDocument()
  })

  it('does nothing when not in native app', () => {
    mockIsNativeApp.mockReturnValue(false)
    render(
      <AuthBridgeProvider>
        <span />
      </AuthBridgeProvider>
    )
    expect(mockGetSession).not.toHaveBeenCalled()
    expect(mockOnAuthStateChange).not.toHaveBeenCalled()
  })

  it('syncs auth state to native on mount when in native app', async () => {
    mockIsNativeApp.mockReturnValue(true)
    mockGetSession.mockResolvedValue({ data: { session: { user: { id: 'user-1' } } } })

    render(
      <AuthBridgeProvider>
        <span />
      </AuthBridgeProvider>
    )

    // Wait for async getSession
    await vi.waitFor(() => {
      expect(mockPostToNative).toHaveBeenCalledWith('authStateChanged', { isAuthenticated: true })
    })
  })

  it('cleans up subscription on unmount', () => {
    mockIsNativeApp.mockReturnValue(true)

    const { unmount } = render(
      <AuthBridgeProvider>
        <span />
      </AuthBridgeProvider>
    )
    unmount()
    expect(mockUnsubscribe).toHaveBeenCalled()
  })
})
