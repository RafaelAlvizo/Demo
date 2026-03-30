import type { PersonFormState } from '../types'
import { emptyPersonForm } from '../types'

/**
 * Valores literales del ejemplo «Agregar persona» en la colección Postman SYSCOM / captura de referencia.
 * No incluye `faces` (foto base64); para rostro usa `VITE_APP_HIK_PERSON_EXTRA_JSON` con el array `faces`.
 */
export const SYSCOM_POSTMAN_BEGIN_ISO = '2020-05-26T15:00:00+08:00'
export const SYSCOM_POSTMAN_END_ISO = '2030-05-26T15:00:00+08:00'

/** `datetime-local` equivalente a la fecha/hora del ejemplo (sin forzar huso en el input). */
const BEGIN_LOCAL = '2020-05-26T15:00'
const END_LOCAL = '2030-05-26T15:00'

export function buildSyscomPostmanReferenceForm(orgFallback: string): PersonFormState {
  return {
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
    beginTime: BEGIN_LOCAL,
    endTime: END_LOCAL,
  }
}

/** Si el formulario coincide con la plantilla, el POST puede usar fechas ISO fijas como en Postman (+08:00). */
export function isSyscomPostmanReferenceForm(form: PersonFormState): boolean {
  return (
    form.personCode.trim() === '1596' &&
    form.personGivenName.trim() === 'Xavier' &&
    form.personFamilyName.trim() === 'Guereque' &&
    form.email.trim() === 'xavier.guereque@syscom.mx' &&
    form.remark.trim() === 'Ing. Seguridad'
  )
}
