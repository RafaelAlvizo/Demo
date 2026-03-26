import type { GuestData, Tier } from '../types'

/**
 * Datos canónicos del visitante de demostración.
 * Deben coincidir con lo que se envía en syncVisitorToHikCentral (mismo nombre, apellidos, etc.).
 */
export const DEMO_GUEST: GuestData = {
  firstName: 'María',
  lastName: 'González Ruiz',
  email: 'maria.demo@toram.local',
  phone: '+34 612 345 678',
  visitDate: '',
  gender: 'female',
}

/** Tarifa demo por defecto (Oro → VIP en HikCentral). */
export const DEMO_TIER_ID: Tier['id'] = 'oro'

/** Rellena la fecha de visita al día actual (ISO). */
export function getDemoGuestForToday(): GuestData {
  return {
    ...DEMO_GUEST,
    visitDate: new Date().toISOString().slice(0, 10),
  }
}
