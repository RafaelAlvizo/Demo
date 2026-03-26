import { useState, type FormEvent } from 'react'
import { syncVisitorToHikCentral, tierToAccessLabel } from './api/hikcentral'
import {
  generateTransactionId,
  generateWristbandCode,
  runConnectionTests,
  simulatePayment,
} from './api/mock'
import { ToramProvider, useToram } from './context/ToramContext'
import { DEMO_TIER_ID, getDemoGuestForToday } from './demo/demoVisitor'
import { TIERS } from './types'
import './App.css'

const appName = import.meta.env.VITE_APP_NAME ?? 'TORAM'

function mask(s: string): string {
  if (s.length <= 4) return '••••'
  return `${s.slice(0, 2)}…${s.slice(-2)}`
}

function Header() {
  const { view, setView } = useToram()
  return (
    <header className="app-header">
      <button type="button" className="brand" onClick={() => setView('landing')}>
        <span className="brand-mark" aria-hidden>
          ★
        </span>
        <span className="brand-text">{appName}</span>
      </button>
      <nav className="nav" aria-label="Principal">
        <button
          type="button"
          className={view === 'landing' ? 'nav-link active' : 'nav-link'}
          onClick={() => setView('landing')}
        >
          Inicio
        </button>
        <button
          type="button"
          className={view === 'wizard' ? 'nav-link active' : 'nav-link'}
          onClick={() => setView('wizard')}
        >
          Registro
        </button>
        <button
          type="button"
          className={view === 'integration' ? 'nav-link active' : 'nav-link'}
          onClick={() => setView('integration')}
        >
          Integración
        </button>
      </nav>
    </header>
  )
}

function Landing() {
  const { startWizard, setView } = useToram()
  return (
    <div className="page landing">
      <section className="hero-card card">
        <p className="eyebrow">Parque de demostración</p>
        <h1>Bienvenido a TORAM</h1>
        <p className="lede">
          Registro → nivel → pago simulado → pulsera. Sirve para probar el flujo y las URLs de
          integración.
        </p>
        <div className="flow-steps" aria-label="Flujo">
          <div className="flow-step">
            <span className="flow-num">1</span>
            <div>
              <h2>Registro</h2>
              <p>Datos del visitante.</p>
            </div>
          </div>
          <div className="flow-step">
            <span className="flow-num">2</span>
            <div>
              <h2>Nivel</h2>
              <p>Explorador, Aventura u Oro sin límites.</p>
            </div>
          </div>
          <div className="flow-step">
            <span className="flow-num">3</span>
            <div>
              <h2>Pago simulado</h2>
              <p>Sin cobro real.</p>
            </div>
          </div>
          <div className="flow-step">
            <span className="flow-num">4</span>
            <div>
              <h2>Pulsera</h2>
              <p>Código WB y datos de acceso (demo).</p>
            </div>
          </div>
        </div>
        <div className="cta-row">
          <button type="button" className="btn primary" onClick={startWizard}>
            Comenzar
          </button>
          <button type="button" className="btn ghost" onClick={() => setView('integration')}>
            Probar conexiones
          </button>
        </div>
      </section>
    </div>
  )
}

function isValidEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim())
}
function isValidPhone(s: string): boolean {
  const d = s.replace(/\D/g, '')
  return d.length >= 8 && d.length <= 15
}

const phases = [
  { key: 'payment' as const, label: 'Pago simulado…' },
  { key: 'wristband' as const, label: 'Tarjeta / pulsera…' },
  { key: 'sync' as const, label: 'Alta en HikCentral…' },
]

