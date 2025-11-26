import http from 'http'
import fs from 'fs/promises'
import path from 'path'
import { URL, fileURLToPath } from 'url'

let latestCallback = null

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const distDir = path.join(__dirname, 'dist')

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf'
}

function getMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase()
  return mimeTypes[ext] || 'application/octet-stream'
}

function sendJson(res, statusCode, data) {
  res.statusCode = statusCode
  res.setHeader('Content-Type', 'application/json')
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization')
  res.end(JSON.stringify(data))
}

function notFound(res) {
  sendJson(res, 404, { error: 'Not found' })
}

async function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    let body = ''
    req.on('data', (chunk) => {
      body += chunk
    })
    req.on('end', () => resolve(body))
    req.on('error', reject)
  })
}

async function tryServeStatic(pathname, res, headOnly = false) {
  if (!distDir) return false

  let requestedPath = pathname
  if (!requestedPath || requestedPath === '/') requestedPath = '/index.html'

  let decoded
  try {
    decoded = decodeURIComponent(requestedPath)
  } catch {
    decoded = requestedPath
  }

  const filePath = path.join(distDir, decoded)
  if (!filePath.startsWith(distDir)) {
    return false
  }

  try {
    const file = await fs.readFile(filePath)
    res.statusCode = 200
    res.setHeader('Content-Type', getMimeType(filePath))
    if (headOnly) {
      res.end()
    } else {
      res.end(file)
    }
    return true
  } catch {
    return false
  }
}

async function serveIndex(res) {
  const indexPath = path.join(distDir, 'index.html')
  try {
    const html = await fs.readFile(indexPath)
    res.statusCode = 200
    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    res.end(html)
  } catch {
    notFound(res)
  }
}

const server = http.createServer(async (req, res) => {
  try {
    const parsed = new URL(req.url || '/', 'http://localhost')
    let pathname = parsed.pathname || '/'

    if (pathname.length > 1 && pathname.endsWith('/')) {
      pathname = pathname.slice(0, -1)
    }

    if (req.method === 'GET' && pathname === '/health') {
      return sendJson(res, 200, { ok: true })
    }

    if (
      req.method === 'OPTIONS' &&
      (pathname === '/api/v1/callback' || pathname === '/api/v1/callback/latest')
    ) {
      res.statusCode = 204
      res.setHeader('Access-Control-Allow-Origin', '*')
      res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization')
      return res.end()
    }

    if (req.method === 'GET' && pathname === '/api/v1/callback/latest') {
      return sendJson(res, 200, latestCallback || { message: 'no-callback-yet' })
    }

    if (req.method === 'POST' && pathname === '/api/v1/callback') {
      const rawBody = await readRequestBody(req)
      let json
      try {
        json = JSON.parse(rawBody || '{}')
      } catch {
        json = { raw: rawBody }
      }
      console.log('[callback] received payload:', JSON.stringify(json, null, 2))
      latestCallback = {
        receivedAt: new Date().toISOString(),
        headers: req.headers,
        body: json
      }
      console.log('[callback] stored as latest callback at', latestCallback.receivedAt)
      return sendJson(res, 200, { ok: true })
    }

    if (req.method === 'GET' || req.method === 'HEAD') {
      const served = await tryServeStatic(pathname, res, req.method === 'HEAD')
      if (served) return
      if (req.method === 'GET') {
        return serveIndex(res)
      }
    }

    return notFound(res)
  } catch (e) {
    console.error('[server] error:', e && e.stack ? e.stack : e)
    return sendJson(res, 500, {
      error: 'internal-error',
      message: String(e && e.message ? e.message : e)
    })
  }
})

const PORT = Number(process.env.PORT || 3003)
server.on('error', (err) => {
  console.error('[server] listen error:', err && err.code ? err.code : err)
})
server.listen(PORT, () => {
  console.log(`[server] listening on port ${PORT}`)
})
