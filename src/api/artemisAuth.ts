/**
 * Firma Artemis / HikCentral Open API (mismo patrón que iSecure Center / documentación Hikvision).
 *
 * No usar Content-MD5 ni la línea appKey+nonce+timestamp suelta: el gateway calcula con:
 *   METHOD + "\n" + Accept + "\n" + Content-Type + "\n"
 *   + "x-ca-key:" + appKey + "\n"
 *   + "x-ca-nonce:" + nonce + "\n"
 *   + "x-ca-timestamp:" + ms + "\n"
 *   + ruta completa (debe incluir /artemis/...)
 *
 * @see patrones en integraciones oficiales (Accept comodín, Content-Type application/json, cabeceras x-ca-* en el stringToSign).
 */
const ACCEPT = '*/*'
/** Debe coincidir exactamente con la cabecera Content-Type enviada y la 3ª línea del stringToSign. */
const CONTENT_TYPE = 'application/json'

function getWebCrypto(): Crypto {
  const c = globalThis.crypto
  if (!c) {
    throw new Error('Este navegador no expone Web Crypto; no se puede firmar Artemis desde el frontend.')
  }
  return c
}

function uuidFromRandomValues(cryptoApi: Crypto): string {
  const bytes = new Uint8Array(16)
  cryptoApi.getRandomValues(bytes)
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join('-')
}

function buildNonce(): string {
  const cryptoApi = getWebCrypto()
  if (typeof cryptoApi.randomUUID === 'function') {
    return cryptoApi.randomUUID()
  }
  return uuidFromRandomValues(cryptoApi)
}

function bytesToBase64(bytes: ArrayBuffer | Uint8Array): string {
  const u = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  let binary = ''
  for (let i = 0; i < u.length; i++) binary += String.fromCharCode(u[i]!)
  return btoa(binary)
}

function concatBytes(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0)
  const out = new Uint8Array(total)
  let offset = 0
  for (const part of parts) {
    out.set(part, offset)
    offset += part.length
  }
  return out
}

function add32(...values: number[]): number {
  let acc = 0
  for (const value of values) acc = (acc + value) >>> 0
  return acc >>> 0
}

function rotr(x: number, n: number): number {
  return (x >>> n) | (x << (32 - n))
}

const SHA256_K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
])

function sha256Bytes(message: Uint8Array): Uint8Array {
  const bitLength = message.length * 8
  const withOne = message.length + 1
  const paddedLength = withOne + ((64 - ((withOne + 8) % 64)) % 64) + 8
  const padded = new Uint8Array(paddedLength)
  padded.set(message, 0)
  padded[message.length] = 0x80

  const view = new DataView(padded.buffer)
  const high = Math.floor(bitLength / 0x100000000)
  const low = bitLength >>> 0
  view.setUint32(paddedLength - 8, high, false)
  view.setUint32(paddedLength - 4, low, false)

  let h0 = 0x6a09e667
  let h1 = 0xbb67ae85
  let h2 = 0x3c6ef372
  let h3 = 0xa54ff53a
  let h4 = 0x510e527f
  let h5 = 0x9b05688c
  let h6 = 0x1f83d9ab
  let h7 = 0x5be0cd19

  const w = new Uint32Array(64)
  for (let offset = 0; offset < padded.length; offset += 64) {
    for (let i = 0; i < 16; i++) {
      const j = offset + i * 4
      w[i] =
        ((padded[j] ?? 0) << 24) |
        ((padded[j + 1] ?? 0) << 16) |
        ((padded[j + 2] ?? 0) << 8) |
        (padded[j + 3] ?? 0)
    }
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15]!, 7) ^ rotr(w[i - 15]!, 18) ^ (w[i - 15]! >>> 3)
      const s1 = rotr(w[i - 2]!, 17) ^ rotr(w[i - 2]!, 19) ^ (w[i - 2]! >>> 10)
      w[i] = add32(w[i - 16]!, s0, w[i - 7]!, s1)
    }

    let a = h0
    let b = h1
    let c = h2
    let d = h3
    let e = h4
    let f = h5
    let g = h6
    let h = h7

    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)
      const ch = (e & f) ^ (~e & g)
      const temp1 = add32(h, S1, ch, SHA256_K[i]!, w[i]!)
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)
      const maj = (a & b) ^ (a & c) ^ (b & c)
      const temp2 = add32(S0, maj)

      h = g
      g = f
      f = e
      e = add32(d, temp1)
      d = c
      c = b
      b = a
      a = add32(temp1, temp2)
    }

    h0 = add32(h0, a)
    h1 = add32(h1, b)
    h2 = add32(h2, c)
    h3 = add32(h3, d)
    h4 = add32(h4, e)
    h5 = add32(h5, f)
    h6 = add32(h6, g)
    h7 = add32(h7, h)
  }

  const out = new Uint8Array(32)
  const outView = new DataView(out.buffer)
  outView.setUint32(0, h0, false)
  outView.setUint32(4, h1, false)
  outView.setUint32(8, h2, false)
  outView.setUint32(12, h3, false)
  outView.setUint32(16, h4, false)
  outView.setUint32(20, h5, false)
  outView.setUint32(24, h6, false)
  outView.setUint32(28, h7, false)
  return out
}

