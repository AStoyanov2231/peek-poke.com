import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render } from '@testing-library/react'
import { LocationGate } from '@/components/map/LocationGate'
import { useAppStore } from '@/stores/appStore'

const isNativeAppMock = vi.fn(() => false)
vi.mock('@/lib/native', () => ({
  isNativeApp: () => isNativeAppMock(),
}))

const openExternalMock = vi.fn()
vi.mock('@/lib/peekpoke-bridge', () => ({
  PeekPokeBridge: { openExternal: (o: { url: string }) => openExternalMock(o) },
}))

beforeEach(() => {
  vi.clearAllMocks()
  isNativeAppMock.mockReturnValue(false)
  useAppStore.setState({ userLocation: null, locationStatus: 'idle' })
})

describe('LocationGate', () => {
  it('renders nothing once a location fix exists', () => {
    useAppStore.setState({ userLocation: { lat: 1, lng: 2 }, locationStatus: 'granted' })
    const { container } = render(<LocationGate />)
    expect(container.firstChild).toBeNull()
  })

  it('shows the locating state while waiting for the first fix', () => {
    useAppStore.setState({ locationStatus: 'granted' })
    const { getByText } = render(<LocationGate />)
    expect(getByText('Finding you…')).toBeTruthy()
  })

  it('shows the denied state with browser instructions on web', () => {
    useAppStore.setState({ locationStatus: 'denied' })
    const { getByText, queryByText } = render(<LocationGate />)
    expect(getByText('Location is off')).toBeTruthy()
    expect(queryByText('Open Settings')).toBeNull()
  })

  it('offers a Settings deep link on native when denied', () => {
    isNativeAppMock.mockReturnValue(true)
    useAppStore.setState({ locationStatus: 'denied' })
    const { getByText } = render(<LocationGate />)
    getByText('Open Settings').click()
    expect(openExternalMock).toHaveBeenCalledWith({ url: 'app-settings:' })
  })
})
