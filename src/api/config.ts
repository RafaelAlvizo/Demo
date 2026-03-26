/**
 * En desarrollo, las peticiones van a este prefijo y Vite las reenvía a HikCentral (evita CORS).
 * Debe coincidir con una entrada en vite.config.ts → server.proxy.
 */
export const HIK_DEV_PROXY_PREFIX = '/hikcentral-proxy'

export function hikCentralApiOrigin(): string {
  if (import.meta.env.DEV) return HIK_DEV_PROXY_PREFIX
  return (import.meta.env.VITE_APP_HIKCENTRAL_BASE_URL ?? '').replace(/\/$/, '')
}

export function hikEndpoint(path: string): string {
  const base = hikCentralApiOrigin()
  const p = path.startsWith('/') ? path : `/${path}`
  return `${base}${p}`
}
