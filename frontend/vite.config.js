import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig(({ mode }) => {
  // Where the dev server forwards /api and /media. Overridable because port
  // 8000 is a popular default — another project holding it should not mean
  // editing a tracked file, which is easy to commit by accident and easy to
  // revert into a broken dev setup. Set VITE_API_PROXY_TARGET in .env.local.
  const env = loadEnv(mode, process.cwd(), '')
  const apiTarget = env.VITE_API_PROXY_TARGET || 'http://127.0.0.1:8000'

  return {
    plugins: [react()],
    resolve: {
      alias: { '@': path.resolve(process.cwd(), 'src') },
    },
    server: {
      // Honour an assigned PORT so the dev server can move when 5173 is taken
      // by another project. Falls back to the conventional 5173 when unset.
      port: Number(process.env.PORT) || 5173,
      proxy: {
        // Same-origin in dev, so no CORS handling is needed in the browser.
        // ws:true is required here too — the Digital Twin's live socket is
        // served under /api/v1/campus/ws/:campusId, not a separate /ws prefix.
        '/api': { target: apiTarget, changeOrigin: true, ws: true },
        '/media': { target: apiTarget, changeOrigin: true },
      },
    },
  }
})