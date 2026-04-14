import { renderHook, act } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import { useAppStore } from '@/stores/appStore'
import { useGeolocation } from '@/hooks/useGeolocation'

type PositionCallback = (pos: GeolocationPosition) => void
type ErrorCallback = (err: GeolocationPositionError) => void

let mockWatchPosition: ReturnType<typeof vi.fn>
let mockClearWatch: ReturnType<typeof vi.fn>
let capturedSuccess: PositionCallback | null = null
let capturedError: ErrorCallback | null = null

function buildPosition(lat: number, lng: number): GeolocationPosition {
  return {
    coords: { latitude: lat, longitude: lng, accuracy: 10, altitude: null, altitudeAccuracy: null, heading: null, speed: null },
    timestamp: Date.now(),
  } as GeolocationPosition
}

beforeEach(() => {
  useAppStore.getState().clearStore()
  vi.useFakeTimers()
  capturedSuccess = null
  capturedError = null

  mockWatchPosition = vi.fn((success: PositionCallback, error: ErrorCallback) => {
    capturedSuccess = success
    capturedError = error
    return 42 // watchId
  })
  mockClearWatch = vi.fn()

  vi.stubGlobal('navigator', {
    geolocation: {
      watchPosition: mockWatchPosition,
      clearWatch: mockClearWatch,
    },
  })
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('useGeolocation', () => {
  it('calls navigator.geolocation.watchPosition on mount', () => {
    renderHook(() => useGeolocation())
    expect(mockWatchPosition).toHaveBeenCalledOnce()
  })

  it('calls clearWatch on unmount', () => {
    const { unmount } = renderHook(() => useGeolocation())
    unmount()
    expect(mockClearWatch).toHaveBeenCalledWith(42)
  })

  it('updates store with new position on first call', () => {
    renderHook(() => useGeolocation())

    act(() => {
      capturedSuccess?.(buildPosition(51.5074, -0.1278))
    })

    expect(useAppStore.getState().userLocation).toEqual({ lat: 51.5074, lng: -0.1278 })
  })

  it('debounces position updates — ignores second call within 5s', () => {
    renderHook(() => useGeolocation())

    act(() => {
      capturedSuccess?.(buildPosition(51.5074, -0.1278))
    })

    act(() => {
      capturedSuccess?.(buildPosition(51.5, -0.1))
    })

    // Still shows original location since 5s hasn't passed
    expect(useAppStore.getState().userLocation).toEqual({ lat: 51.5074, lng: -0.1278 })
  })

  it('allows position update after 5s debounce window', () => {
    renderHook(() => useGeolocation())

    act(() => {
      capturedSuccess?.(buildPosition(51.5074, -0.1278))
    })

    act(() => {
      vi.advanceTimersByTime(5001)
      capturedSuccess?.(buildPosition(52.0, -0.2))
    })

    expect(useAppStore.getState().userLocation).toEqual({ lat: 52.0, lng: -0.2 })
  })

  it('handles geolocation error gracefully without crashing', () => {
    renderHook(() => useGeolocation())

    expect(() => {
      act(() => {
        capturedError?.({
          code: 1, // PERMISSION_DENIED
          message: 'User denied geolocation',
          PERMISSION_DENIED: 1,
          POSITION_UNAVAILABLE: 2,
          TIMEOUT: 3,
        } as GeolocationPositionError)
      })
    }).not.toThrow()
  })

  it('does not crash when geolocation is unavailable', () => {
    vi.stubGlobal('navigator', { geolocation: undefined })

    expect(() => {
      renderHook(() => useGeolocation())
    }).not.toThrow()
  })
})
