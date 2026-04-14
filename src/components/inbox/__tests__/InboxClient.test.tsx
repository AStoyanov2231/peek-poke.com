import { render, screen, fireEvent } from '@testing-library/react'
import { useAppStore } from '@/stores/appStore'
import { InboxClient } from '@/components/inbox/InboxClient'
import { buildProfile, buildDMThread } from '../../../../test/helpers/factories'

// next/navigation mock — searchParams controls active tab
const mockPush = vi.fn()
const mockReplace = vi.fn()
let mockSearchParams = new URLSearchParams()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
  usePathname: () => '/inbox',
  useSearchParams: () => mockSearchParams,
}))

// Stub heavy sub-components to focus on tab/routing logic
vi.mock('@/components/inbox/ChatsTab', () => ({
  ChatsTab: ({ onThreadSelect }: any) => (
    <div data-testid="chats-tab">
      <button onClick={() => onThreadSelect?.('thread-1')}>Open Thread</button>
    </div>
  ),
}))

vi.mock('@/components/inbox/FriendsTab', () => ({
  FriendsTab: () => <div data-testid="friends-tab" />,
}))

vi.mock('@/components/inbox/RequestsTab', () => ({
  RequestsTab: () => <div data-testid="requests-tab" />,
}))

vi.mock('@/components/inbox/InboxChatPanel', () => ({
  InboxChatPanel: ({ threadId }: any) => (
    <div data-testid="chat-panel" data-thread-id={threadId} />
  ),
}))

beforeEach(() => {
  vi.clearAllMocks()
  useAppStore.getState().clearStore()
  mockSearchParams = new URLSearchParams()
})

describe('InboxClient', () => {
  it('renders tab bar with Chats, Friends, Requests', () => {
    render(<InboxClient />)
    expect(screen.getByText('Chats')).toBeInTheDocument()
    expect(screen.getByText('Friends')).toBeInTheDocument()
    expect(screen.getByText('Requests')).toBeInTheDocument()
  })

  it('default tab is Chats when no tab param', () => {
    render(<InboxClient />)
    expect(screen.getByTestId('chats-tab')).toBeInTheDocument()
  })

  it('renders Friends tab when tab=friends in search params', () => {
    mockSearchParams = new URLSearchParams('tab=friends')
    render(<InboxClient />)
    expect(screen.getByTestId('friends-tab')).toBeInTheDocument()
  })

  it('renders Requests tab when tab=requests in search params', () => {
    mockSearchParams = new URLSearchParams('tab=requests')
    render(<InboxClient />)
    expect(screen.getByTestId('requests-tab')).toBeInTheDocument()
  })

  it('clicking Friends tab switches to friends content', () => {
    render(<InboxClient />)
    fireEvent.click(screen.getByText('Friends'))
    expect(screen.getByTestId('friends-tab')).toBeInTheDocument()
  })

  it('clicking Requests tab switches to requests content', () => {
    render(<InboxClient />)
    fireEvent.click(screen.getByText('Requests'))
    expect(screen.getByTestId('requests-tab')).toBeInTheDocument()
  })

  it('shows friend request count badge on Requests tab', () => {
    useAppStore.setState({
      requests: [
        {
          id: 'r1', requester_id: 'u1', addressee_id: 'u2', status: 'pending',
          requested_at: '', responded_at: null,
          requester: buildProfile(),
        },
      ] as any,
    })
    render(<InboxClient />)
    expect(screen.getByText('1')).toBeInTheDocument()
  })

  it('no badge when request count is 0', () => {
    useAppStore.setState({ requests: [] })
    render(<InboxClient />)
    // Badge should not show "0"
    expect(screen.queryByText('0')).not.toBeInTheDocument()
  })
})
