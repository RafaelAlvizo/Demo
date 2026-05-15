import { createHmac, randomUUID } from 'node:crypto'

const ACCEPT = '*/*'
const CONTENT_TYPE = 'application/json'

function getRequiredEnv(primary: string, fallback?: string): string {
  const value = process.env[primary] ?? (fallback ? process.env[fallback] : undefined) ?? ''
  const trimmed = value.trim()
  if (!trimmed) {
    throw new Error(`Missing environment variable: ${primary}${fallback ? ` (or ${fallback})` : ''}`)
  }
  return trimmed
}

function normalizeBaseUrl(raw: string): string {
  return raw.replace(/\/$/, '')
}

function normalizeArtemisPath(raw: string | null): string {
  const value = (raw ?? '').trim()
  if (!value) {
    throw new Error('Missing path query parameter.')
  }
  if (!value.startsWith('/artemis/')) {
    throw new Error('Only /artemis/* paths are allowed.')
  }
  return value
}

function buildArtemisHeaders(path: string, body: string, appKey: string, appSecret: string): Record<string, string> {
  const nonce = randomUUID()
  const timestamp = String(Date.now())
  const stringToSign = [
    'POST',
    ACCEPT,
    CONTENT_TYPE,
    `x-ca-key:${appKey}`,
    `x-ca-nonce:${nonce}`,
    `x-ca-timestamp:${timestamp}`,
    path,
  ].join('\n')
  const signature = createHmac('sha256', appSecret).update(stringToSign).digest('base64')

  return {
    Accept: ACCEPT,
    'Content-Type': CONTENT_TYPE,
    'x-ca-key': appKey,
    'x-ca-signature': signature,
    'x-ca-timestamp': timestamp,
    'x-ca-nonce': nonce,
    'x-ca-signature-headers': 'x-ca-key,x-ca-nonce,x-ca-timestamp',
    'content-length': String(Buffer.byteLength(body)),
  }
}

function jsonResponse(body: Record<string, unknown>, status: number): Response {
  return Response.json(body, { status })
}

export default {
  async fetch(request: Request): Promise<Response> {
    if (request.method !== 'POST') {
      return new Response('Method Not Allowed', {
        status: 405,
        headers: { Allow: 'POST' },
      })
    }

    try {
      const url = new URL(request.url)
      const path = normalizeArtemisPath(url.searchParams.get('path'))
      const upstreamBase = normalizeBaseUrl(
        getRequiredEnv('HIKCENTRAL_BASE_URL', 'VITE_APP_HIKCENTRAL_BASE_URL'),
      )
      const appKey = getRequiredEnv('HIKCENTRAL_APP_KEY', 'VITE_APP_HIKCENTRAL_APP_KEY')
      const appSecret = getRequiredEnv('HIKCENTRAL_APP_SECRET', 'VITE_APP_HIKCENTRAL_APP_SECRET')
      const body = await request.text()
      const headers = buildArtemisHeaders(path, body, appKey, appSecret)
      const upstream = await fetch(`${upstreamBase}${path}`, {
        method: 'POST',
        headers,
        body,
      })
      const text = await upstream.text()

      return new Response(text, {
        status: upstream.status,
        headers: {
          'content-type': upstream.headers.get('content-type') ?? 'application/json; charset=utf-8',
          'cache-control': 'no-store',
        },
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown proxy error'
      return jsonResponse({ code: 'proxy_error', message }, 500)
    }
  },
}
