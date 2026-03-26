/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_APP_NAME: string
  readonly VITE_APP_HIK_DEVICE_BASE_URL: string
  readonly VITE_APP_HIKCENTRAL_BASE_URL: string
  /** Solo dev: destino del proxy Vite si debe diferir de VITE_APP_HIKCENTRAL_BASE_URL */
  readonly VITE_APP_HIK_PROXY_TARGET: string
  readonly VITE_APP_HIKCENTRAL_APP_KEY: string
  readonly VITE_APP_HIKCENTRAL_APP_SECRET: string
  readonly VITE_APP_API_MODE: 'mock' | 'real' | string
  /** Índice del departamento en HikCentral (p. ej. Visitas) — obligatorio en modo real */
  readonly VITE_APP_HIK_ORG_INDEX_CODE: string
  /** Nombre visible del departamento (solo UI / descripción) */
  readonly VITE_APP_HIK_DEPARTMENT_NAME: string
  /** Códigos de nivel de acceso en HikCentral (basico / premium / VIP) */
  readonly VITE_APP_HIK_ACCESS_BASE: string
  readonly VITE_APP_HIK_ACCESS_PREMIUM: string
  readonly VITE_APP_HIK_ACCESS_VIP: string
  /** Rutas API si tu versión difiere del valor por defecto */
  readonly VITE_APP_HIK_ENDPOINT_PERSON_ADD: string
  readonly VITE_APP_HIK_ENDPOINT_ACCESS_BIND: string
  /** JSON fusionado al cuerpo de alta de persona (campos extra del API) */
  readonly VITE_APP_HIK_PERSON_EXTRA_JSON: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