function hmacSha256Bytes(secret: Uint8Array, message: Uint8Array): Uint8Array {
  const blockSize = 64
  let key = secret
  if (key.length > blockSize) key = sha256Bytes(key)
  if (key.length < blockSize) {
    const padded = new Uint8Array(blockSize)
    padded.set(key, 0)
    key = padded
  }

  const oKeyPad = new Uint8Array(blockSize)
  const iKeyPad = new Uint8Array(blockSize)
  for (let i = 0; i < blockSize; i++) {
    const value = key[i] ?? 0
    oKeyPad[i] = value ^ 0x5c
    iKeyPad[i] = value ^ 0x36
  }

  const inner = sha256Bytes(concatBytes(iKeyPad, message))
  return sha256Bytes(concatBytes(oKeyPad, inner))
}

/** Ruta tal como va en la URL: /artemis/api/... (no quitar el prefijo /artemis para firmar). */
function normalizeArtemisPath(artemisPath: string): string {
  const p = artemisPath.startsWith('/') ? artemisPath : `/${artemisPath}`
  return p
}

export async function buildArtemisHeaders(
  method: string,
  artemisPath: string,
  _bodyString: string,
  appKey: string,
  appSecret: string,
): Promise<Record<string, string>> {
  if (!appKey.trim() || !appSecret.trim()) {
    throw new Error(
      'Faltan VITE_APP_HIKCENTRAL_APP_KEY o VITE_APP_HIKCENTRAL_APP_SECRET (pares Artemis / OpenAPI).',
    )
  }

  const pathForSign = normalizeArtemisPath(artemisPath)
  const cryptoApi = getWebCrypto()
  const xCaNonce = buildNonce()
  const xCaTimestamp = String(Date.now())

  const stringToSign = [
    method.toUpperCase(),
    ACCEPT,
    CONTENT_TYPE,
    `x-ca-key:${appKey}`,
    `x-ca-nonce:${xCaNonce}`,
    `x-ca-timestamp:${xCaTimestamp}`,
    pathForSign,
  ].join('\n')

  const enc = new TextEncoder()
  const messageBytes = enc.encode(stringToSign)
  const secretBytes = enc.encode(appSecret)
  const signature = cryptoApi.subtle
    ? bytesToBase64(
        await cryptoApi.subtle.sign(
          'HMAC',
          await cryptoApi.subtle.importKey(
            'raw',
            secretBytes,
            { name: 'HMAC', hash: 'SHA-256' },
            false,
            ['sign'],
          ),
          messageBytes,
        ),
      )
    : bytesToBase64(hmacSha256Bytes(secretBytes, messageBytes))

  return {
    Accept: ACCEPT,
    'Content-Type': CONTENT_TYPE,
    'x-ca-key': appKey,
    'x-ca-signature': signature,
    'x-ca-timestamp': xCaTimestamp,
    'x-ca-nonce': xCaNonce,
    'x-ca-signature-headers': 'x-ca-key,x-ca-nonce,x-ca-timestamp',
  }
}
