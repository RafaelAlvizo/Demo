import { createHmac, randomUUID } from 'node:crypto'
import http from 'node:http'
import https from 'node:https'

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

function isTruthyEnv(raw: string | undefined): boolean {
  const value = (raw ?? '').trim().toLowerCase()
  return value === '1' || value === 'true' || value === 'yes'
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

type UpstreamResult = {
  status: number
  headers: http.IncomingHttpHeaders
  text: string
}

function postToUpstream(
  upstreamUrl: URL,
  headers: Record<string, string>,
  body: string,
  allowInsecureTls: boolean,
): Promise<UpstreamResult> {
  return new Promise((resolve, reject) => {
    const transport = upstreamUrl.protocol === 'https:' ? https : http
    const req = transport.request(
      upstreamUrl,
      {
        method: 'POST',
        headers,
        rejectUnauthorized: upstreamUrl.protocol === 'https:' ? !allowInsecureTls : undefined,
      },
      (res) => {
        const chunks: Buffer[] = []
        res.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)))
        res.on('end', () => {
          resolve({
            status: res.statusCode ?? 502,
            headers: res.headers,
            text: Buffer.concat(chunks).toString('utf8'),
          })
        })
      },
    )

    req.setTimeout(120_000, () => {
      req.destroy(new Error('Upstream timeout after 120000ms'))
    })
    req.on('error', reject)
    req.write(body)
    req.end()
  })
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
      const allowInsecureTls = isTruthyEnv(
        process.env.HIKCENTRAL_ALLOW_INSECURE_TLS ?? process.env.VITE_APP_HIKCENTRAL_ALLOW_INSECURE_TLS,
      )
      const body = await request.text()
      const headers = buildArtemisHeaders(path, body, appKey, appSecret)
      const upstreamUrl = new URL(`${upstreamBase}${path}`)
      const upstream = await postToUpstream(upstreamUrl, headers, body, allowInsecureTls)

      return new Response(upstream.text, {
        status: upstream.status,
        headers: {
          'content-type':
            typeof upstream.headers['content-type'] === 'string'
              ? upstream.headers['content-type']
              : 'application/json; charset=utf-8',
          'cache-control': 'no-store',
        },
      })
    } catch (error) {
      const err = error instanceof Error ? error : new Error('Unknown proxy error')
      const cause =
        typeof err.cause === 'object' && err.cause && 'message' in err.cause
          ? String((err.cause as { message?: unknown }).message ?? '')
          : undefined
      return jsonResponse(
        {
          code: 'proxy_error',
          message: err.message,
          cause,
          stack: process.env.NODE_ENV === 'production' ? undefined : err.stack,
        },
        500,
      )
    }
  },
}
