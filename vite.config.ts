import https from 'node:https'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  // Opcional: URL solo para el proxy Node (si difiere de la pública)
  const target = (
    env.VITE_APP_HIK_PROXY_TARGET ||
    env.VITE_APP_HIKCENTRAL_BASE_URL ||
    'http://127.0.0.1'
  ).replace(/\/$/, '')

  const base = {
    target,
    changeOrigin: true,
    secure: false,
    rewrite: (path: string) => path.replace(/^\/__hik/, ''),
    /** Certificados autofirmidos locales (HikCentral en https://127.0.0.1) */
    ...(target.startsWith('https:')
      ? { agent: new https.Agent({ rejectUnauthorized: false }) }
      : {}),
  }

  return {
    plugins: [react()],
    server: {
      proxy: {
        '/__hik': base,
      },
    },
  }
})
