import type { GuestData, Tier } from '../types'
import { hikEndpoint } from './config'

const API_MODE = import.meta.env.VITE_APP_API_MODE ?? 'mock'

export type AccessLevelLabel = 'basico' | 'premium' | 'VIP'

export interface HikSyncResult {
  ok: boolean
  personId: string | null
  accessGate: string
  validUntil: string
  detail: string
  lastRequestPreview?: string
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

function randomPersonCode(): string {
  const n = Math.random().toString(36).slice(2, 10).toUpperCase()
  return `TORAM-${n}`
}

/** Mapeo de tarifa → nivel de acceso lógico (como en HikCentral). */
export function tierToAccessLabel(tierId: Tier['id']): AccessLevelLabel {
  if (tierId === 'explorador') return 'basico'
  if (tierId === 'aventura') return 'premium'
  return 'VIP'
}

function accessLevelIndexCodeForTier(tierId: Tier['id']): string {
  const e = import.meta.env
  if (tierId === 'explorador') return e.VITE_APP_HIK_ACCESS_BASE ?? ''
  if (tierId === 'aventura') return e.VITE_APP_HIK_ACCESS_PREMIUM ?? ''
  return e.VITE_APP_HIK_ACCESS_VIP ?? ''
}

/** Número de tarjeta para credencial: solo dígitos (muchas lecturas esperan decimal). */
export function wristbandToCardNo(wristband: string): string {
  const digits = wristband.replace(/\D/g, '')
  if (digits.length >= 4) return digits.slice(0, 20)
  return `${Date.now() % 1e10}`.padStart(10, '0')
}

function genderToHik(g: GuestData['gender']): number {
  return g === 'female' ? 2 : 1
}

function effectivePeriod(visitDate: string): { beginTime: string; endTime: string } {
  const start = new Date(`${visitDate}T00:00:00`)
  const end = new Date(start)
  end.setDate(end.getDate() + 1)
  end.setHours(23, 59, 59, 999)
  const iso = (d: Date) => d.toISOString()
  return { beginTime: iso(start), endTime: iso(end) }
}

function authHeaders(): Record<string, string> {
  const key = import.meta.env.VITE_APP_HIKCENTRAL_APP_KEY ?? ''
  const secret = import.meta.env.VITE_APP_HIKCENTRAL_APP_SECRET ?? ''
  const h: Record<string, string> = { 'Content-Type': 'application/json' }
  if (key) h['X-App-Key'] = key
  if (secret) h['X-App-Secret'] = secret
  return h
}

function parseJsonSafe(text: string): unknown {
  try {
    return JSON.parse(text) as unknown
  } catch {
    return null
  }
}

function extractPersonId(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null
  const o = body as Record<string, unknown>
  const data = o.data
  if (data && typeof data === 'object') {
    const d = data as Record<string, unknown>
    if (typeof d.personId === 'string') return d.personId
    if (typeof d.id === 'string') return d.id
  }
  if (typeof o.personId === 'string') return o.personId
  return null
}

function isApiSuccess(body: unknown): boolean {
  if (body == null || typeof body !== 'object') return true
  const o = body as Record<string, unknown>
  if ('code' in o) return o.code === '0' || o.code === 0
  if ('success' in o) return o.success === true
  return true
}

function mergeExtraJson(base: Record<string, unknown>): Record<string, unknown> {
  const raw = import.meta.env.VITE_APP_HIK_PERSON_EXTRA_JSON
  if (!raw?.trim()) return base
  try {
    const extra = JSON.parse(raw) as Record<string, unknown>
    return { ...base, ...extra }
  } catch {
    return base
  }
}

/**
 * Misma estructura que se usará en POST real a HikCentral (personBody).
 * Úsalo para comprobar que el demo coincide con el guardado.
 */
export function buildToramSyncSnapshot(args: {
  guest: GuestData
  tier: Tier
  wristbandCode: string
  personCode?: string
}): {
  personCode: string
  personBody: Record<string, unknown>
  accessLevelIndexCode: string
  accessLabel: AccessLevelLabel
  accessGate: string
  validUntil: string
  cardNo: string
} {
  const personCode = args.personCode ?? randomPersonCode()
  const { beginTime, endTime } = effectivePeriod(args.guest.visitDate)
  const cardNo = wristbandToCardNo(args.wristbandCode)
  const accessLabel = tierToAccessLabel(args.tier.id)
  const accessIndex = accessLevelIndexCodeForTier(args.tier.id)
  const deptName = import.meta.env.VITE_APP_HIK_DEPARTMENT_NAME ?? 'Visitas'
  const orgIndexCode = import.meta.env.VITE_APP_HIK_ORG_INDEX_CODE ?? ''

  const personBody = mergeExtraJson({
    personCode,
    personName: `${args.guest.firstName} ${args.guest.lastName}`.trim(),
    givenName: args.guest.firstName,
    familyName: args.guest.lastName,
    gender: genderToHik(args.guest.gender),
    orgIndexCode,
    phoneNo: args.guest.phone,
    email: args.guest.email,
    cards: [{ cardNo }],
    beginTime,
    endTime,
  })

  const accessGate = `${deptName} · ${accessLabel}`
  const validUntil = new Date(endTime).toLocaleString('es-ES', {
    dateStyle: 'medium',
    timeStyle: 'short',
  })

  return {
    personCode,
    personBody,
    accessLevelIndexCode: accessIndex,
    accessLabel,
    accessGate,
    validUntil,
    cardNo,
  }
}

function formatPayloadPreview(snap: ReturnType<typeof buildToramSyncSnapshot>): string {
  return JSON.stringify(
    {
      personBody: snap.personBody,
      accessLevelLabel: snap.accessLabel,
      accessLevelIndexCode: snap.accessLevelIndexCode || null,
      cardNoDerivedFromWristband: snap.cardNo,
      accessAssignAfterPersonCreate: snap.accessLevelIndexCode.trim()
        ? {
            personCode: snap.personCode,
            accessLevelIndexCode: snap.accessLevelIndexCode,
            note: 'personId lo devuelve HikCentral en la respuesta del alta',
          }
        : null,
    },
    null,
    2,
  )
}

export async function syncVisitorToHikCentral(args: {
  guest: GuestData
  tier: Tier
  wristbandCode: string
  personCode?: string
}): Promise<HikSyncResult> {
  const snap = buildToramSyncSnapshot(args)
  const orgIndexCode = import.meta.env.VITE_APP_HIK_ORG_INDEX_CODE ?? ''

  if (API_MODE === 'mock') {
    await delay(500)
    return {
      ok: true,
      personId: `MOCK-${snap.personCode}`,
      accessGate: snap.accessGate,
      validUntil: snap.validUntil,
      detail:
        'Modo mock: no hay llamada HTTP. El JSON mostrado abajo es el mismo cuerpo que se enviará en modo real.',
      lastRequestPreview: formatPayloadPreview(snap),
    }
  }

  if (!orgIndexCode.trim()) {
    throw new Error(
      'Configura VITE_APP_HIK_ORG_INDEX_CODE (índice del departamento Visitas en HikCentral).',
    )
  }

  const personPath =
    import.meta.env.VITE_APP_HIK_ENDPOINT_PERSON_ADD ??
    '/artemis/api/resource/v1/person/single/add'

  const url = hikEndpoint(personPath)
  const res = await fetch(url, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(snap.personBody),
    signal: AbortSignal.timeout(60_000),
  })

