import https from 'node:https'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

/** Prefijos que reescriben a la raíz de HikCentral (evita 502 si una petición cae en Vite sin proxy). */
const HIK_PROXY_PREFIXES = ['/hikcentral-proxy', '/__hik', '/hik'] as const

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const target = (
    env.VITE_APP_HIK_PROXY_TARGET ||
    env.VITE_APP_HIKCENTRAL_BASE_URL ||
    'http://127.0.0.1'
  ).replace(/\/$/, '')

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
      proxy,
    },
  }
})
