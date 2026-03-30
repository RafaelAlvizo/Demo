/** Tipos mínimos para el probador HikCentral (persona según Postman / OpenAPI). */

export interface PersonFormState {
  personCode: string
  personGivenName: string
  personFamilyName: string
  gender: number
  orgIndexCode: string
  remark: string
  phoneNo: string
  email: string
  cardNo: string
  beginTime: string
  endTime: string
}

export const emptyPersonForm = (): PersonFormState => ({
  personCode: '',
  personGivenName: '',
  personFamilyName: '',
  gender: 1,
  orgIndexCode: '',
  remark: '',
  phoneNo: '',
  email: '',
  cardNo: '',
  beginTime: '',
  endTime: '',
})
