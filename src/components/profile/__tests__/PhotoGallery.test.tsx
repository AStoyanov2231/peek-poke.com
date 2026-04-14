import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { PhotoGallery } from '@/components/profile/PhotoGallery'
import { buildProfilePhoto } from '../../../../test/helpers/factories'

// Mock PhotoViewerDialog to avoid portal/animation complexity
vi.mock('@/components/ui/PhotoViewerDialog', () => ({
  PhotoViewerDialog: ({ open }: { open: boolean }) =>
    open ? <div data-testid="photo-viewer-dialog" /> : null,
}))

// Mock framer-motion in case PhotoCard uses it
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...p }: any) => <div {...p}>{children}</div>,
  },
  AnimatePresence: ({ children }: any) => children,
}))

describe('PhotoGallery', () => {
  it('shows "Pending" label for pending photos (owner view)', () => {
    const photo = buildProfilePhoto({ approval_status: 'pending' })
    render(
      <PhotoGallery photos={[photo]} isOwner={true} />
    )
    expect(screen.getByText('Pending')).toBeInTheDocument()
  })

  it('shows "Rejected" indicator for rejected photos (owner view)', () => {
    const photo = buildProfilePhoto({ approval_status: 'rejected' })
    render(
      <PhotoGallery photos={[photo]} isOwner={true} />
    )
    // PhotoCard renders a red badge for rejected photos
    expect(screen.getByText('Rejected')).toBeInTheDocument()
  })

  it('does not show pending/rejected labels for approved photos', () => {
    const photo = buildProfilePhoto({ approval_status: 'approved' })
    render(
      <PhotoGallery photos={[photo]} isOwner={true} />
    )
    expect(screen.queryByText('Pending')).not.toBeInTheDocument()
    expect(screen.queryByText('Rejected')).not.toBeInTheDocument()
  })

  it('shows avatar indicator for avatar photo', () => {
    const photo = buildProfilePhoto({ is_avatar: true })
    const { container } = render(
      <PhotoGallery photos={[photo]} isOwner={true} />
    )
    // PhotoCard renders a Star icon in the top-left for avatar photos
    // The avatar indicator element should be present
    expect(container.querySelector('[class*="absolute"]')).toBeInTheDocument()
  })

  it('shows Add Photo button when owner and under limit', () => {
    render(
      <PhotoGallery photos={[]} isOwner={true} onUpload={vi.fn()} />
    )
    expect(screen.getByText('Add Photo')).toBeInTheDocument()
  })

  it('hides Add Photo button when at max limit', () => {
    const photos = Array.from({ length: 12 }, () => buildProfilePhoto())
    render(
      <PhotoGallery photos={photos} isOwner={true} maxPhotos={12} onUpload={vi.fn()} />
    )
    expect(screen.queryByText('Add Photo')).not.toBeInTheDocument()
  })

  it('renders null for non-owner with no photos', () => {
    const { container } = render(
      <PhotoGallery photos={[]} isOwner={false} />
    )
    expect(container.firstChild).toBeNull()
  })

  it('shows photo count header', () => {
    const photos = [buildProfilePhoto(), buildProfilePhoto()]
    render(
      <PhotoGallery photos={photos} isOwner={true} />
    )
    expect(screen.getByText('Photos (2/12)')).toBeInTheDocument()
  })
})
