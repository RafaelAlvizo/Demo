import type { Tier } from '../types'
import { HIK_DEV_PROXY_PREFIX } from './config'
import { getApiMode } from './envMode'

function normalizeBaseUrl(u: string): string {
  return u.trim().replace(/\/$/, '')
}

/** Misma base que usa `vite.config.ts` para el proxy (objetivo real del servidor). */
function devProxyTargetBase(): string {
  const env = import.meta.env
  const raw = (env.VITE_APP_HIK_PROXY_TARGET || env.VITE_APP_HIKCENTRAL_BASE_URL || '').trim()
  return normalizeBaseUrl(raw)
}

/** En dev, GET directo a https://127.0.0.1 suele fallar (cert/CORS); el proxy de Vite no. */
function shouldPingViaDevProxy(url: string): boolean {
  if (!import.meta.env.DEV) return false
  const base = normalizeBaseUrl(url)
  const target = devProxyTargetBase()
  return base.length > 0 && target.length > 0 && base === target
}

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

/**
 * Prueba rápida: GET a la raíz. En desarrollo, si la URL coincide con el destino del proxy de Vite,
 * la petición va por `${HIK_DEV_PROXY_PREFIX}/` (mismo origen; Node acepta el cert del servidor).
 */
export async function pingUrl(url: string): Promise<string> {
  const u = url.trim()
  if (!u) return 'Sin URL'
  try {
    if (shouldPingViaDevProxy(u)) {
      const res = await fetch(`${HIK_DEV_PROXY_PREFIX}/`, {
        method: 'GET',
        signal: AbortSignal.timeout(8000),
      })
      return `HTTP ${res.status} (proxy dev → ${devProxyTargetBase()})`
    }
    const base = u.replace(/\/$/, '') + '/'
    const res = await fetch(base, { method: 'GET', signal: AbortSignal.timeout(8000) })
    return `HTTP ${res.status}`
  } catch (e) {
    return e instanceof Error ? e.message : 'Error'
  }
}

export async function runConnectionTests(): Promise<{ device: string; hik: string }> {
  const mode = getApiMode()
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
