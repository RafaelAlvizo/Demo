import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const target = (env.VITE_APP_HIKCENTRAL_BASE_URL || 'http://127.0.0.1').replace(/\/$/, '')

  return {
    plugins: [react()],
    server: {
      proxy: {
        // Desarrollo: fetch('/__hik/artemis/...') → HikCentral (evita CORS)
        '/__hik': {
          target,
          changeOrigin: true,
          secure: false,
          rewrite: (path) => path.replace(/^\/__hik/, ''),
        },
      },
    },
  }
})