function Wizard() {
  const {
    step,
    setStep,
    guest,
    setGuest,
    selectedTier,
    setSelectedTierId,
    payment,
    setPayment,
    setView,
    resetWizard,
  } = useToram()
  const [touched, setTouched] = useState(false)
  const [busy, setBusy] = useState(false)

  const errors: Record<string, string> = {}
  if (!guest.firstName.trim() || guest.firstName.trim().length < 1) {
    errors.firstName = 'Nombre requerido.'
  }
  if (!guest.lastName.trim() || guest.lastName.trim().length < 1) {
    errors.lastName = 'Apellidos requeridos.'
  }
  if (!isValidEmail(guest.email)) errors.email = 'Correo no válido.'
  if (!isValidPhone(guest.phone)) errors.phone = 'Teléfono no válido.'
  if (!guest.visitDate) errors.visitDate = 'Elige fecha.'

  const regOk = Object.keys(errors).length === 0

  async function runSimulation() {
    if (!selectedTier || busy) return
    setBusy(true)
    try {
      setPayment({
        phase: 'payment',
        transactionId: null,
        wristbandCode: null,
        accessGate: null,
        validUntil: null,
        errorMessage: null,
        hikPersonId: null,
        hikDetail: null,
        hikPayloadPreview: null,
      })
      await new Promise((r) => setTimeout(r, 350))

      const { transactionId } = await simulatePayment(selectedTier)
      const wb = generateWristbandCode()
      setPayment({
        phase: 'wristband',
        transactionId,
        wristbandCode: wb,
        accessGate: null,
        validUntil: null,
        errorMessage: null,
        hikPersonId: null,
        hikDetail: null,
        hikPayloadPreview: null,
      })
      await new Promise((r) => setTimeout(r, 400))

      setPayment((p) => ({ ...p, phase: 'sync' }))
      const sync = await syncVisitorToHikCentral({
        guest,
        tier: selectedTier,
        wristbandCode: wb,
      })
      setPayment({
        phase: 'done',
        transactionId,
        wristbandCode: wb,
        accessGate: sync.accessGate,
        validUntil: sync.validUntil,
        errorMessage: sync.ok ? null : 'Aviso: revisar respuesta HikCentral.',
        hikPersonId: sync.personId,
        hikDetail: sync.detail,
        hikPayloadPreview: sync.lastRequestPreview ?? null,
      })
      setStep(3)
    } catch (e) {
      setPayment({
        phase: 'error',
        transactionId: generateTransactionId(),
        wristbandCode: null,
        accessGate: null,
        validUntil: null,
        errorMessage: e instanceof Error ? e.message : 'Error',
        hikPersonId: null,
        hikDetail: null,
        hikPayloadPreview: null,
      })
    } finally {
      setBusy(false)
    }
  }

  const labels = ['Registro', 'Nivel', 'Pago', 'Listo']
  const idx = phases.findIndex((p) => p.key === payment.phase)
  const displayIdx = idx >= 0 ? idx : 0

  return (
    <div className="page wizard-page">
      <div className="wizard-shell card">
        <div className="wizard-header">
          <p className="eyebrow">Asistente</p>
          <h1>Registro TORAM</h1>
          <ol className="stepper" aria-label="Pasos">
            {labels.map((label, i) => (
              <li
                key={label}
                className={
                  i === step ? 'stepper-item current' : i < step ? 'stepper-item done' : 'stepper-item'
                }
              >
                <span className="stepper-num">{i + 1}</span>
                <span className="stepper-label">{label}</span>
              </li>
            ))}
          </ol>
        </div>

        <div className="wizard-body">
          {step === 0 && (
            <form
              className="step-form"
              onSubmit={(e: FormEvent) => {
                e.preventDefault()
                setTouched(true)
                if (!regOk) return
                setStep(1)
              }}
              noValidate
            >
              <h2 className="step-title">Visitante</h2>
              <p className="step-hint">
                Persona en departamento Visitas (configura el índice en variables de entorno).
              </p>
              <div className="field">
                <label htmlFor="firstName">Nombre</label>
                <input
                  id="firstName"
                  autoComplete="given-name"
                  value={guest.firstName}
                  onChange={(e) => setGuest((g) => ({ ...g, firstName: e.target.value }))}
                  aria-invalid={touched && !!errors.firstName}
                />
                {touched && errors.firstName && <p className="field-error">{errors.firstName}</p>}
              </div>
              <div className="field">
                <label htmlFor="lastName">Apellidos</label>
                <input
                  id="lastName"
                  autoComplete="family-name"
                  value={guest.lastName}
                  onChange={(e) => setGuest((g) => ({ ...g, lastName: e.target.value }))}
                  aria-invalid={touched && !!errors.lastName}
                />
                {touched && errors.lastName && <p className="field-error">{errors.lastName}</p>}
              </div>
              <div className="field">
                <label htmlFor="gender">Sexo</label>
                <select
                  id="gender"
                  value={guest.gender}
                  onChange={(e) =>
                    setGuest((g) => ({ ...g, gender: e.target.value as 'male' | 'female' }))
                  }
                >
                  <option value="male">Masculino</option>
                  <option value="female">Femenino</option>
                </select>
              </div>
              <div className="field">
                <label htmlFor="email">Correo</label>
                <input
                  id="email"
                  type="email"
                  value={guest.email}
                  onChange={(e) => setGuest((g) => ({ ...g, email: e.target.value }))}
                />
                {touched && errors.email && <p className="field-error">{errors.email}</p>}
              </div>
              <div className="field">
                <label htmlFor="phone">Teléfono</label>
                <input
                  id="phone"
                  value={guest.phone}
                  onChange={(e) => setGuest((g) => ({ ...g, phone: e.target.value }))}
                />
                {touched && errors.phone && <p className="field-error">{errors.phone}</p>}
              </div>
              <div className="field">
                <label htmlFor="visitDate">Fecha de visita</label>
                <input
                  id="visitDate"
                  type="date"
                  value={guest.visitDate}
                  onChange={(e) => setGuest((g) => ({ ...g, visitDate: e.target.value }))}
                />
                {touched && errors.visitDate && <p className="field-error">{errors.visitDate}</p>}
              </div>
              <div className="form-actions">
                <button
                  type="button"
                  className="btn ghost"
                  onClick={() => {
                    setGuest(getDemoGuestForToday())
                    setSelectedTierId(DEMO_TIER_ID)
                    setTouched(true)
                  }}
                >
                  Rellenar demo (visitante + nivel Oro/VIP)
                </button>
                <button type="submit" className="btn primary">
                  Continuar
                </button>
              </div>
            </form>
          )}

          {step === 1 && (
            <div className="step-tier">
              <h2 className="step-title">Nivel</h2>
              <div className="tier-grid">
                {TIERS.map((tier) => {
                  const active = selectedTier?.id === tier.id
                  return (
                    <button
                      key={tier.id}
                      type="button"
                      className={active ? 'tier-card card active' : 'tier-card card'}
                      onClick={() => setSelectedTierId(tier.id)}
                    >
                      <span className="tier-price">{tier.priceLabel}</span>
                      <h3>{tier.name}</h3>
                      <p className="tier-tagline">{tier.tagline}</p>
                    </button>
                  )
                })}
              </div>
              <div className="form-actions spread">
                <button type="button" className="btn ghost" onClick={() => setStep(0)}>
                  Atrás
                </button>
                <button
                  type="button"
                  className="btn primary"
                  disabled={!selectedTier}
                  onClick={() => setStep(2)}
                >
                  Siguiente
                </button>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="step-payment">
              <h2 className="step-title">Pago y sincronización</h2>
              <p className="step-hint">
                Sin cobro real. Con <code className="inline-code">VITE_APP_API_MODE=real</code> se
                envía la persona a HikCentral (necesitas org y niveles en .env; el proxy{' '}
                <code className="inline-code">/__hik</code> solo en desarrollo).
              </p>
              {!selectedTier && <p className="warn-banner">Elige un nivel antes.</p>}

              <div className="timeline card">
                {phases.map((p, i) => {
                  const done = i < displayIdx || payment.phase === 'done'
                  const active =
                    busy && i === displayIdx && payment.phase !== 'done' && payment.phase !== 'error'
                  return (
                    <div
                      key={p.key}
                      className={done ? 'tl-item done' : active ? 'tl-item active' : 'tl-item'}
                    >
                      <span className="tl-dot" aria-hidden />
                      <div>
                        <p className="tl-label">{p.label}</p>
                        {active && <div className="tl-bar" aria-hidden />}
                      </div>
                    </div>
                  )
                })}
              </div>

              {payment.phase === 'error' && (
                <div className="error-banner" role="alert">
                  {payment.errorMessage}
                </div>
              )}

              <div className="form-actions spread">
                <button type="button" className="btn ghost" onClick={() => setStep(1)}>
                  Atrás
                </button>
                <button
                  type="button"
                  className="btn primary"
                  disabled={!selectedTier || busy}
                  onClick={() => void runSimulation()}
                >
                  {busy ? 'Procesando…' : 'Ejecutar simulación'}
                </button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="step-success">
              <div className="success-hero card">
                <p className="eyebrow success">Listo</p>
                <h2 className="step-title">Pulsera</h2>
              </div>
              <div className="detail-grid">
                <div className="card detail-card">
                  <h3>Código</h3>
                  <p className="mono big-code">{payment.wristbandCode ?? '—'}</p>
                </div>
                <div className="card detail-card">
                  <h3>Transacción</h3>
                  <p className="mono">{payment.transactionId ?? '—'}</p>
                </div>
                <div className="card detail-card wide">
                  <h3>Acceso</h3>
                  <ul className="detail-list">
                    <li>
                      <strong>Visitante:</strong> {guest.firstName} {guest.lastName}
                    </li>
                    <li>
                      <strong>Nivel TORAM:</strong> {selectedTier?.name ?? '—'} (
                      {selectedTier ? tierToAccessLabel(selectedTier.id) : '—'})
                    </li>
                    <li>
                      <strong>HikCentral (ID persona):</strong> {payment.hikPersonId ?? '—'}
                    </li>
                    <li>
                      <strong>Sincronización:</strong> {payment.hikDetail ?? '—'}
                    </li>
                    <li>
                      <strong>Entrada:</strong> {payment.accessGate ?? '—'}
                    </li>
                    <li>
                      <strong>Validez:</strong> {payment.validUntil ?? '—'}
                    </li>
                  </ul>
                </div>
              </div>
              {payment.hikPayloadPreview && (
                <details className="card payload-preview">
                  <summary className="payload-summary">
                    Datos para HikCentral (coinciden con el formulario y con el POST en modo real)
                  </summary>
                  <pre className="payload-pre">{payment.hikPayloadPreview}</pre>
                </details>
              )}
              <div className="form-actions spread">
                <button type="button" className="btn ghost" onClick={() => resetWizard()}>
                  Nuevo registro
                </button>
                <button type="button" className="btn primary" onClick={() => setView('landing')}>
                  Inicio
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function IntegrationPage() {
  const [loading, setLoading] = useState(false)
  const [lines, setLines] = useState<{ device: string; hik: string } | null>(null)

  const appName = import.meta.env.VITE_APP_NAME ?? '—'
  const deviceBase = import.meta.env.VITE_APP_HIK_DEVICE_BASE_URL ?? ''
  const hikBase = import.meta.env.VITE_APP_HIKCENTRAL_BASE_URL ?? ''
  const appKey = import.meta.env.VITE_APP_HIKCENTRAL_APP_KEY ?? ''
  const appSecret = import.meta.env.VITE_APP_HIKCENTRAL_APP_SECRET ?? ''
  const apiMode = import.meta.env.VITE_APP_API_MODE ?? 'mock'
  const orgIndex = import.meta.env.VITE_APP_HIK_ORG_INDEX_CODE ?? ''
  const accB = import.meta.env.VITE_APP_HIK_ACCESS_BASE ?? ''
  const accP = import.meta.env.VITE_APP_HIK_ACCESS_PREMIUM ?? ''
  const accV = import.meta.env.VITE_APP_HIK_ACCESS_VIP ?? ''

  async function test() {
    setLoading(true)
    try {
      setLines(await runConnectionTests())
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="page integration-page">
      <section className="card integration-hero">
        <p className="eyebrow">Red</p>
        <h1>Integración</h1>
        <p className="step-hint">
          En <strong>desarrollo</strong>, las llamadas a HikCentral van por{' '}
          <code className="inline-code">/__hik/*</code> (proxy en Vite →{' '}
          <code className="inline-code">VITE_APP_HIKCENTRAL_BASE_URL</code>). En producción necesitas el
          mismo tipo de proxy o CORS en el servidor. La prueba de conexión hace GET a la raíz de cada
          URL.
        </p>
        <button type="button" className="btn primary" disabled={loading} onClick={() => void test()}>
          {loading ? 'Probando…' : 'Probar conexiones'}
        </button>
        {lines && (
          <div className="ping-results">
            <p>
              <strong>Dispositivo:</strong> {lines.device}
            </p>
            <p>
              <strong>HikCentral:</strong> {lines.hik}
            </p>
          </div>
        )}
      </section>

      <section className="card env-table">
        <h2>Entorno</h2>
        <dl className="env-grid">
          <div>
            <dt>VITE_APP_NAME</dt>
            <dd>{appName}</dd>
          </div>
          <div>
            <dt>VITE_APP_HIK_DEVICE_BASE_URL</dt>
            <dd className="mono">{deviceBase || '—'}</dd>
          </div>
          <div>
            <dt>VITE_APP_HIKCENTRAL_BASE_URL</dt>
            <dd className="mono">{hikBase || '—'}</dd>
          </div>
          <div>
            <dt>VITE_APP_HIKCENTRAL_APP_KEY</dt>
            <dd className="mono">{appKey ? mask(appKey) : '—'}</dd>
          </div>
          <div>
            <dt>VITE_APP_HIKCENTRAL_APP_SECRET</dt>
            <dd className="mono">{appSecret ? mask(appSecret) : '—'}</dd>
          </div>
          <div>
            <dt>VITE_APP_API_MODE</dt>
            <dd>
              <span className="badge">{apiMode}</span>
            </dd>
          </div>
          <div>
            <dt>VITE_APP_HIK_ORG_INDEX_CODE</dt>
            <dd className="mono">{orgIndex || '—'}</dd>
          </div>
          <div>
            <dt>VITE_APP_HIK_ACCESS_BASE / PREMIUM / VIP</dt>
            <dd className="mono small">
              {accB || '—'} · {accP || '—'} · {accV || '—'}
            </dd>
          </div>
        </dl>
      </section>
    </div>
  )
}

function Shell() {
  const { view } = useToram()
  return (
    <div className="app">
      <Header />
      <main className="main">
        {view === 'landing' && <Landing />}
        {view === 'wizard' && <Wizard />}
        {view === 'integration' && <IntegrationPage />}
      </main>
      <footer className="footer">
        <p>Demo TORAM — pago simulado. No hay pasarela real.</p>
      </footer>
    </div>
  )
}

export default function App() {
  return (
    <ToramProvider>
      <Shell />
    </ToramProvider>
  )
}
