import { render, screen } from '@testing-library/react'
import { useAppStore } from '@/stores/appStore'
import { PreloadProvider } from '@/components/PreloadProvider'

// Heavy hooks that require real infrastructure — stub them out
vi.mock('@/hooks/useRealtimeSync', () => ({ useRealtimeSync: vi.fn() }))
vi.mock('@/hooks/usePresence', () => ({ usePresence: vi.fn() }))
vi.mock('@/hooks/useGeolocation', () => ({ useGeolocation: vi.fn() }))
vi.mock('@/hooks/useNearbyPresence', () => ({ useNearbyPresence: vi.fn() }))
vi.mock('@/hooks/useMeetingDetection', () => ({ useMeetingDetection: vi.fn() }))
vi.mock('@/lib/native', () => ({
  isNativeApp: () => false,
  postToNative: vi.fn(),
}))

beforeEach(() => {
  useAppStore.getState().clearStore()
})

describe('PreloadProvider', () => {
  it('renders children', () => {
    // Stub preloadAll so it never resolves (simulates loading)
    useAppStore.setState({ preloadAll: vi.fn() } as any)
    render(
      <PreloadProvider>
        <div>app content</div>
      </PreloadProvider>
    )
    expect(screen.getByText('app content')).toBeInTheDocument()
  })

  it('calls preloadAll on mount', () => {
    const mockPreloadAll = vi.fn().mockResolvedValue(undefined)
    useAppStore.setState({ preloadAll: mockPreloadAll } as any)

    render(
      <PreloadProvider>
        <span />
      </PreloadProvider>
    )

    expect(mockPreloadAll).toHaveBeenCalledTimes(1)
  })

  it('does not call preloadAll more than once across re-renders', () => {
    const mockPreloadAll = vi.fn().mockResolvedValue(undefined)
    useAppStore.setState({ preloadAll: mockPreloadAll } as any)

    const { rerender } = render(
      <PreloadProvider>
        <span />
      </PreloadProvider>
    )
    rerender(
      <PreloadProvider>
        <span />
      </PreloadProvider>
    )

    // hasStartedPreload ref prevents double-call
    expect(mockPreloadAll).toHaveBeenCalledTimes(1)
  })

  it('renders children even while preloading', () => {
    // isPreloading = true
    useAppStore.setState({
      isPreloading: true,
      preloadAll: vi.fn().mockReturnValue(new Promise(() => {})),
    } as any)

    render(
      <PreloadProvider>
        <div data-testid="child">loading child</div>
      </PreloadProvider>
    )
    expect(screen.getByTestId('child')).toBeInTheDocument()
  })

  it('renders children after preload completes', async () => {
    const mockPreloadAll = vi.fn().mockResolvedValue(undefined)
    useAppStore.setState({
      isPreloading: false,
      preloadError: null,
      preloadAll: mockPreloadAll,
    } as any)

    render(
      <PreloadProvider>
        <div data-testid="done">loaded</div>
      </PreloadProvider>
    )
    expect(screen.getByTestId('done')).toBeInTheDocument()
  })

  it('renders children even when preload error is set', () => {
    useAppStore.setState({
      isPreloading: false,
      preloadError: 'Network error',
      preloadAll: vi.fn().mockResolvedValue(undefined),
    } as any)

    render(
      <PreloadProvider>
        <div data-testid="error-child">fallback</div>
      </PreloadProvider>
    )
    expect(screen.getByTestId('error-child')).toBeInTheDocument()
  })
})
