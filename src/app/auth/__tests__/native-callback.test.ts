import { describe, it, expect } from 'vitest'
import { GET } from '@/app/auth/native-callback/route'
import { createNextRequest } from '../../../../test/mocks/next'

describe('GET /auth/native-callback', () => {
  it('bounces the auth code (and next path) into the app scheme', async () => {
    const req = createNextRequest('http://localhost:3000/auth/native-callback', {
      searchParams: { code: 'abc123', next: '/invite/xyz' },
    })
    const res = GET(req)
    expect(res.headers.get('content-type')).toContain('text/html')
    const html = await res.text()
    // & is HTML-escaped inside the page
    expect(html).toContain('peekpoke://oauth-callback?code=abc123&amp;next=%2Finvite%2Fxyz')
  })

  it('drops an unsafe next path', async () => {
    const req = createNextRequest('http://localhost:3000/auth/native-callback', {
      searchParams: { code: 'abc123', next: 'https://evil.example' },
    })
    const html = await GET(req).text()
    expect(html).toContain('peekpoke://oauth-callback?code=abc123')
    expect(html).not.toContain('next=')
  })

  it('forwards an error when the provider sent no code', async () => {
    const req = createNextRequest('http://localhost:3000/auth/native-callback', {
      searchParams: { error_description: 'user denied' },
    })
    const html = await GET(req).text()
    expect(html).toContain('peekpoke://oauth-callback?error=')
    expect(html).not.toContain('code=')
  })
})
