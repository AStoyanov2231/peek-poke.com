import { render, screen } from '@testing-library/react'
import { useAppStore } from '@/stores/appStore'
import { CoinBalance } from '@/components/coins/CoinBalance'

beforeEach(() => {
  useAppStore.getState().clearStore()
})

describe('CoinBalance', () => {
  it('displays current coin balance from store', () => {
    useAppStore.setState({ coins: 3 })
    render(<CoinBalance />)
    expect(screen.getByText('3/5')).toBeInTheDocument()
  })

  it('shows 0 when no coins', () => {
    useAppStore.setState({ coins: 0 })
    render(<CoinBalance />)
    expect(screen.getByText('0/5')).toBeInTheDocument()
  })

  it('shows full balance (5/5)', () => {
    useAppStore.setState({ coins: 5 })
    render(<CoinBalance />)
    expect(screen.getByText('5/5')).toBeInTheDocument()
  })

  it('renders the coin SVG icon', () => {
    useAppStore.setState({ coins: 2 })
    const { container } = render(<CoinBalance />)
    expect(container.querySelector('svg')).toBeInTheDocument()
  })

  it('updates reactively when store coins change', () => {
    useAppStore.setState({ coins: 1 })
    const { rerender } = render(<CoinBalance />)
    expect(screen.getByText('1/5')).toBeInTheDocument()

    useAppStore.setState({ coins: 4 })
    rerender(<CoinBalance />)
    expect(screen.getByText('4/5')).toBeInTheDocument()
  })

  it('renders container with expected layout classes', () => {
    useAppStore.setState({ coins: 2 })
    const { container } = render(<CoinBalance />)
    const div = container.firstChild as HTMLElement
    expect(div).toBeInTheDocument()
    expect(div.className).toMatch(/flex/)
  })
})
