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
import { emptyPersonForm, type PersonFormState } from './types'
import './App.css'

const appName = import.meta.env.VITE_APP_NAME ?? 'HikCentral API tester'

function mask(s: string): string {
  if (s.length <= 4) return '••••'
  return `${s.slice(0, 2)}…${s.slice(-2)}`
}

/**
 * Código corto numérico (p. ej. Postman usa "1596", "998"). Los timestamp largos suelen provocar
 * code 2 "personCode parameter error" por longitud o reglas del servidor.
 */
function randomNumericPersonCode(): string {
  const t = Date.now() % 1_000_000
  const r = Math.floor(1000 + Math.random() * 9000)
  const s = `${t}${r}`.replace(/\D/g, '')
  return s.slice(-9).replace(/^0+/, '') || String(1000 + r)
}

function toDatetimeLocalValue(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
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
  const card = String(Math.floor(1e11 + Math.random() * 9e11))
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
    personCode,
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
    base.beginTime = new Date(form.beginTime).toISOString()
  }
  if (form.endTime.trim()) {
    base.endTime = new Date(form.endTime).toISOString()
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

  const [lastResult, setLastResult] = useState<string | null>(null)
  const [lastError, setLastError] = useState<string | null>(null)
  const [lastApiJson, setLastApiJson] = useState<unknown>(null)
  const [personIdAutofillNote, setPersonIdAutofillNote] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [pingLines, setPingLines] = useState<{ device: string; hik: string } | null>(null)

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
    <div className="app">
      <header className="app-header">
        <div className="brand" style={{ cursor: 'default' }}>
          <span className="brand-mark" aria-hidden>
            ◈
          </span>
          <span className="brand-text">{appName}</span>
        </div>
        <div className="nav" aria-label="Estado">
          <span
            className={`api-mode-pill ${apiMode}`}
            title="Tras cambiar .env.local, reinicia npm run dev"
          >
            API: {apiMode}
          </span>
        </div>
      </header>

      <main className="main tester-main">
        <p className="lede tester-lede">
          Probador basado en la colección Postman <strong>HikCentral Open API</strong>: mismas rutas{' '}
          <code className="inline-code">/artemis/api/...</code>, firma Artemis y proxy de desarrollo{' '}
          <code className="inline-code">/hikcentral-proxy</code>.
        </p>

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

        <section className="card">
          <p className="eyebrow">POST {HIK_ARTEMIS_PATHS.personAdd}</p>
          <h2 className="step-title">Alta de persona</h2>
          <p className="step-hint">
            Campos alineados con <strong>Agregar persona</strong> en Postman (sin foto). El{' '}
            <strong>personCode</strong> debe ser <strong>corto y numérico</strong> (estilo “1596”); códigos muy
            largos suelen provocar <code className="inline-code">code 2 · personCode parameter error</code>.{' '}
            <code className="inline-code">VITE_APP_HIK_PERSON_EXTRA_JSON</code> se fusiona antes del formulario: los
            valores que escribes aquí tienen prioridad (así un extra no pisa el personCode).
          </p>
          <div className="tester-actions" style={{ marginBottom: '0.75rem' }}>
            <button
              type="button"
              className="btn primary"
              disabled={!!busy}
              onClick={() => {
                setPersonForm(buildDemoPersonForm(personForm.orgIndexCode || defaultOrg))
                setPersonIdAutofillNote(null)
              }}
            >
              Autollenar todo (demo) → luego Crear persona
            </button>
          </div>
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

        <section className="card">
          <p className="eyebrow">POST {HIK_ARTEMIS_PATHS.privilegeAddPersons}</p>
          <h2 className="step-title">Asignar persona a grupo de privilegio</h2>
          <p className="step-hint">
            En muchas instalaciones Hik el cuerpo debe incluir <strong>personId</strong> y{' '}
            <strong>personCode</strong> en cada elemento de <code className="inline-code">list</code> (si falta{' '}
            <code className="inline-code">personCode</code>, error «personCode parameter error»). Se rellenan al
            crear persona con éxito.
          </p>
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
              disabled={!!busy || !lastPersonId.trim() || !lastPersonCode.trim()}
              onClick={() =>
                void run('addPriv', async () => {
                  const pid = lastPersonId.trim()
                  const pcode = lastPersonCode.trim()
                  const r = await postArtemis(HIK_ARTEMIS_PATHS.privilegeAddPersons, {
                    privilegeGroupId: privilegeGroupId.trim(),
                    type: privilegeType,
                    list: [{ id: pid, personCode: pcode }],
                  })
                  applyResultToState(r)
                })
              }
            >
              {busy === 'addPriv' ? 'Enviando…' : 'Asignar grupo'}
            </button>
          </div>
        </section>

        {(lastError || lastResult) && (
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
