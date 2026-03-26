import CryptoJS from 'crypto-js'

/**
 * Firma tipo HikCentral OpenAPI / Artemis (documentación tpp.hikvision.com).
 * No usar X-App-Key: la plataforma espera X-Ca-Key + X-Ca-Signature (HMAC-SHA256).
 * @see stringToSign en guías oficiales: método, Content-MD5, Content-Type, key, nonce, timestamp, urlEndpoint (sin prefijo /artemis)
 */
const CONTENT_TYPE = 'application/json;charset=UTF-8'

function contentMd5Base64(body: string): string {
  const md = CryptoJS.MD5(CryptoJS.enc.Utf8.parse(body))
  return CryptoJS.enc.Base64.stringify(md)
}

function bufferToBase64(buf: ArrayBuffer): string {
  const u = new Uint8Array(buf)
  let binary = ''
  for (let i = 0; i < u.length; i++) binary += String.fromCharCode(u[i]!)
  return btoa(binary)
}

/** Ruta para firmar: /artemis/api/... → /api/... */
function signaturePath(artemisPath: string): string {
  const p = artemisPath.startsWith('/') ? artemisPath : `/${artemisPath}`
  if (p.startsWith('/artemis')) return p.slice('/artemis'.length) || '/'
  return p
}

export async function buildArtemisHeaders(
  method: string,
  artemisPath: string,
  bodyString: string,
  appKey: string,
  appSecret: string,
): Promise<Record<string, string>> {
  if (!appKey.trim() || !appSecret.trim()) {
    throw new Error(
      'Faltan VITE_APP_HIKCENTRAL_APP_KEY o VITE_APP_HIKCENTRAL_APP_SECRET (pares Artemis / OpenAPI).',
    )
  }

  const contentMD5 = contentMd5Base64(bodyString)
  const xCaNonce = crypto.randomUUID()
  const xCaTimestamp = String(Date.now())
  const urlEndpoint = signaturePath(artemisPath)

  const stringToSign = [
    method.toUpperCase(),
    contentMD5,
    CONTENT_TYPE,
    appKey,
    xCaNonce,
    xCaTimestamp,
    urlEndpoint,
  ].join('\n')

  const enc = new TextEncoder()
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(appSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sigBuf = await crypto.subtle.sign('HMAC', keyMaterial, enc.encode(stringToSign))
  const signature = bufferToBase64(sigBuf)

  return {
    Accept: 'application/json',
    'Content-Type': CONTENT_TYPE,
    'Content-MD5': contentMD5,
    'X-Ca-Key': appKey,
    'X-Ca-Signature': signature,
    'X-Ca-Timestamp': xCaTimestamp,
    'X-Ca-Nonce': xCaNonce,
    'X-Ca-Signature-Headers': 'X-Ca-Key,X-Ca-Timestamp',
  }
}
