import { describe, it, expect, beforeEach } from 'vitest'
import { render, fireEvent } from '@testing-library/react'
import { RestoredScroll, __clearScrollPositions } from '@/components/layout/RestoredScroll'

function scrollTo(el: HTMLElement, top: number) {
  el.scrollTop = top
  fireEvent.scroll(el)
}

describe('RestoredScroll', () => {
  beforeEach(() => {
    __clearScrollPositions()
  })

  it('starts at the top when no position is saved', () => {
    const { container } = render(
      <RestoredScroll storageKey="a" className="scroller">
        <div style={{ height: 2000 }} />
      </RestoredScroll>
    )
    expect((container.firstChild as HTMLElement).scrollTop).toBe(0)
  })

  it('restores the saved position after unmount and remount with the same key', () => {
    const tree = (
      <RestoredScroll storageKey="a">
        <div style={{ height: 2000 }} />
      </RestoredScroll>
    )
    const first = render(tree)
    scrollTo(first.container.firstChild as HTMLElement, 480)
    first.unmount()

    const second = render(tree)
    expect((second.container.firstChild as HTMLElement).scrollTop).toBe(480)
  })

  it('keeps positions independent per key', () => {
    const a = render(
      <RestoredScroll storageKey="a">
        <div style={{ height: 2000 }} />
      </RestoredScroll>
    )
    scrollTo(a.container.firstChild as HTMLElement, 100)
    a.unmount()

    const b = render(
      <RestoredScroll storageKey="b">
        <div style={{ height: 2000 }} />
      </RestoredScroll>
    )
    expect((b.container.firstChild as HTMLElement).scrollTop).toBe(0)
  })

  it('passes className through to the scroll container', () => {
    const { container } = render(
      <RestoredScroll storageKey="a" className="flex-1 overflow-y-auto">
        <span>content</span>
      </RestoredScroll>
    )
    expect((container.firstChild as HTMLElement).className).toBe('flex-1 overflow-y-auto')
  })
})
