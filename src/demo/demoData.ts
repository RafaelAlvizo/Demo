import type { PersonFormState } from '../types'
import { emptyPersonForm } from '../types'

export type DemoTierId = 'explorador' | 'aventura' | 'oro'

export type DemoTier = {
  id: DemoTierId
  name: string
  tagline: string
  priceMXN: number
  perks: string[]
}

export const DEMO_TIERS: DemoTier[] = [
  {
    id: 'explorador',
    name: 'Explorador',
    tagline: 'Ideal para primera visita',
    priceMXN: 450,
    perks: ['Acceso base', '1 atracción premium', 'Mapa digital'],
  },
  {
    id: 'aventura',
    name: 'Aventura',
    tagline: 'Más emoción + preferentes',
    priceMXN: 720,
    perks: ['Colas rápidas', '2 experiencias premium', 'Locker incluido'],
  },
  {
    id: 'oro',
    name: 'Oro sin límites',
    tagline: 'Experiencia VIP',
    priceMXN: 1200,
    perks: ['Acceso ilimitado premium', 'Entrada anticipada', 'Estacionamiento VIP'],
  },
]

function dlocal(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

function randomShortNumericCode(): string {
  return String(Math.floor(1000 + Math.random() * 900000))
}

function randomMxPhone(): string {
  return `614${String(Math.floor(Math.random() * 1e7)).padStart(7, '0')}`
}

function randomCardNo(): string {
  return String(Math.floor(100_000_000 + Math.random() * 900_000_000))
}

export type DemoPersonPreset = {
  id: string
  label: string
  form: (orgFallback: string) => PersonFormState
}

export const DEMO_PERSON_PRESETS: DemoPersonPreset[] = [
  {
    id: 'syscom-postman',
    label: 'Ejemplo Postman / SYSCOM (1596 Xavier Guereque)',
    form: (orgFallback: string) => ({
      ...emptyPersonForm(),
      personCode: '1596',
      personGivenName: 'Xavier',
      personFamilyName: 'Guereque',
      gender: 1,
      orgIndexCode: orgFallback.trim() || '1',
      remark: 'Ing. Seguridad',
      phoneNo: '6144152525',
      email: 'xavier.guereque@syscom.mx',
      cardNo: '123987456',
      beginTime: '2020-05-26T15:00',
      endTime: '2030-05-26T15:00',
    }),
  },
  {
    id: 'family-1',
    label: 'Familia (Madre) — demo',
    form: (orgFallback: string) => {
      const now = new Date()
      const end = new Date(now)
      end.setDate(end.getDate() + 1)
      end.setHours(21, 0, 0, 0)
      return {
        ...emptyPersonForm(),
        personCode: randomShortNumericCode(),
        personGivenName: 'María',
        personFamilyName: 'Hernández',
        gender: 2,
        orgIndexCode: orgFallback.trim() || '1',
        remark: 'Demo TORAM — familia',
        phoneNo: randomMxPhone(),
        email: `maria.demo.${Date.now() % 100000}@example.com`,
        cardNo: randomCardNo(),
        beginTime: dlocal(now),
        endTime: dlocal(end),
      }
    },
  },
  {
    id: 'teen-1',
    label: 'Joven (Aventura) — demo',
    form: (orgFallback: string) => {
      const now = new Date()
      const end = new Date(now)
      end.setDate(end.getDate() + 1)
      end.setHours(23, 59, 0, 0)
      return {
        ...emptyPersonForm(),
        personCode: randomShortNumericCode(),
        personGivenName: 'Diego',
        personFamilyName: 'Ramírez',
        gender: 1,
        orgIndexCode: orgFallback.trim() || '1',
        remark: 'Demo TORAM — aventura',
        phoneNo: randomMxPhone(),
        email: `diego.demo.${Date.now() % 100000}@example.com`,
        cardNo: randomCardNo(),
        beginTime: dlocal(now),
        endTime: dlocal(end),
      }
    },
  },
  {
    id: 'vip-1',
    label: 'VIP (Oro) — demo',
    form: (orgFallback: string) => {
      const now = new Date()
      const end = new Date(now)
      end.setFullYear(end.getFullYear() + 1)
      return {
        ...emptyPersonForm(),
        personCode: randomShortNumericCode(),
        personGivenName: 'Rafael',
        personFamilyName: 'Alvizo',
        gender: 1,
        orgIndexCode: orgFallback.trim() || '1',
        remark: 'Demo TORAM — VIP',
        phoneNo: randomMxPhone(),
        email: `rafa.vip.${Date.now() % 100000}@example.com`,
        cardNo: randomCardNo(),
        beginTime: dlocal(now),
        endTime: dlocal(end),
      }
    },
  },
]

