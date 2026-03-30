import { useCallback, useMemo, useState } from 'react'
import {
  extractPersonCodeFromAddResponse,
  extractPersonIdFromAddResponse,
  HIK_ARTEMIS_PATHS,
  type ArtemisPostResult,
  postArtemis,
} from './api/artemisClient'
import { getApiMode, getApiModeRaw } from './api/envMode'
import { runConnectionTests } from './api/mock'
import {
  buildSyscomPostmanReferenceForm,
  isSyscomPostmanReferenceForm,
  SYSCOM_POSTMAN_BEGIN_ISO,
  SYSCOM_POSTMAN_END_ISO,
} from './reference/syscomPostmanPerson'
import { DEMO_PERSON_PRESETS, DEMO_TIERS, type DemoTierId } from './demo/demoData'
import { emptyPersonForm, type PersonFormState } from './types'
import './App.css'

const appName = import.meta.env.VITE_APP_NAME ?? 'HikCentral API tester'

type AppTab = 'tester' | 'demo'

function mask(s: string): string {
  if (s.length <= 4) return '••••'
  return `${s.slice(0, 2)}…${s.slice(-2)}`
}

/**
 * Código corto (4–6 dígitos, estilo Postman "1596"). Evita códigos largos que algunos HikCentral rechazan.
 */
function randomNumericPersonCode(): string {
  return String(Math.floor(1000 + Math.random() * 900000))
}

/**
 * Postman / HikCentral suelen enviar personCode como string JSON ("1596").
 * Solo usar número si defines VITE_APP_HIK_PERSON_CODE_JSON_NUMBER=true.
 */
function personCodeForApi(s: string): string | number {
  const t = s.trim()
  const asNum = import.meta.env.VITE_APP_HIK_PERSON_CODE_JSON_NUMBER
  if (asNum === 'true' || asNum === '1') {
    if (/^\d{1,15}$/.test(t)) {
      const n = Number(t)
      if (Number.isSafeInteger(n)) return n
    }
  }
  return t
}

/** Misma regla para addPersons list[].personCode */
function personCodeJsonValue(s: string): string | number {
  return personCodeForApi(s)
}

/** Cómo construir cada elemento de `list` en addPersons (varía según versión HCP). */
type AddPersonsListFormat =
  | 'id-only'
  | 'id-personCode'
  | 'personId-personCode'
  | 'personCode-only'

function buildAddPersonsList(
  format: AddPersonsListFormat,
  personId: string,
  personCode: string,
): Record<string, unknown>[] {
  const pid = personId.trim()
  const pcRaw = personCode.trim()
  const pc = personCodeJsonValue(pcRaw)
  switch (format) {
    case 'id-only':
      return [{ id: pid }]
    case 'id-personCode':
      return [{ id: pid, personCode: pc }]
    case 'personId-personCode':
      return [{ personId: pid, personCode: pc }]
    case 'personCode-only':
      return [{ personCode: pc }]
  }
}

