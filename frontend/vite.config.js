import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(process.cwd(), 'src') },
  },
  server: {
    port: 5173,
    proxy: {
      // Same-origin in dev, so no CORS handling is needed in the browser.
      // ws:true is required here too — the Digital Twin's live socket is served
      // under /api/v1/campus/ws/:campusId, not a separate /ws prefix.
      '/api': { target: 'http://127.0.0.1:8000', changeOrigin: true, ws: true },
      '/media': { target: 'http://127.0.0.1:8000', changeOrigin: true },
    },
  },
})
