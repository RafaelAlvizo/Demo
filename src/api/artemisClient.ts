import { buildArtemisHeaders } from './artemisAuth'
import { hikEndpoint } from './config'
import { getApiMode } from './envMode'

/** Rutas alineadas con `HikCentral Open API.postman_collection.json` */
export const HIK_ARTEMIS_PATHS = {
  orgList: '/artemis/api/resource/v1/org/orgList',
  personList: '/artemis/api/resource/v1/person/personList',
  personAdd: '/artemis/api/resource/v1/person/single/add',
  personDelete: '/artemis/api/resource/v1/person/single/delete',
  privilegeGroupList: '/artemis/api/acs/v1/privilege/group',
  privilegeAddPersons: '/artemis/api/acs/v1/privilege/group/single/addPersons',
  vehicleList: '/artemis/api/resource/v1/vehicle/vehicleList',
  acsDeviceList: '/artemis/api/resource/v1/acsDevice/acsDeviceList',
} as const

function parseJsonSafe(text: string): unknown {
  try {
    return JSON.parse(text) as unknown
  } catch {
    return null
  }
}

export function isApiSuccess(body: unknown): boolean {
  if (body == null || typeof body !== 'object') return true
  const o = body as Record<string, unknown>
  if ('code' in o) return o.code === '0' || o.code === 0
  if ('success' in o) return o.success === true
  return true
}

/** Evita mostrar HTML de nginx (502) en la UI. */
export function humanizeHttpErrorBody(status: number, text: string): string {
  const t = text.trim()
  const looksHtml = t.startsWith('<') || /<html[\s>]|<!DOCTYPE/i.test(t)
  if (!looksHtml) return t.slice(0, 800)

  if (status === 502) {
    return [
      '502 Bad Gateway: el proxy no alcanzó el servicio OpenAPI/Artemis.',
      import.meta.env.DEV
        ? 'Revisa URL base, licencia OpenAPI y el proxy Vite (/hikcentral-proxy). Reinicia npm run dev tras cambiar .env.local.'
        : 'En producción hace falta mismo origen o CORS y la URL correcta del gateway.',
    ].join(' ')
  }
  return `HTTP ${status}: respuesta HTML del servidor. Revisa la URL base.`
}

function mockResponse(path: string, body: unknown): unknown {
  const b = body && typeof body === 'object' ? (body as Record<string, unknown>) : {}
  if (path.includes('orgList')) {
    return {
      code: '0',
      msg: 'Success (mock)',
      data: { total: 1, pageNo: 1, pageSize: 100, list: [{ orgIndexCode: '1', orgName: 'Organización demo' }] },
    }
  }
  if (path.includes('personList')) {
    return {
      code: '0',
      msg: 'Success (mock)',
      data: {
        total: 1,
        pageNo: Number(b.pageNo) || 1,
        pageSize: Number(b.pageSize) || 10,
        list: [
          {
            personId: 'MOCK-1',
            personCode: 'DEMO-001',
            personName: 'Demo Usuario',
            orgIndexCode: '1',
          },
        ],
      },
    }
  }
  if (path.includes('person/single/add')) {
    const code =
      typeof b.personCode === 'string' ? b.personCode : `MOCK-${Math.random().toString(36).slice(2, 8)}`
    return { code: '0', msg: 'Success (mock)', data: { personId: `MOCK-${code}`, personCode: code } }
  }
  if (path.includes('person/single/delete')) {
    return { code: '0', msg: 'Success (mock)', data: '' }
  }
  if (path.includes('privilege/group') && path.includes('addPersons')) {
    return { code: '0', msg: 'Success (mock)', data: '' }
  }
  if (path.includes('privilege/group') && !path.includes('addPersons')) {
    return {
      code: '0',
      msg: 'Success (mock)',
      data: {
        list: [{ privilegeGroupId: '1', privilegeGroupName: 'Grupo demo' }],
      },
    }
  }
  if (path.includes('vehicleList')) {
    return { code: '0', msg: 'Success (mock)', data: { total: 0, list: [] } }
  }
  return { code: '0', msg: 'Success (mock)', data: body }
}

export type ArtemisPostResult = {
  ok: boolean
  status: number
  json: unknown
  text: string
  errorMessage?: string
}

export async function postArtemis(path: string, body: Record<string, unknown>): Promise<ArtemisPostResult> {
  const bodyStr = JSON.stringify(body)

  if (getApiMode() === 'mock') {
    const json = mockResponse(path, body)
    return { ok: true, status: 200, json, text: JSON.stringify(json) }
  }

  const appKey = import.meta.env.VITE_APP_HIKCENTRAL_APP_KEY ?? ''
  const appSecret = import.meta.env.VITE_APP_HIKCENTRAL_APP_SECRET ?? ''
  const headers = await buildArtemisHeaders('POST', path, bodyStr, appKey, appSecret)
  const url = hikEndpoint(path)

  let res: Response
  try {
    res = await fetch(url, {
      method: 'POST',
      headers,
      body: bodyStr,
      signal: AbortSignal.timeout(120_000),
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Error de red'
    return { ok: false, status: 0, json: null, text: '', errorMessage: msg }
  }

  const text = await res.text()
  const json = parseJsonSafe(text)

  if (!res.ok) {
    return {
      ok: false,
      status: res.status,
      json,
      text,
      errorMessage: humanizeHttpErrorBody(res.status, text),
    }
  }

  if (json && typeof json === 'object' && !isApiSuccess(json)) {
    return {
      ok: false,
      status: res.status,
      json,
      text,
      errorMessage: `API devolvió error: ${text.slice(0, 500)}`,
    }
  }

  return { ok: true, status: res.status, json, text }
}

export function extractPersonIdFromAddResponse(json: unknown): string | null {
  if (!json || typeof json !== 'object') return null
  const o = json as Record<string, unknown>
  const data = o.data
  if (data && typeof data === 'object') {
    const d = data as Record<string, unknown>
    if (typeof d.personId === 'string') return d.personId
  }
  if (typeof o.personId === 'string') return o.personId
  return null
}
