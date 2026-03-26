import type { Tier } from '../types'

function randomSegment(len: number): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let s = ''
  for (let i = 0; i < len; i++) {
    s += chars[Math.floor(Math.random() * chars.length)]
  }
  return s
}

export function generateWristbandCode(): string {
  return `WB-${randomSegment(4)}-${randomSegment(4)}`
}

export function generateTransactionId(): string {
  return `TXN-${Date.now().toString(36).toUpperCase()}-${randomSegment(6)}`
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

/** Cobro simulado — nunca hay pasarela real. */
export async function simulatePayment(_tier: Tier): Promise<{ transactionId: string }> {
  await delay(600)
  return { transactionId: generateTransactionId() }
}

/** Prueba rápida desde el navegador (puede fallar por CORS aunque el servidor exista). */
export async function pingUrl(url: string): Promise<string> {
  const u = url.trim()
  if (!u) return 'Sin URL'
  try {
    const base = u.replace(/\/$/, '') + '/'
    const res = await fetch(base, { method: 'GET', signal: AbortSignal.timeout(8000) })
    return `HTTP ${res.status}`
  } catch (e) {
    return e instanceof Error ? e.message : 'Error'
  }
}

export async function runConnectionTests(): Promise<{ device: string; hik: string }> {
  const mode = import.meta.env.VITE_APP_API_MODE ?? 'mock'
  const device = import.meta.env.VITE_APP_HIK_DEVICE_BASE_URL ?? ''
  const hik = import.meta.env.VITE_APP_HIKCENTRAL_BASE_URL ?? ''

  if (mode === 'mock') {
    return {
      device: 'Modo mock: no se hace petición de red.',
      hik: 'Modo mock: no se hace petición de red.',
    }
  }

  const [d, h] = await Promise.all([pingUrl(device), pingUrl(hik)])
  return { device: d, hik: h }
}