  const text = await res.text()
  const json = parseJsonSafe(text)

  if (!res.ok) {
    throw new Error(`HikCentral persona: HTTP ${res.status} — ${text.slice(0, 400)}`)
  }

  if (json && typeof json === 'object' && !isApiSuccess(json)) {
    throw new Error(`HikCentral persona: ${JSON.stringify(json).slice(0, 500)}`)
  }

  let personId = extractPersonId(json)
  if (!personId && json && typeof json === 'object') {
    const o = json as Record<string, unknown>
    if (typeof o.data === 'string') personId = o.data
  }
  if (!personId) personId = snap.personCode

  const accessIndex = snap.accessLevelIndexCode
  if (accessIndex.trim()) {
    const accessPath =
      import.meta.env.VITE_APP_HIK_ENDPOINT_ACCESS_BIND ??
      '/artemis/api/resource/v1/person/single/addAccessLevel'
    const accessBody = {
      personId,
      personCode: snap.personCode,
      accessLevelIndexCode: accessIndex,
    }
    const aUrl = hikEndpoint(accessPath)
    const aRes = await fetch(aUrl, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(accessBody),
      signal: AbortSignal.timeout(60_000),
    })
    const aText = await aRes.text()
    const aJson = parseJsonSafe(aText)
    if (!aRes.ok) {
      throw new Error(`HikCentral nivel de acceso: HTTP ${aRes.status} — ${aText.slice(0, 400)}`)
    }
    if (aJson && typeof aJson === 'object' && !isApiSuccess(aJson)) {
      throw new Error(`HikCentral nivel de acceso: ${aText.slice(0, 500)}`)
    }
  }

  return {
    ok: true,
    personId,
    accessGate: snap.accessGate,
    validUntil: snap.validUntil,
    detail: accessIndex.trim()
      ? 'Persona y nivel de acceso enviados a HikCentral.'
      : 'Persona enviada. Configura VITE_APP_HIK_ACCESS_* para asignar nivel automáticamente.',
    lastRequestPreview: JSON.stringify(
      {
        personBody: snap.personBody,
        accessLevelAssign: accessIndex.trim()
          ? { personId, personCode: snap.personCode, accessLevelIndexCode: accessIndex }
          : null,
      },
      null,
      2,
    ),
  }
}
