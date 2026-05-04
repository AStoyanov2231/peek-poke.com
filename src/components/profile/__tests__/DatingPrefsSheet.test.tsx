import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { useAppStore } from '@/stores/appStore'
import { DatingPrefsSheet } from '@/components/profile/DatingPrefsSheet'
import { buildProfile, buildDatingPreferences } from '../../../../test/helpers/factories'
import { FREE_DISTANCE_KM } from '@/lib/constants'

const mockFetch = vi.fn()
const mockUpdate = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  mockFetch.mockResolvedValue(undefined)
  mockUpdate.mockResolvedValue(undefined)

  useAppStore.setState({
    profile: buildProfile(),
    datingPreferences: null,
    isDatingPrefsLoaded: false,
    fetchDatingPreferences: mockFetch,
    updateDatingPreferences: mockUpdate,
  })
})

describe('DatingPrefsSheet', () => {
  it('renders when open=true', () => {
    render(<DatingPrefsSheet open={true} onOpenChange={vi.fn()} />)
    expect(screen.getByText('Dating Preferences')).toBeInTheDocument()
  })

  it('does not render when open=false', () => {
    render(<DatingPrefsSheet open={false} onOpenChange={vi.fn()} />)
    expect(screen.queryByText('Dating Preferences')).not.toBeInTheDocument()
  })

  it('free user: distance slider max is capped at FREE_DISTANCE_KM', () => {
    // Free user has no premium/platinum roles
    useAppStore.setState({
      profile: buildProfile({ roles: ['user'] }),
      datingPreferences: buildDatingPreferences({ max_distance_km: 50 }),
      isDatingPrefsLoaded: true,
      fetchDatingPreferences: mockFetch,
      updateDatingPreferences: mockUpdate,
    })

    render(<DatingPrefsSheet open={true} onOpenChange={vi.fn()} />)

    const slider = screen.getByRole('slider', { name: /distance/i }) as HTMLInputElement
    // Slider max should be capped at FREE_DISTANCE_KM for free users
    expect(Number(slider.max)).toBe(FREE_DISTANCE_KM)
  })

  it('premium user: distance slider allows above FREE_DISTANCE_KM', () => {
    useAppStore.setState({
      profile: buildProfile({ roles: ['user', 'subscriber'] }),
      datingPreferences: buildDatingPreferences({ max_distance_km: 50 }),
      isDatingPrefsLoaded: true,
      fetchDatingPreferences: mockFetch,
      updateDatingPreferences: mockUpdate,
    })

    render(<DatingPrefsSheet open={true} onOpenChange={vi.fn()} />)

    const slider = screen.getByRole('slider', { name: /distance/i }) as HTMLInputElement
    expect(Number(slider.max)).toBeGreaterThan(FREE_DISTANCE_KM)
  })

  it('save button calls updateDatingPreferences with draft values', async () => {
    const prefs = buildDatingPreferences({
      interested_in: ['woman'],
      min_age: 20,
      max_age: 35,
      max_distance_km: 15,
      dealbreaker_smoking: true,
      dealbreaker_drinking: false,
      dealbreaker_kids: false,
      dealbreaker_relationship_goal: null,
      verified_only: false,
      women_only: false,
    })

    useAppStore.setState({
      profile: buildProfile({ roles: ['user'] }),
      datingPreferences: prefs,
      isDatingPrefsLoaded: true,
      fetchDatingPreferences: mockFetch,
      updateDatingPreferences: mockUpdate,
    })

    const onOpenChange = vi.fn()
    render(<DatingPrefsSheet open={true} onOpenChange={onOpenChange} />)

    fireEvent.click(screen.getByRole('button', { name: /save/i }))

    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalledTimes(1)
      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          interested_in: ['woman'],
          min_age: 20,
          max_age: 35,
          max_distance_km: 15,
          dealbreaker_smoking: true,
        })
      )
    })

    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('free user: save clamps max_distance_km to FREE_DISTANCE_KM', async () => {
    // Free user with no premium/platinum roles
    const prefs = buildDatingPreferences({
      max_distance_km: 80, // Above FREE_DISTANCE_KM (25)
    })

    useAppStore.setState({
      profile: buildProfile({ roles: ['user'] }),
      datingPreferences: prefs,
      isDatingPrefsLoaded: true,
      fetchDatingPreferences: mockFetch,
      updateDatingPreferences: mockUpdate,
    })

    render(<DatingPrefsSheet open={true} onOpenChange={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: /save/i }))

    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalledTimes(1)
      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          max_distance_km: FREE_DISTANCE_KM,
        })
      )
    })
  })
})
