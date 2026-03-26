/** En desarrollo, las peticiones van a /__hik/* y Vite las reenvía al servidor (evita CORS). */
export function hikCentralApiOrigin(): string {
  if (import.meta.env.DEV) return '/__hik'
  return (import.meta.env.VITE_APP_HIKCENTRAL_BASE_URL ?? '').replace(/\/$/, '')
}

export function hikEndpoint(path: string): string {
  const base = hikCentralApiOrigin()
  const p = path.startsWith('/') ? path : `/${path}`
  return `${base}${p}`
}
