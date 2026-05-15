/**
 * En desarrollo, las peticiones van a este prefijo y Vite las reenvía a HikCentral (evita CORS).
 * Debe coincidir con una entrada en vite.config.ts → server.proxy.
 */
export const HIK_DEV_PROXY_PREFIX = '/hikcentral-proxy'
export const HIK_VERCEL_PROXY_PATH = '/api/hik-proxy'

export function hikCentralApiOrigin(): string {
  if (import.meta.env.DEV) return HIK_DEV_PROXY_PREFIX
  return HIK_VERCEL_PROXY_PATH
}

export function hikEndpoint(path: string): string {
  const base = hikCentralApiOrigin()
  const p = path.startsWith('/') ? path : `/${path}`
  if (!import.meta.env.DEV) {
    return `${base}?path=${encodeURIComponent(p)}`
  }
  return `${base}${p}`
}
