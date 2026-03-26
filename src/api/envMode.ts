/**
 * Valor que realmente usa la app (tras trim y minúsculas).
 * Reinicia `npm run dev` tras cambiar .env.local.
 */
export function getApiMode(): 'mock' | 'real' {
  const raw = import.meta.env.VITE_APP_API_MODE
  if (raw === undefined || raw === null) return 'mock'
  const v = String(raw).trim().toLowerCase()
  if (v === '' || v === 'mock' || v === '0' || v === 'false') return 'mock'
  return 'real'
}

/** Texto crudo (para depuración en pantalla Integración). */
export function getApiModeRaw(): string {
  const raw = import.meta.env.VITE_APP_API_MODE
  if (raw === undefined || raw === null) return '(no definido → se trata como mock)'
  return JSON.stringify(String(raw))
}
