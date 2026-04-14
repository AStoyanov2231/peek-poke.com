import { NextRequest } from 'next/server'

export function createNextRequest(
  url: string,
  options: {
    method?: string
    body?: unknown
    headers?: Record<string, string>
    searchParams?: Record<string, string>
  } = {}
): NextRequest {
  const { method = 'GET', body, headers = {}, searchParams } = options
  const fullUrl = new URL(url, 'http://localhost:3000')
  if (searchParams) {
    Object.entries(searchParams).forEach(([k, v]) => fullUrl.searchParams.set(k, v))
  }
  return new NextRequest(fullUrl.toString(), {
    method,
    body: body ? JSON.stringify(body) : undefined,
    headers: {
      'content-type': 'application/json',
      origin: 'http://localhost:3000',
      host: 'localhost:3000',
      ...headers,
    },
  })
}

export function createFormDataRequest(
  url: string,
  formData: FormData,
  options: { method?: string; headers?: Record<string, string> } = {}
): NextRequest {
  const { method = 'POST', headers = {} } = options
  return new NextRequest(new URL(url, 'http://localhost:3000').toString(), {
    method,
    body: formData,
    headers: {
      origin: 'http://localhost:3000',
      host: 'localhost:3000',
      ...headers,
    },
  })
}
