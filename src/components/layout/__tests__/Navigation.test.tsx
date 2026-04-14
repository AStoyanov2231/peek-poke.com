import { render, screen } from '@testing-library/react'
import { useAppStore } from '@/stores/appStore'
import { MobileNav } from '@/components/layout/MobileNav'
import { DesktopNav } from '@/components/layout/DesktopNav'

// Mock next/navigation
const mockPathname = vi.fn(() => '/')
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => mockPathname(),
  useSearchParams: () => new URLSearchParams(),
}))

// Mock hooks that need real infra
vi.mock('@/hooks/useKeyboardVisible', () => ({ useKeyboardVisible: () => false }))
vi.mock('@/hooks/useTransitionRouter', () => ({
  useTransitionRouter: () => ({ push: vi.fn() }),
}))

// isNativeApp must be false so MobileNav renders
vi.mock('@/lib/native', () => ({ isNativeApp: () => false, postToNative: vi.fn() }))

beforeEach(() => {
  useAppStore.getState().clearStore()
  mockPathname.mockReturnValue('/')
})

describe('MobileNav', () => {
  it('renders navigation element', () => {
    const { container } = render(<MobileNav />)
    expect(container.querySelector('nav')).toBeInTheDocument()
  })

  it('does not render when on /onboarding path', () => {
    mockPathname.mockReturnValue('/onboarding')
    const { container } = render(<MobileNav />)
    expect(container.querySelector('nav')).not.toBeInTheDocument()
  })

  it('shows unread badge count when there are unread messages', () => {
    useAppStore.setState({ totalUnread: 5 })
    render(<MobileNav />)
    // NavButton renders a badge with the count
    expect(screen.getByText('5')).toBeInTheDocument()
  })

  it('badge hides (shows 0) when unread count is 0', () => {
    useAppStore.setState({ totalUnread: 0, requests: [] })
    render(<MobileNav />)
    // No badge text "0" should appear
    expect(screen.queryByText('0')).not.toBeInTheDocument()
  })

  it('prefers friend request count over unread message count for badge', () => {
    // requests array drives useFriendRequestCount selector
    useAppStore.setState({
      totalUnread: 3,
      requests: [
        { id: 'r1', requester_id: 'u1', addressee_id: 'u2', status: 'pending', requested_at: '', responded_at: null, requester: { id: 'u1', username: 'a', display_name: 'A', bio: null, avatar_url: null, location_text: null, is_online: false, last_seen_at: '', created_at: '', stripe_customer_id: null, onboarding_completed: true, roles: ['user'] } },
      ] as any,
    })
    render(<MobileNav />)
    // badge should show 1 (friend requests), not 3
    expect(screen.getByText('1')).toBeInTheDocument()
  })
})

describe('DesktopNav', () => {
  it('renders the aside/nav element', () => {
    const { container } = render(<DesktopNav />)
    expect(container.querySelector('aside')).toBeInTheDocument()
  })

  it('does not render on /onboarding path', () => {
    mockPathname.mockReturnValue('/onboarding')
    const { container } = render(<DesktopNav />)
    expect(container.querySelector('aside')).not.toBeInTheDocument()
  })

  it('shows unread badge count from store', () => {
    useAppStore.setState({ totalUnread: 7 })
    render(<DesktopNav />)
    expect(screen.getByText('7')).toBeInTheDocument()
  })

  it('badge not shown when unread count is 0', () => {
    useAppStore.setState({ totalUnread: 0, requests: [] })
    render(<DesktopNav />)
    expect(screen.queryByText('0')).not.toBeInTheDocument()
  })
})