function toDatetimeLocalValue(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

/**
 * ISO con offset local (ej. Postman: 2020-05-26T15:00:00+08:00). Evita mandar siempre …Z (UTC),
 * que a veces dispara validaciones rígidas en control de acceso / sincronía a terminales.
 */
function formatDateTimeForHikAccess(fromDatetimeLocal: string): string {
  const d = new Date(fromDatetimeLocal)
  if (Number.isNaN(d.getTime())) return new Date().toISOString()
  const p2 = (n: number) => String(n).padStart(2, '0')
  const y = d.getFullYear()
  const mo = p2(d.getMonth() + 1)
  const day = p2(d.getDate())
  const h = p2(d.getHours())
  const mi = p2(d.getMinutes())
  const s = p2(d.getSeconds())
  let offsetMin = -d.getTimezoneOffset()
  const sign = offsetMin >= 0 ? '+' : '-'
  offsetMin = Math.abs(offsetMin)
  const oh = p2(Math.floor(offsetMin / 60))
  const om = p2(offsetMin % 60)
  return `${y}-${mo}-${day}T${h}:${mi}:${s}${sign}${oh}:${om}`
}

/** Rellena todos los campos del alta con datos plausibles para probar en un clic. */
function buildDemoPersonForm(orgFallback: string): PersonFormState {
  const idSuffix = Math.floor(1000 + Math.random() * 9000)
  const first = 'Demo'
  const last = `Usuario${idSuffix}`
  const now = new Date()
  const end = new Date(now)
  end.setDate(end.getDate() + 1)
  end.setHours(23, 59, 0, 0)
  const phone = `614${String(Math.floor(Math.random() * 1e7)).padStart(7, '0')}`
  /** Misma escala que ejemplo Postman (cardNo ~9 dígitos). */
  const card = String(Math.floor(100_000_000 + Math.random() * 900_000_000))
  return {
    ...emptyPersonForm(),
    personCode: randomNumericPersonCode(),
    personGivenName: first,
    personFamilyName: last,
    gender: 1,
    orgIndexCode: orgFallback.trim() || '1',
    remark: `Alta demo ${now.toLocaleString('es-MX')}`,
    phoneNo: phone,
    email: `demo.${last.toLowerCase()}.${Date.now() % 100000}@example.com`,
    cardNo: card,
    beginTime: toDatetimeLocalValue(now),
    endTime: toDatetimeLocalValue(end),
  }
}

function mergeExtraJson(base: Record<string, unknown>): Record<string, unknown> {
  const raw = import.meta.env.VITE_APP_HIK_PERSON_EXTRA_JSON
  if (!raw?.trim()) return base
  try {
    const extra = JSON.parse(raw) as Record<string, unknown>
    /** `extra` primero; el formulario (`base`) gana — evita que un personCode erróneo en .env rompa el alta. */
    return { ...extra, ...base }
  } catch {
    return base
  }
}

function buildPersonPayload(form: PersonFormState): Record<string, unknown> {
  const given = form.personGivenName.trim()
  const family = form.personFamilyName.trim()
  const personCode = form.personCode.trim()
  const base: Record<string, unknown> = {
    personCode: personCodeForApi(personCode),
    personGivenName: given,
    personFamilyName: family,
    gender: form.gender,
    orgIndexCode: form.orgIndexCode.trim(),
    remark: form.remark.trim(),
    phoneNo: form.phoneNo.trim(),
    email: form.email.trim(),
  }
  const card = form.cardNo.replace(/\D/g, '')
  if (card.length >= 4) {
    base.cards = [{ cardNo: card.slice(0, 20) }]
  }
  if (form.beginTime.trim()) {
    base.beginTime = isSyscomPostmanReferenceForm(form)
      ? SYSCOM_POSTMAN_BEGIN_ISO
      : formatDateTimeForHikAccess(form.beginTime)
  }
  if (form.endTime.trim()) {
    base.endTime = isSyscomPostmanReferenceForm(form)
      ? SYSCOM_POSTMAN_END_ISO
      : formatDateTimeForHikAccess(form.endTime)
  }
  if (import.meta.env.VITE_APP_HIK_OMIT_PERSON_NAME !== 'true') {
    base.personName = `${given} ${family}`.trim()
  }
  return mergeExtraJson(base)
}

function prettyJson(v: unknown): string {
  try {
    return JSON.stringify(v, null, 2)
  } catch {
    return String(v)
  }
}

export default function App() {
  const defaultOrg = import.meta.env.VITE_APP_HIK_ORG_INDEX_CODE ?? ''
  const [tab, setTab] = useState<AppTab>('tester')
  const [personForm, setPersonForm] = useState<PersonFormState>(() => ({
    ...emptyPersonForm(),
    orgIndexCode: defaultOrg,
  }))
  const [pageNo, setPageNo] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [lastPersonId, setLastPersonId] = useState('')
  /** Misma persona que lastPersonId: Hik exige personCode en addPersons además del id. */
  const [lastPersonCode, setLastPersonCode] = useState('')
  const [privilegeGroupId, setPrivilegeGroupId] = useState(
    import.meta.env.VITE_APP_HIK_ACCESS_BASE || '1',
  )
  const [privilegeType, setPrivilegeType] = useState(1)
  const [addPersonsListFormat, setAddPersonsListFormat] = useState<AddPersonsListFormat>(() => {
    const r = import.meta.env.VITE_APP_HIK_ADD_PERSONS_LIST_FORMAT?.trim().toLowerCase() ?? ''
    if (r === 'id-only') return 'id-only'
    if (r === 'id-personcode') return 'id-personCode'
    if (r === 'personid-personcode') return 'personId-personCode'
    if (r === 'personcode-only') return 'personCode-only'
    return 'personId-personCode'
  })

  const [lastResult, setLastResult] = useState<string | null>(null)
  const [lastError, setLastError] = useState<string | null>(null)
  const [lastApiJson, setLastApiJson] = useState<unknown>(null)
  const [personIdAutofillNote, setPersonIdAutofillNote] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [pingLines, setPingLines] = useState<{ device: string; hik: string } | null>(null)

  // DEMO states
  const [demoTierId, setDemoTierId] = useState<DemoTierId>('aventura')
  const [demoPresetId, setDemoPresetId] = useState(DEMO_PERSON_PRESETS[0]?.id ?? 'syscom-postman')
  const [demoForm, setDemoForm] = useState<PersonFormState>(() =>
    (DEMO_PERSON_PRESETS[0]?.form(defaultOrg) ?? emptyPersonForm()),
  )
  const [demoLog, setDemoLog] = useState<string | null>(null)
  const [demoTx, setDemoTx] = useState<string | null>(null)
  const [demoWb, setDemoWb] = useState<string | null>(null)
  const [demoCreatedPersonId, setDemoCreatedPersonId] = useState<string | null>(null)
  const [demoCreatedPersonCode, setDemoCreatedPersonCode] = useState<string | null>(null)

  const apiMode = getApiMode()

  const envBlock = useMemo(
    () => ({
      appName: import.meta.env.VITE_APP_NAME ?? '—',
      deviceBase: import.meta.env.VITE_APP_HIK_DEVICE_BASE_URL ?? '',
      hikBase: import.meta.env.VITE_APP_HIKCENTRAL_BASE_URL ?? '',
      appKey: import.meta.env.VITE_APP_HIKCENTRAL_APP_KEY ?? '',
      appSecret: import.meta.env.VITE_APP_HIKCENTRAL_APP_SECRET ?? '',
      apiModeRaw: getApiModeRaw(),
      orgIndex: import.meta.env.VITE_APP_HIK_ORG_INDEX_CODE ?? '',
    }),
    [],
  )

  const run = useCallback(
    async (label: string, fn: () => Promise<void>) => {
      setBusy(label)
      setLastError(null)
      try {
        await fn()
      } catch (e) {
        setLastError(e instanceof Error ? e.message : 'Error')
      } finally {
        setBusy(null)
      }
    },
    [],
  )

  const applyResultToState = (r: ArtemisPostResult) => {
    setLastApiJson(r.json ?? null)
    setLastResult(prettyJson(r.json ?? r.text))
    if (!r.ok && r.errorMessage) setLastError(r.errorMessage)
  }

  const fillPersonFieldsFromLastResponse = () => {
    const pid = extractPersonIdFromAddResponse(lastApiJson)
    const pc = extractPersonCodeFromAddResponse(lastApiJson)
    if (!pid && !pc) {
      setLastError(
        'En la última respuesta no hay personId ni personCode reconocibles. Revisa el JSON abajo.',
      )
      return
    }
    if (pid) setLastPersonId(pid)
    if (pc) setLastPersonCode(pc)
    setPersonIdAutofillNote(
      [
        pid ? `personId: ${pid}` : null,
        pc ? `personCode: ${pc}` : null,
        'Listo para «Asignar grupo».',
      ]
        .filter(Boolean)
        .join(' · '),
    )
    setLastError(null)
  }

  return (
    <div className={tab === 'demo' ? 'app demo-theme' : 'app'}>
      <header className="app-header">
        <div className="brand" style={{ cursor: 'default' }}>
          <span className="brand-mark" aria-hidden>
            ◈
          </span>
          <span className="brand-text">{appName}</span>
        </div>
        <div className="nav" aria-label="Navegación">
          <button
            type="button"
            className={tab === 'tester' ? 'nav-link active' : 'nav-link'}
            onClick={() => setTab('tester')}
          >
            Tester
          </button>
          <button
            type="button"
            className={tab === 'demo' ? 'nav-link active' : 'nav-link'}
            onClick={() => setTab('demo')}
          >
            DEMO
          </button>
          <span
            className={`api-mode-pill ${apiMode}`}
            title="Tras cambiar .env.local, reinicia npm run dev"
          >
            API: {apiMode}
          </span>
        </div>
      </header>

      <main className="main tester-main">
        {tab === 'demo' && (
          <section className="card demo-hero">
            <p className="eyebrow">DEMO</p>
            <h2 className="step-title">Simulador de compra + alta de persona</h2>
            <p className="step-hint">
              Esto simula una compra de nivel (sin cobro real), genera una “pulsera” y crea la persona en
              HikCentral (si estás en modo real). Puedes alternar entre varios perfiles de usuario para probar
              rápido.
            </p>
          </section>
        )}

        {tab === 'demo' && (
          <section className="card demo-grid">
            <div className="demo-col">
              <h3 className="demo-subtitle">1) Perfil</h3>
              <div className="field">
                <label htmlFor="demoPreset">Autollenado</label>
                <select
                  id="demoPreset"
                  value={demoPresetId}
                  onChange={(e) => {
                    const id = e.target.value
                    setDemoPresetId(id)
                    const preset = DEMO_PERSON_PRESETS.find((p) => p.id === id)
                    if (preset) setDemoForm(preset.form(demoForm.orgIndexCode || defaultOrg))
                    setDemoLog(null)
                  }}
                >
                  {DEMO_PERSON_PRESETS.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="field-row two-col">
                <div className="field">
                  <label htmlFor="demoGiven">Nombre</label>
                  <input
                    id="demoGiven"
                    value={demoForm.personGivenName}
                    onChange={(e) => setDemoForm((f) => ({ ...f, personGivenName: e.target.value }))}
                  />
                </div>
                <div className="field">
                  <label htmlFor="demoFamily">Apellidos</label>
                  <input
                    id="demoFamily"
                    value={demoForm.personFamilyName}
                    onChange={(e) => setDemoForm((f) => ({ ...f, personFamilyName: e.target.value }))}
                  />
                </div>
              </div>
              <div className="field-row two-col">
                <div className="field">
                  <label htmlFor="demoCode">personCode</label>
                  <input
                    id="demoCode"
                    className="mono"
                    value={demoForm.personCode}
                    onChange={(e) => setDemoForm((f) => ({ ...f, personCode: e.target.value }))}
                  />
                </div>
                <div className="field">
                  <label htmlFor="demoOrg">orgIndexCode</label>
                  <input
                    id="demoOrg"
                    className="mono"
                    value={demoForm.orgIndexCode}
                    onChange={(e) => setDemoForm((f) => ({ ...f, orgIndexCode: e.target.value }))}
                  />
                </div>
              </div>
              <div className="field-row two-col">
                <div className="field">
                  <label htmlFor="demoPhone">phoneNo</label>
                  <input
                    id="demoPhone"
                    value={demoForm.phoneNo}
                    onChange={(e) => setDemoForm((f) => ({ ...f, phoneNo: e.target.value }))}
                  />
                </div>
                <div className="field">
                  <label htmlFor="demoEmail">email</label>
                  <input
                    id="demoEmail"
                    type="email"
                    value={demoForm.email}
                    onChange={(e) => setDemoForm((f) => ({ ...f, email: e.target.value }))}
                  />
                </div>
              </div>
              <div className="field-row two-col">
                <div className="field">
                  <label htmlFor="demoCard">cardNo</label>
                  <input
                    id="demoCard"
                    className="mono"
                    value={demoForm.cardNo}
                    onChange={(e) => setDemoForm((f) => ({ ...f, cardNo: e.target.value }))}
                  />
                </div>
                <div className="field">
                  <label htmlFor="demoRemark">remark</label>
                  <input
                    id="demoRemark"
                    value={demoForm.remark}
                    onChange={(e) => setDemoForm((f) => ({ ...f, remark: e.target.value }))}
                  />
                </div>
              </div>
              <div className="field-row two-col">
                <div className="field">
                  <label htmlFor="demoBegin">beginTime</label>
                  <input
                    id="demoBegin"
                    type="datetime-local"
                    value={demoForm.beginTime}
                    onChange={(e) => setDemoForm((f) => ({ ...f, beginTime: e.target.value }))}
                  />
                </div>
                <div className="field">
                  <label htmlFor="demoEnd">endTime</label>
                  <input
                    id="demoEnd"
                    type="datetime-local"
                    value={demoForm.endTime}
                    onChange={(e) => setDemoForm((f) => ({ ...f, endTime: e.target.value }))}
                  />
                </div>
              </div>
            </div>

            <div className="demo-col">
              <h3 className="demo-subtitle">2) Nivel</h3>
              <div className="tier-grid demo-tiers">
                {DEMO_TIERS.map((tier) => {
                  const active = demoTierId === tier.id
                  return (
                    <button
                      key={tier.id}
                      type="button"
                      className={active ? 'tier-card card active' : 'tier-card card'}
                      onClick={() => setDemoTierId(tier.id)}
                    >
                      <span className="tier-price">${tier.priceMXN} MXN</span>
                      <h3>{tier.name}</h3>
                      <p className="tier-tagline">{tier.tagline}</p>
                      <ul className="demo-perks">
                        {tier.perks.slice(0, 3).map((x) => (
                          <li key={x}>{x}</li>
                        ))}
                      </ul>
                    </button>
                  )
                })}
              </div>

              <h3 className="demo-subtitle" style={{ marginTop: '1rem' }}>
                3) Comprar (simulado)
              </h3>
              <div className="form-actions spread">
                <button
                  type="button"
                  className="btn primary"
                  disabled={!!busy}
                  onClick={() =>
                    void run('demoBuy', async () => {
                      setDemoLog(null)
                      setDemoCreatedPersonId(null)
                      setDemoCreatedPersonCode(null)
                      setDemoTx(null)
                      setDemoWb(null)

                      // 1) Crear persona en HikCentral (real) usando el mismo endpoint
                      const payload = buildPersonPayload(demoForm)
                      const r = await postArtemis(HIK_ARTEMIS_PATHS.personAdd, payload)
                      applyResultToState(r)
                      if (!r.ok) {
                        setDemoLog('Primero se intenta crear la persona. Falló: revisa “Última respuesta”.')
                        return
                      }
                      const pid = extractPersonIdFromAddResponse(r.json)
                      const pcode = extractPersonCodeFromAddResponse(r.json) ?? demoForm.personCode
                      setDemoCreatedPersonId(pid)
                      setDemoCreatedPersonCode(pcode)

                      // 2) Simular compra (sin cobro real) + pulsera
                      const tx = `TXN-${Date.now().toString(36).toUpperCase()}`
                      const wb = `WB-${Math.random().toString(36).slice(2, 6).toUpperCase()}-${Math.random()
                        .toString(36)
                        .slice(2, 6)
                        .toUpperCase()}`
                      setDemoTx(tx)
                      setDemoWb(wb)
                      setDemoLog(
                        `Persona creada en HikCentral. Luego compra simulada OK — TXN ${tx}, pulsera ${wb}.`,
                      )
                    })
                  }
                >
                  {busy === 'demoBuy' ? 'Procesando…' : 'Crear persona en Hik → simular compra'}
                </button>
              </div>

              {(demoLog || demoTx || demoWb) && (
                <div className="demo-receipt card">
                  <p className="eyebrow">Recibo</p>
                  <ul className="detail-list">
                    <li>
                      <strong>Nivel:</strong> {DEMO_TIERS.find((t) => t.id === demoTierId)?.name ?? '—'}
                    </li>
                    <li>
                      <strong>Transacción:</strong> <span className="mono">{demoTx ?? '—'}</span>
                    </li>
                    <li>
                      <strong>Pulsera:</strong> <span className="mono">{demoWb ?? '—'}</span>
                    </li>
                    <li>
                      <strong>Persona:</strong> <span className="mono">{demoCreatedPersonId ?? '—'}</span>
                    </li>
                    <li>
                      <strong>personCode:</strong> <span className="mono">{demoCreatedPersonCode ?? '—'}</span>
                    </li>
                  </ul>
                  {demoLog && <p className="muted small">{demoLog}</p>}
                </div>
              )}
            </div>
          </section>
        )}

        {tab === 'tester' && (
        <p className="lede tester-lede">
          Probador basado en la colección Postman <strong>HikCentral Open API</strong>: mismas rutas{' '}
          <code className="inline-code">/artemis/api/...</code>, firma Artemis y proxy de desarrollo{' '}
          <code className="inline-code">/hikcentral-proxy</code>.
        </p>
        )}

        {tab === 'tester' && (
        <section className="card">
          <p className="eyebrow">Red</p>
          <h2 className="step-title">Conexión</h2>
          <p className="step-hint">
            Con <code className="inline-code">VITE_APP_API_MODE=real</code> las peticiones van firmadas a
            HikCentral. En modo <code className="inline-code">mock</code> se simulan respuestas sin red.
          </p>
          <button
            type="button"
            className="btn primary"
            disabled={!!busy}
            onClick={() =>
              void run('ping', async () => {
                setPingLines(await runConnectionTests())
              })
            }
          >
            {busy === 'ping' ? 'Probando…' : 'Probar conexiones (dispositivo + Hik)'}
          </button>
          {pingLines && (
            <div className="ping-results">
              <p>
                <strong>Dispositivo:</strong> {pingLines.device}
              </p>
              <p>
                <strong>HikCentral:</strong> {pingLines.hik}
              </p>
            </div>
          )}
        </section>
        )}

        {tab === 'tester' && (
        <section className="card">
          <p className="eyebrow">POST {HIK_ARTEMIS_PATHS.version}</p>
          <h2 className="step-title">Versión (Open API / plataforma)</h2>
          <p className="step-hint">
            Igual que <strong>Obtener version</strong> en la colección Postman. Cuerpo vacío{' '}
            <code className="inline-code">{'{}'}</code>.
          </p>
          <button
            type="button"
            className="btn primary"
            disabled={!!busy}
            onClick={() =>
              void run('version', async () => {
                const r = await postArtemis(HIK_ARTEMIS_PATHS.version, {})
                applyResultToState(r)
              })
            }
          >
            {busy === 'version' ? 'Consultando…' : 'Consultar versión'}
          </button>
        </section>
        )}

        {tab === 'tester' && (
        <section className="card env-table">
          <h2 className="step-title">Entorno</h2>
          <dl className="env-grid">
            <div>
              <dt>VITE_APP_NAME</dt>
              <dd>{envBlock.appName}</dd>
            </div>
            <div>
              <dt>VITE_APP_HIK_DEVICE_BASE_URL</dt>
              <dd className="mono">{envBlock.deviceBase || '—'}</dd>
            </div>
            <div>
              <dt>VITE_APP_HIKCENTRAL_BASE_URL</dt>
              <dd className="mono">{envBlock.hikBase || '—'}</dd>
            </div>
            <div>
              <dt>VITE_APP_HIKCENTRAL_APP_KEY</dt>
              <dd className="mono">{envBlock.appKey ? mask(envBlock.appKey) : '—'}</dd>
            </div>
            <div>
              <dt>VITE_APP_HIKCENTRAL_APP_SECRET</dt>
              <dd className="mono">{envBlock.appSecret ? mask(envBlock.appSecret) : '—'}</dd>
            </div>
            <div>
              <dt>VITE_APP_API_MODE</dt>
              <dd>
                <span className="badge">{apiMode}</span>
                <span className="muted small"> — bundle: {envBlock.apiModeRaw}</span>
              </dd>
            </div>
            <div>
              <dt>VITE_APP_HIK_ORG_INDEX_CODE</dt>
              <dd className="mono">{envBlock.orgIndex || '—'}</dd>
            </div>
          </dl>
        </section>
        )}

        {tab === 'tester' && (
        <section className="card">
          <p className="eyebrow">Consultas POST</p>
          <h2 className="step-title">Listados</h2>
          <p className="step-hint">
            En Open API casi todo es <strong>POST</strong> con JSON (como en Postman).
          </p>
          <div className="tester-actions">
            <button
              type="button"
              className="btn ghost"
              disabled={!!busy}
              onClick={() =>
                void run('org', async () => {
                  const r = await postArtemis(HIK_ARTEMIS_PATHS.orgList, { pageNo: 1, pageSize: 100 })
                  applyResultToState(r)
                })
              }
            >
              Organizaciones
            </button>
            <button
              type="button"
              className="btn ghost"
              disabled={!!busy}
              onClick={() =>
                void run('priv', async () => {
                  const r = await postArtemis(HIK_ARTEMIS_PATHS.privilegeGroupList, {})
                  applyResultToState(r)
                })
              }
            >
              Grupos de privilegio (ACS)
            </button>
            <button
              type="button"
              className="btn ghost"
              disabled={!!busy}
              onClick={() =>
                void run('veh', async () => {
                  const r = await postArtemis(HIK_ARTEMIS_PATHS.vehicleList, {
                    pageNo: 1,
                    pageSize: 10,
                    vehicleGroupIndexCode: '0',
                  })
                  applyResultToState(r)
                })
              }
            >
              Vehículos (ejemplo)
            </button>
          </div>
          <div className="field-row">
            <div className="field compact">
              <label htmlFor="pageNo">pageNo</label>
              <input
                id="pageNo"
                type="number"
                min={1}
                value={pageNo}
                onChange={(e) => setPageNo(Number(e.target.value) || 1)}
              />
            </div>
            <div className="field compact">
              <label htmlFor="pageSize">pageSize</label>
              <input
                id="pageSize"
                type="number"
                min={1}
                max={500}
                value={pageSize}
                onChange={(e) => setPageSize(Number(e.target.value) || 10)}
              />
            </div>
            <button
              type="button"
              className="btn primary"
              disabled={!!busy}
              onClick={() =>
                void run('persons', async () => {
                  const r = await postArtemis(HIK_ARTEMIS_PATHS.personList, { pageNo, pageSize })
                  applyResultToState(r)
                })
              }
            >
              Personas
            </button>
          </div>
        </section>
        )}

        {tab === 'tester' && (
        <section className="card">
          <p className="eyebrow">POST {HIK_ARTEMIS_PATHS.personAdd}</p>
          <h2 className="step-title">Alta de persona</h2>
          <p className="step-hint">
            <strong>HikCentral Open API</strong> (<code className="inline-code">/artemis/…/person/single/add</code>): mismo
            enfoque que la colección Postman. Los PDF de SYSCOM sobre eventos <strong>MinMoe</strong> suelen describir{' '}
            <strong>ISAPI en el lector</strong> (HTTP al terminal), no este endpoint; el alta aquí es la de plataforma.
            Se envía <code className="inline-code">personName</code>, <code className="inline-code">personCode</code> como{' '}
            <strong>string</strong> (como &quot;1596&quot;), y fechas con <strong>tu huso horario</strong> (no UTC forzado).
            Para forzar <code className="inline-code">personCode</code> numérico en JSON:{' '}
            <code className="inline-code">VITE_APP_HIK_PERSON_CODE_JSON_NUMBER=true</code>.{' '}
            <code className="inline-code">VITE_APP_HIK_PERSON_EXTRA_JSON</code> se fusiona primero; el formulario gana.
          </p>
          <div className="tester-actions" style={{ marginBottom: '0.75rem' }}>
            <button
              type="button"
              className="btn primary"
              disabled={!!busy}
              onClick={() => {
                setPersonForm(buildSyscomPostmanReferenceForm(personForm.orgIndexCode || defaultOrg))
                setPersonIdAutofillNote(null)
              }}
            >
              Autollenar (ejemplo Postman / SYSCOM)
            </button>
            <button
              type="button"
              className="btn ghost"
              disabled={!!busy}
              onClick={() => {
                setPersonForm(buildDemoPersonForm(personForm.orgIndexCode || defaultOrg))
                setPersonIdAutofillNote(null)
              }}
            >
              Autollenar datos aleatorios
            </button>
          </div>
          <p className="muted small" style={{ marginBottom: '0.75rem' }}>
            La plantilla fija vive en{' '}
            <code className="inline-code">src/reference/syscomPostmanPerson.ts</code>. No incluye{' '}
            <code className="inline-code">faces</code> (JPEG en base64): úsalo en{' '}
            <code className="inline-code">VITE_APP_HIK_PERSON_EXTRA_JSON</code> si tu servidor lo exige.
          </p>
          <div className="field-row">
            <div className="field grow">
              <label htmlFor="personCode">personCode</label>
              <input
                id="personCode"
                className="mono"
                value={personForm.personCode}
                onChange={(e) => setPersonForm((f) => ({ ...f, personCode: e.target.value }))}
                placeholder="Recomendado: solo números"
              />
            </div>
            <button
              type="button"
              className="btn ghost"
              onClick={() => setPersonForm((f) => ({ ...f, personCode: randomNumericPersonCode() }))}
              title="Genera solo personCode numérico"
            >
              Solo código
            </button>
          </div>
          <div className="field-row two-col">
            <div className="field">
              <label htmlFor="given">personGivenName</label>
              <input
                id="given"
                value={personForm.personGivenName}
                onChange={(e) => setPersonForm((f) => ({ ...f, personGivenName: e.target.value }))}
                autoComplete="given-name"
              />
            </div>
            <div className="field">
              <label htmlFor="family">personFamilyName</label>
              <input
                id="family"
                value={personForm.personFamilyName}
                onChange={(e) => setPersonForm((f) => ({ ...f, personFamilyName: e.target.value }))}
                autoComplete="family-name"
              />
            </div>
          </div>
          <div className="field-row two-col">
            <div className="field">
              <label htmlFor="gender">gender</label>
              <select
                id="gender"
                value={personForm.gender}
                onChange={(e) => setPersonForm((f) => ({ ...f, gender: Number(e.target.value) }))}
              >
                <option value={0}>0</option>
                <option value={1}>1 — habitual en muestras Postman</option>
                <option value={2}>2 (si tu servidor lo acepta)</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="org">orgIndexCode</label>
              <input
                id="org"
                className="mono"
                value={personForm.orgIndexCode}
                onChange={(e) => setPersonForm((f) => ({ ...f, orgIndexCode: e.target.value }))}
              />
            </div>
          </div>
          <div className="field">
            <label htmlFor="remark">remark</label>
            <input
              id="remark"
              value={personForm.remark}
              onChange={(e) => setPersonForm((f) => ({ ...f, remark: e.target.value }))}
            />
          </div>
          <div className="field-row two-col">
            <div className="field">
              <label htmlFor="phone">phoneNo</label>
              <input
                id="phone"
                value={personForm.phoneNo}
                onChange={(e) => setPersonForm((f) => ({ ...f, phoneNo: e.target.value }))}
              />
            </div>
            <div className="field">
              <label htmlFor="email">email</label>
              <input
                id="email"
                type="email"
                value={personForm.email}
                onChange={(e) => setPersonForm((f) => ({ ...f, email: e.target.value }))}
              />
            </div>
          </div>
          <div className="field-row two-col">
            <div className="field">
              <label htmlFor="card">cardNo (opcional)</label>
              <input
                id="card"
                className="mono"
                value={personForm.cardNo}
                onChange={(e) => setPersonForm((f) => ({ ...f, cardNo: e.target.value }))}
                placeholder="Solo dígitos, ≥4 → se envía como cards[]"
              />
            </div>
            <div className="field">
              <label htmlFor="bt">beginTime (opcional)</label>
              <input
                id="bt"
                type="datetime-local"
                value={personForm.beginTime}
                onChange={(e) => setPersonForm((f) => ({ ...f, beginTime: e.target.value }))}
              />
            </div>
          </div>
          <div className="field">
            <label htmlFor="et">endTime (opcional)</label>
            <input
              id="et"
              type="datetime-local"
              value={personForm.endTime}
              onChange={(e) => setPersonForm((f) => ({ ...f, endTime: e.target.value }))}
            />
          </div>
          <div className="form-actions">
            <button
              type="button"
              className="btn primary"
              disabled={!!busy}
              onClick={() =>
                void run('addPerson', async () => {
                  if (!personForm.personCode.trim() || !personForm.orgIndexCode.trim()) {
                    setLastError('personCode y orgIndexCode son obligatorios.')
                    return
                  }
                  if (!personForm.personGivenName.trim() || !personForm.personFamilyName.trim()) {
                    setLastError('personGivenName y personFamilyName son obligatorios.')
                    return
                  }
                  const payload = buildPersonPayload(personForm)
                  const r = await postArtemis(HIK_ARTEMIS_PATHS.personAdd, payload)
                  setPersonIdAutofillNote(null)
                  applyResultToState(r)
                  if (r.ok && r.json) {
                    const pid = extractPersonIdFromAddResponse(r.json)
                    const pcForm = personForm.personCode.trim()
                    const pcResp = extractPersonCodeFromAddResponse(r.json)
                    setLastPersonCode(pcForm || pcResp || '')
                    if (pid) {
                      setLastPersonId(pid)
                      const pc = pcForm || pcResp || ''
                      setPersonIdAutofillNote(
                        pc
                          ? `Siguiente paso — personId: ${pid} · personCode: ${pc}`
                          : `personId: ${pid}. Añade personCode manualmente para asignar grupo, o vuelve a crear con código en el formulario.`,
                      )
                    } else {
                      setPersonIdAutofillNote(
                        'Alta correcta, pero no se detectó personId. Pulsa «Rellenar desde última respuesta» o revisa el JSON.',
                      )
                    }
                  }
                })
              }
            >
              {busy === 'addPerson' ? 'Enviando…' : 'Crear persona'}
            </button>
          </div>
        </section>
        )}

        {tab === 'tester' && (
        <section className="card">
          <p className="eyebrow">POST {HIK_ARTEMIS_PATHS.privilegeAddPersons}</p>
          <h2 className="step-title">Asignar persona a grupo de privilegio</h2>
          <p className="step-hint">
            El error <code className="inline-code">personCode parameter error</code> suele deberse al{' '}
            <strong>formato del elemento en list</strong> (depende de la versión HCP) o a{' '}
            <code className="inline-code">personCode</code> duplicado / inválido en el alta. Prueba otro valor en
            «Formato list»; en el alta usamos <code className="inline-code">personCode</code> como número JSON si es
            solo dígitos. Puedes fijar el formato por defecto con{' '}
            <code className="inline-code">VITE_APP_HIK_ADD_PERSONS_LIST_FORMAT</code> (
            <code className="inline-code">id-only</code>, <code className="inline-code">id-personCode</code>,{' '}
            <code className="inline-code">personId-personCode</code>, <code className="inline-code">personCode-only</code>
            ).
          </p>
          <div className="field">
            <label htmlFor="listFormat">Formato list (addPersons)</label>
            <select
              id="listFormat"
              value={addPersonsListFormat}
              onChange={(e) => setAddPersonsListFormat(e.target.value as AddPersonsListFormat)}
            >
              <option value="personId-personCode">personId + personCode (recomendado si falla Postman)</option>
              <option value="id-personCode">id + personCode</option>
              <option value="id-only">Solo id (Postman oficial)</option>
              <option value="personCode-only">Solo personCode</option>
            </select>
          </div>
          <div className="field-row two-col">
            <div className="field">
              <label htmlFor="pgid">privilegeGroupId</label>
              <input
                id="pgid"
                className="mono"
                value={privilegeGroupId}
                onChange={(e) => setPrivilegeGroupId(e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="ptype">type</label>
              <input
                id="ptype"
                type="number"
                value={privilegeType}
                onChange={(e) => setPrivilegeType(Number(e.target.value) || 1)}
              />
            </div>
          </div>
          <div className="field">
            <label htmlFor="pid">personId</label>
            <input
              id="pid"
              className="mono"
              value={lastPersonId}
              onChange={(e) => {
                setLastPersonId(e.target.value)
                setPersonIdAutofillNote(null)
              }}
              placeholder="Se rellena solo al crear persona o con el botón de abajo"
            />
            {personIdAutofillNote && (
              <p className="muted small personid-hint" role="status">
                {personIdAutofillNote}
              </p>
            )}
            <div className="field">
              <label htmlFor="pcode">personCode (para addPersons)</label>
              <input
                id="pcode"
                className="mono"
                value={lastPersonCode}
                onChange={(e) => {
                  setLastPersonCode(e.target.value)
                  setPersonIdAutofillNote(null)
                }}
                placeholder="Debe coincidir con el alta de persona"
              />
            </div>
            <div className="field-row" style={{ marginTop: '0.5rem' }}>
              <button
                type="button"
                className="btn ghost"
                disabled={!lastResult}
                onClick={() => fillPersonFieldsFromLastResponse()}
              >
                Rellenar personId y personCode desde última respuesta
              </button>
            </div>
          </div>
          <div className="form-actions">
            <button
              type="button"
              className="btn primary"
              disabled={
                !!busy ||
                (addPersonsListFormat !== 'personCode-only' && !lastPersonId.trim()) ||
                (addPersonsListFormat !== 'id-only' && !lastPersonCode.trim())
              }
              onClick={() =>
                void run('addPriv', async () => {
                  const r = await postArtemis(HIK_ARTEMIS_PATHS.privilegeAddPersons, {
                    privilegeGroupId: privilegeGroupId.trim(),
                    type: privilegeType,
                    list: buildAddPersonsList(
                      addPersonsListFormat,
                      lastPersonId,
                      lastPersonCode,
                    ),
                  })
                  applyResultToState(r)
                })
              }
            >
              {busy === 'addPriv' ? 'Enviando…' : 'Asignar grupo'}
            </button>
          </div>
        </section>
        )}

        {tab === 'tester' && (lastError || lastResult) && (
          <section className="card tester-response">
            <h2 className="step-title">Última respuesta</h2>
            {lastError && (
              <div className="error-banner" role="alert">
                {lastError}
              </div>
            )}
            {lastResult && <pre className="payload-pre tester-pre">{lastResult}</pre>}
          </section>
        )}
      </main>

      <footer className="footer">
        <p>HikCentral Open API — probador local. No almacena credenciales fuera de .env.local.</p>
      </footer>
    </div>
  )
}
