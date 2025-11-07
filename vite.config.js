import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
// Simple in-memory store for latest webhook callback (dev only)
let latestCallback = null

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'dev-callback-endpoints',
      configureServer(server) {
        server.middlewares.use('/callback/latest', (req, res) => {
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify(latestCallback || { message: 'no-callback-yet' }))
        })
        server.middlewares.use('/callback', async (req, res, next) => {
          if (req.method !== 'POST') return next()
          try {
            let body = ''
            req.on('data', (chunk) => { body += chunk })
            req.on('end', () => {
              let json
              try { json = JSON.parse(body || '{}') } catch { json = { raw: body } }
              latestCallback = {
                receivedAt: new Date().toISOString(),
                headers: req.headers,
                body: json,
              }
              console.log('[callback] received:', latestCallback)
              res.statusCode = 200
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ ok: true }))
            })
          } catch (e) {
            console.error('[callback] error:', e)
            res.statusCode = 500
            res.end('error')
          }
        })
      },
    },
  ],
  server: {
    host: true,
    port: 5174,
    allowedHosts: [
      'c341dadd13bb.ngrok-free.app',
      
    ],
    proxy: {
      '/api': {
        target: 'https://payments.mam-laka.com',
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/api/, '/api')
      }
    }
  },
})
