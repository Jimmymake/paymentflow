import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
// Simple in-memory store for latest webhook callback (dev only)
let latestCallback = null

export default defineConfig({
  plugins: [
    react(),
  ],
  server: {
    host: true,
    port: 3001,
    allowedHosts: [
      '1175253aee96.ngrok-free.app',
      
    ],
    proxy: {
      '/api/v1/callback/latest': {
        target: 'http://localhost:8081',
        changeOrigin: true,
        secure: false,
      },
      '/api/v1/callback': {
        target: 'http://localhost:8081',
        changeOrigin: true,
        secure: false,
      },
      '/api': {
        target: 'https://payments.mam-laka.com',
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/api/, '/api')
      }
    }
  },
})
