import https from 'node:https'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

/** Prefijos que reescriben a la raíz de HikCentral (evita 502 si una petición cae en Vite sin proxy). */
const HIK_PROXY_PREFIXES = ['/hikcentral-proxy', '/__hik', '/hik'] as const
const DEFAULT_PROXY_TARGET = 'https://hik-public-host.invalid'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const configuredTarget = (
    env.VITE_APP_HIK_PROXY_TARGET ||
    env.VITE_APP_HIKCENTRAL_BASE_URL ||
    ''
  ).trim()
  const target = (configuredTarget || DEFAULT_PROXY_TARGET).replace(/\/$/, '')

  if (!configuredTarget) {
    console.warn(
      '[vite] Missing VITE_APP_HIKCENTRAL_BASE_URL or VITE_APP_HIK_PROXY_TARGET. ' +
        'Set your public HikCentral URL in .env.local before testing real connectivity.',
    )
  }

  const httpsAgent =
    target.startsWith('https:') ? new https.Agent({ rejectUnauthorized: false }) : undefined

  const proxy: Record<string, ReturnType<typeof entryFor>> = {}
  for (const prefix of HIK_PROXY_PREFIXES) {
    proxy[prefix] = entryFor(prefix)
  }

  function entryFor(prefix: string) {
    return {
      target,
      changeOrigin: true,
      secure: false,
      rewrite: (path: string) => (path.startsWith(prefix) ? path.slice(prefix.length) || '/' : path),
      ...(httpsAgent ? { agent: httpsAgent } : {}),
    }
  }

  return {
    plugins: [react()],
    server: {
      /** Permite abrir el dev server desde el móvil en la misma red: http://<IP-de-tu-PC>:5173 */
      host: true,
      proxy,
    },
  }
})
