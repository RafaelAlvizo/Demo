export type AppView = 'landing' | 'wizard' | 'integration'

export type WizardStepIndex = 0 | 1 | 2 | 3

export interface GuestData {
  firstName: string
  lastName: string
  email: string
  phone: string
  visitDate: string
  gender: 'male' | 'female'
}

export interface Tier {
  id: 'explorador' | 'aventura' | 'oro'
  name: string
  tagline: string
  priceLabel: string
  perks: string[]
}

export type PaymentPhase = 'idle' | 'payment' | 'wristband' | 'sync' | 'done' | 'error'

export interface PaymentState {
  phase: PaymentPhase
  transactionId: string | null
  wristbandCode: string | null
  accessGate: string | null
  validUntil: string | null
  errorMessage: string | null
  /** ID devuelto por HikCentral (o código de persona TORAM-*) */
  hikPersonId: string | null
  /** Resumen / último mensaje de sincronización */
  hikDetail: string | null
  /** JSON de lo que se enviaría / se envió a HikCentral (mock y real) */
  hikPayloadPreview: string | null
}

export const TIERS: Tier[] = [
  {
    id: 'explorador',
    name: 'Explorador',
    tagline: 'Ideal para familias y primera visita',
    priceLabel: 'Desde $45',
    perks: ['Acceso a zonas familiares', '1 atracción premium', 'Mapa digital'],
  },
  {
    id: 'aventura',
    name: 'Aventura',
    tagline: 'Más emoción y colas preferentes',
    priceLabel: 'Desde $72',
    perks: ['Colas rápidas en 5 atracciones', '2 experiencias premium', 'Locker incluido'],
  },
  {
    id: 'oro',
    name: 'Oro sin límites',
    tagline: 'Experiencia VIP sin restricciones',
    priceLabel: 'Desde $120',
    perks: ['Acceso ilimitado premium', 'Entrada anticipada', 'Estacionamiento VIP'],
  },
]
