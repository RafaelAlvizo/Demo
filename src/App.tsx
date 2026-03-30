import { useCallback, useMemo, useState } from 'react'
import {
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

function randomPersonCode(): string {
  const n = Math.random().toString(36).slice(2, 10).toUpperCase()
  return `TEST-${n}`
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

function buildPersonPayload(form: PersonFormState): Record<string, unknown> {
  const base: Record<string, unknown> = {
    personCode: form.personCode.trim(),
    personGivenName: form.personGivenName.trim(),
    personFamilyName: form.personFamilyName.trim(),
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

  const fillPersonIdFromLastResponse = () => {
    const pid = extractPersonIdFromAddResponse(lastApiJson)
    if (pid) {
      setLastPersonId(pid)
      setPersonIdAutofillNote(`PersonId tomado de la última respuesta: ${pid}`)
      setLastError(null)
    } else {
      setLastError('No hay personId reconocible en la última respuesta. Revisa el JSON abajo.')
    }
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
            Campos alineados con la petición <strong>Agregar persona</strong> de la colección (sin foto; puedes
            fusionar JSON con <code className="inline-code">VITE_APP_HIK_PERSON_EXTRA_JSON</code>).
          </p>
          <div className="field-row">
            <div className="field grow">
              <label htmlFor="personCode">personCode</label>
              <input
                id="personCode"
                className="mono"
                value={personForm.personCode}
                onChange={(e) => setPersonForm((f) => ({ ...f, personCode: e.target.value }))}
              />
            </div>
            <button
              type="button"
              className="btn ghost"
              onClick={() => setPersonForm((f) => ({ ...f, personCode: randomPersonCode() }))}
            >
              Generar
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
                <option value={1}>1 — habitual en muestras Postman</option>
                <option value={2}>2</option>
                <option value={0}>0</option>
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
                    if (pid) {
                      setLastPersonId(pid)
                      setPersonIdAutofillNote(`Listo para asignar grupo — personId: ${pid}`)
                    } else {
                      setPersonIdAutofillNote(
                        'Alta correcta, pero no se detectó personId en la respuesta. Pulsa «Rellenar desde última respuesta» o cópialo del JSON.',
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
            Misma forma que <strong>Agregar persona a nivel de acceso</strong> en Postman:{' '}
            <code className="inline-code">privilegeGroupId</code>, <code className="inline-code">type</code>,{' '}
            <code className="inline-code">list[].id</code> = personId.
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
            <div className="field-row" style={{ marginTop: '0.5rem' }}>
              <button
                type="button"
                className="btn ghost"
                disabled={!lastResult}
                onClick={() => fillPersonIdFromLastResponse()}
              >
                Rellenar personId desde última respuesta
              </button>
            </div>
          </div>
          <div className="form-actions">
            <button
              type="button"
              className="btn primary"
              disabled={!!busy || !lastPersonId.trim()}
              onClick={() =>
                void run('addPriv', async () => {
                  const r = await postArtemis(HIK_ARTEMIS_PATHS.privilegeAddPersons, {
                    privilegeGroupId: privilegeGroupId.trim(),
                    type: privilegeType,
                    list: [{ id: lastPersonId.trim() }],
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
