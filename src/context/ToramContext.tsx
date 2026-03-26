import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { AppView, GuestData, PaymentState, WizardStepIndex } from '../types'
import { TIERS, type Tier } from '../types'

const STORAGE_KEY = 'toram_session_v1'

const emptyGuest: GuestData = {
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  visitDate: '',
  gender: 'male',
}

const defaultPayment: PaymentState = {
  phase: 'idle',
  transactionId: null,
  wristbandCode: null,
  accessGate: null,
  validUntil: null,
  errorMessage: null,
  hikPersonId: null,
  hikDetail: null,
  hikPayloadPreview: null,
}

interface PersistedState {
  view: AppView
  step: WizardStepIndex
  guest: GuestData
  tierId: Tier['id'] | null
  payment: PaymentState
}

interface ToramContextValue {
  view: AppView
  setView: (v: AppView) => void
  step: WizardStepIndex
  setStep: (s: WizardStepIndex) => void
  guest: GuestData
  setGuest: (g: GuestData | ((prev: GuestData) => GuestData)) => void
  selectedTier: Tier | null
  setSelectedTierId: (id: Tier['id'] | null) => void
  payment: PaymentState
  setPayment: (p: PaymentState | ((prev: PaymentState) => PaymentState)) => void
  resetWizard: () => void
  startWizard: () => void
}

const ToramContext = createContext<ToramContextValue | null>(null)

function loadPersisted(): Partial<PersistedState> | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    return JSON.parse(raw) as Partial<PersistedState>
  } catch {
    return null
  }
}

export function ToramProvider({ children }: { children: ReactNode }) {
  const saved = typeof window !== 'undefined' ? loadPersisted() : null

  const initialPaymentState: PaymentState = saved?.payment
    ? { ...defaultPayment, ...saved.payment }
    : { ...defaultPayment }

  const initialStep: WizardStepIndex =
    saved?.step === 2 && initialPaymentState.phase === 'done' ? 3 : (saved?.step ?? 0)

  const [view, setViewState] = useState<AppView>(saved?.view ?? 'landing')
  const [step, setStepState] = useState<WizardStepIndex>(initialStep)
  const [guest, setGuestState] = useState<GuestData>(
    saved?.guest ? { ...emptyGuest, ...saved.guest } : { ...emptyGuest },
  )
  const [tierId, setTierIdState] = useState<Tier['id'] | null>(saved?.tierId ?? null)
  const [payment, setPaymentState] = useState<PaymentState>(initialPaymentState)

  const selectedTier = useMemo(
    () => (tierId ? TIERS.find((t) => t.id === tierId) ?? null : null),
    [tierId],
  )

  useEffect(() => {
    const payload: PersistedState = { view, step, guest, tierId, payment }
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
    } catch {
      /* ignore */
    }
  }, [view, step, guest, tierId, payment])

  const setView = useCallback((v: AppView) => {
    setViewState(v)
  }, [])

  const setStep = useCallback((s: WizardStepIndex) => {
    setStepState(s)
  }, [])

  const setGuest = useCallback((g: GuestData | ((prev: GuestData) => GuestData)) => {
    setGuestState(g)
  }, [])

  const setSelectedTierId = useCallback((id: Tier['id'] | null) => {
    setTierIdState(id)
  }, [])

  const setPayment = useCallback((p: PaymentState | ((prev: PaymentState) => PaymentState)) => {
    setPaymentState(p)
  }, [])

  const resetWizard = useCallback(() => {
    setStepState(0)
    setGuestState({ ...emptyGuest })
    setTierIdState(null)
    setPaymentState({ ...defaultPayment })
    setViewState('wizard')
  }, [])

  const startWizard = useCallback(() => {
    setViewState('wizard')
    setStepState(0)
  }, [])

  const value = useMemo<ToramContextValue>(
    () => ({
      view,
      setView,
      step,
      setStep,
      guest,
      setGuest,
      selectedTier,
      setSelectedTierId,
      payment,
      setPayment,
      resetWizard,
      startWizard,
    }),
    [
      view,
      setView,
      step,
      setStep,
      guest,
      setGuest,
      selectedTier,
      setSelectedTierId,
      payment,
      setPayment,
      resetWizard,
      startWizard,
    ],
  )

  return <ToramContext.Provider value={value}>{children}</ToramContext.Provider>
}

export function useToram(): ToramContextValue {
  const ctx = useContext(ToramContext)
  if (!ctx) throw new Error('useToram debe usarse dentro de ToramProvider')
  return ctx
}
