import { render, screen } from '@testing-library/react'
import { MessageDeliveryStatus } from '@/components/messages/MessageDeliveryStatus'

describe('MessageDeliveryStatus', () => {
  it('renders a pulsing circle for "sending" status', () => {
    const { container } = render(<MessageDeliveryStatus status="sending" />)
    const el = container.firstChild as HTMLElement
    expect(el).toBeTruthy()
    expect(el.className).toMatch(/animate-pulse-soft/)
  })

  it('renders a single check for "sent" status', () => {
    const { container } = render(<MessageDeliveryStatus status="sent" />)
    const svg = container.querySelector('svg')
    expect(svg).toBeInTheDocument()
    // Single Check icon — has checkmark-sent class
    expect(svg?.className.baseVal ?? svg?.getAttribute('class')).toMatch(/checkmark-sent/)
  })

  it('renders double-check for "delivered" status', () => {
    const { container } = render(<MessageDeliveryStatus status="delivered" />)
    const svg = container.querySelector('svg')
    expect(svg).toBeInTheDocument()
    expect(svg?.className.baseVal ?? svg?.getAttribute('class')).toMatch(/checkmark-delivered/)
  })

  it('renders double-check with read class for "read" status', () => {
    const { container } = render(<MessageDeliveryStatus status="read" />)
    const svg = container.querySelector('svg')
    expect(svg).toBeInTheDocument()
    expect(svg?.className.baseVal ?? svg?.getAttribute('class')).toMatch(/checkmark-read/)
  })

  it('delivered and read both use double-check icon (CheckCheck)', () => {
    const { container: d } = render(<MessageDeliveryStatus status="delivered" />)
    const { container: r } = render(<MessageDeliveryStatus status="read" />)
    // Both render an svg element (CheckCheck)
    expect(d.querySelector('svg')).toBeInTheDocument()
    expect(r.querySelector('svg')).toBeInTheDocument()
  })

  it('applies extra className prop', () => {
    const { container } = render(
      <MessageDeliveryStatus status="sent" className="custom-class" />
    )
    const svg = container.querySelector('svg')
    expect(svg?.getAttribute('class')).toMatch(/custom-class/)
  })
})
