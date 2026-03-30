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

function bufferToBase64(buf: ArrayBuffer): string {
  const u = new Uint8Array(buf)
  let binary = ''
  for (let i = 0; i < u.length; i++) binary += String.fromCharCode(u[i]!)
  return btoa(binary)
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
  const xCaNonce = crypto.randomUUID()
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
    Accept: ACCEPT,
    'Content-Type': CONTENT_TYPE,
    'x-ca-key': appKey,
    'x-ca-signature': signature,
    'x-ca-timestamp': xCaTimestamp,
    'x-ca-nonce': xCaNonce,
    'x-ca-signature-headers': 'x-ca-key,x-ca-nonce,x-ca-timestamp',
  }
}
