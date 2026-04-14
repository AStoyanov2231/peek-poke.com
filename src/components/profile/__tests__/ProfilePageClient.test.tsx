import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { useAppStore } from '@/stores/appStore'
import { ProfilePageClient } from '@/components/profile/ProfilePageClient'
import { buildProfile, buildProfilePhoto } from '../../../../test/helpers/factories'
import type { ProfileStats } from '@/types/database'

// Stub heavy child components
vi.mock('@/components/profile/PhotoGallery', () => ({
  PhotoGallery: ({ photos, onDelete }: any) => (
    <div data-testid="photo-gallery">
      {photos.map((p: any) => (
        <button key={p.id} data-testid={`delete-photo-${p.id}`} onClick={() => onDelete?.(p.id)}>
          Delete {p.id}
        </button>
      ))}
    </div>
  ),
}))

vi.mock('@/components/profile/ProfileInterests', () => ({
  ProfileInterests: ({ interests, onRemoveInterest }: any) => (
    <div data-testid="profile-interests">
      {interests.map((i: any) => (
        <button key={i.id} data-testid={`remove-interest-${i.id}`} onClick={() => onRemoveInterest?.(i.id)}>
          Remove {i.id}
        </button>
      ))}
    </div>
  ),
}))

vi.mock('@/components/profile/PremiumUpgradeButton', () => ({
  PremiumUpgradeButton: () => <div data-testid="premium-upgrade-btn" />,
}))

vi.mock('@/components/profile/SettingsSheet', () => ({
  SettingsSheet: ({ open }: any) => open ? <div data-testid="settings-sheet" /> : null,
}))

vi.mock('@/lib/image-compression', () => ({
  compressImage: vi.fn().mockResolvedValue(new Blob()),
  createThumbnail: vi.fn().mockResolvedValue(new Blob()),
}))

vi.mock('framer-motion', () => ({
  motion: { div: ({ children, ...p }: any) => <div {...p}>{children}</div> },
  AnimatePresence: ({ children }: any) => children,
}))

const defaultStats: ProfileStats = {
  friends_count: 10,
  photos_count: 2,
}

function renderProfile(overrides = {}) {
  const profile = buildProfile({ display_name: 'Jane Doe', username: 'janedoe', bio: 'Hello world', ...overrides })
  return render(
    <ProfilePageClient
      profile={profile}
      photos={[]}
      interests={[]}
      allTags={[]}
      stats={defaultStats}
    />
  )
}

beforeEach(() => {
  useAppStore.getState().clearStore()
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ profile: buildProfile() }) }))
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('ProfilePageClient', () => {
  it('renders display_name in the header', () => {
    renderProfile()
    expect(screen.getByText('Jane Doe')).toBeInTheDocument()
  })

  it('renders @username below display name', () => {
    renderProfile()
    expect(screen.getByText('@janedoe')).toBeInTheDocument()
  })

  it('shows bio in the About section when not editing', () => {
    renderProfile({ bio: 'My bio text' })
    expect(screen.getByText('My bio text')).toBeInTheDocument()
  })

  it('clicking Edit button opens bio textarea', () => {
    renderProfile({ bio: 'Old bio' })
    fireEvent.click(screen.getByText('Edit'))
    expect(screen.getByPlaceholderText('Write something about yourself...')).toBeInTheDocument()
  })

  it('bio character count shows 0/500 for empty bio in edit mode', () => {
    renderProfile({ bio: '' })
    fireEvent.click(screen.getByText('Edit'))
    expect(screen.getByText('0/500')).toBeInTheDocument()
  })

  it('bio character count updates as user types', () => {
    renderProfile({ bio: '' })
    fireEvent.click(screen.getByText('Edit'))
    const textarea = screen.getByPlaceholderText('Write something about yourself...')
    fireEvent.change(textarea, { target: { value: 'Hello' } })
    expect(screen.getByText('5/500')).toBeInTheDocument()
  })

  it('Save button calls PATCH /api/profile on bio save', async () => {
    renderProfile({ bio: 'Old' })
    fireEvent.click(screen.getByText('Edit'))
    const textarea = screen.getByPlaceholderText('Write something about yourself...')
    fireEvent.change(textarea, { target: { value: 'New bio' } })
    fireEvent.click(screen.getByText('Save'))

    await waitFor(() => {
      expect(vi.mocked(fetch)).toHaveBeenCalledWith(
        '/api/profile',
        expect.objectContaining({ method: 'PATCH' })
      )
    })
  })

  it('Cancel button closes bio edit without saving', () => {
    renderProfile({ bio: 'My bio' })
    fireEvent.click(screen.getByText('Edit'))
    expect(screen.getByPlaceholderText('Write something about yourself...')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Cancel'))
    expect(screen.queryByPlaceholderText('Write something about yourself...')).not.toBeInTheDocument()
  })

  it('renders photo gallery component', () => {
    renderProfile()
    expect(screen.getByTestId('photo-gallery')).toBeInTheDocument()
  })

  it('delete photo calls DELETE /api/profile/photos/:id', async () => {
    const photo = buildProfilePhoto()
    const profile = buildProfile({ display_name: 'Jane Doe', username: 'janedoe' })
    render(
      <ProfilePageClient
        profile={profile}
        photos={[photo]}
        interests={[]}
        allTags={[]}
        stats={defaultStats}
      />
    )

    fireEvent.click(screen.getByTestId(`delete-photo-${photo.id}`))

    await waitFor(() => {
      expect(vi.mocked(fetch)).toHaveBeenCalledWith(
        `/api/profile/photos/${photo.id}`,
        expect.objectContaining({ method: 'DELETE' })
      )
    })
  })

  it('renders interests section', () => {
    renderProfile()
    expect(screen.getByTestId('profile-interests')).toBeInTheDocument()
  })
})
