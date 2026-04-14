import { render, screen, fireEvent } from '@testing-library/react'
import { useAppStore } from '@/stores/appStore'
import { buildNearbyUser } from '../../../../test/helpers/factories'

// MapLibre / react-map-gl cannot run in jsdom — mock them
vi.mock('maplibre-gl', () => ({
  default: {
    Map: vi.fn(() => ({
      addControl: vi.fn(),
      on: vi.fn(),
      flyTo: vi.fn(),
      remove: vi.fn(),
      getBounds: vi.fn(() => ({
        getWest: () => -75,
        getSouth: () => 40,
        getEast: () => -73,
        getNorth: () => 41,
        contains: () => true,
      })),
      getZoom: vi.fn(() => 14),
      easeTo: vi.fn(),
    })),
  },
}))

vi.mock('react-map-gl/maplibre', () => ({
  default: ({ children }: any) => <div data-testid="map-container">{children}</div>,
  Map: ({ children, onLoad, ...rest }: any) => (
    <div data-testid="map-container" {...rest}>
      {children}
    </div>
  ),
  Marker: ({ children, longitude, latitude }: any) => (
    <div data-testid="map-marker" data-lng={longitude} data-lat={latitude}>
      {children}
    </div>
  ),
  useMap: () => ({ current: null }),
}))

// Supercluster needs a canvas-free stub too
vi.mock('supercluster', () => {
  return {
    default: class {
      load() {}
      getClusters() { return [] }
      getClusterExpansionZoom() { return 14 }
    },
  }
})

// maplibre-gl CSS import guard
vi.mock('maplibre-gl/dist/maplibre-gl.css', () => ({}))

// Store selectors used inside MapView
vi.mock('@/stores/selectors', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/stores/selectors')>()
  return {
    ...actual,
    useHighlightedData: () => null,
    usePendingUserId: () => null,
  }
})

// Mock sub-components that render complex UI / need canvas
vi.mock('@/components/map/UserPin', () => ({
  UserPinContent: ({ user }: any) => <div data-testid="user-pin">{user?.userId}</div>,
}))

vi.mock('@/components/map/HighlightedPin', () => ({
  HighlightedPin: () => <div data-testid="highlighted-pin" />,
}))

import { MapViewInner } from '@/components/map/MapView'

beforeEach(() => {
  useAppStore.getState().clearStore()
})

describe('MapView', () => {
  it('renders the map container', () => {
    useAppStore.setState({ userLocation: { lat: 40.7, lng: -74.0 }, nearbyUsers: [] })
    render(<MapViewInner />)
    expect(screen.getByTestId('map-container')).toBeInTheDocument()
  })

  it('renders no user-pin markers when no nearby users', () => {
    useAppStore.setState({ userLocation: { lat: 40.7, lng: -74.0 }, nearbyUsers: [] })
    render(<MapViewInner />)
    expect(screen.queryAllByTestId('user-pin')).toHaveLength(0)
  })

  it('renders without crashing when nearbyUsers is populated', () => {
    const users = [buildNearbyUser(), buildNearbyUser()]
    useAppStore.setState({ userLocation: { lat: 40.7, lng: -74.0 }, nearbyUsers: users })
    expect(() => render(<MapViewInner />)).not.toThrow()
  })

  it('handles null userLocation gracefully', () => {
    useAppStore.setState({ userLocation: null, nearbyUsers: [] })
    expect(() => render(<MapViewInner />)).not.toThrow()
  })

  it('handles empty nearby users array', () => {
    useAppStore.setState({ userLocation: { lat: 40.7, lng: -74.0 }, nearbyUsers: [] })
    render(<MapViewInner />)
    expect(screen.getByTestId('map-container')).toBeInTheDocument()
  })

  it('renders with multiple nearby users without error', () => {
    const users = Array.from({ length: 5 }, () => buildNearbyUser())
    useAppStore.setState({ userLocation: { lat: 40.7, lng: -74.0 }, nearbyUsers: users })
    expect(() => render(<MapViewInner />)).not.toThrow()
  })

  it('renders without crashing when mapReady is false in store', () => {
    useAppStore.setState({ userLocation: null, nearbyUsers: [], mapReady: false })
    expect(() => render(<MapViewInner />)).not.toThrow()
  })

  it('renders without highlighted pin when highlightedUserId is null', () => {
    useAppStore.setState({
      userLocation: { lat: 40.7, lng: -74.0 },
      nearbyUsers: [],
      highlightedUserId: null,
    })
    render(<MapViewInner />)
    expect(screen.queryByTestId('highlighted-pin')).not.toBeInTheDocument()
  })
})
