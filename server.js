import http from 'http'
import { URL } from 'url'


let latestCallback = null

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

const server = http.createServer((req, res) => {
	try {
	console.log(req)
		const parsed = new URL(req.url || '/', 'http://localhost')
		let pathname = parsed.pathname || '/'
	
		if (pathname.length > 1 && pathname.endsWith('/')) pathname = pathname.slice(0, -1)
		console.log(`[server] ${req.method} ${pathname}`)

		// Health
		if (req.method === 'GET' && pathname === '/health') {
			return sendJson(res, 200, { ok: true })
		}


		if (req.method === 'OPTIONS' && (pathname === '/api/v1/callback' || pathname === '/api/v1/callback/latest')) {
			res.statusCode = 204
			res.setHeader('Access-Control-Allow-Origin', '*')
			res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
			res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization')
			return res.end()
		}

		if (req.method === 'GET' && (pathname === '/api/v1/callback/latest')) {
			return sendJson(res, 200, latestCallback || { message: 'no-callback-yet' })
		}

		if (req.method === 'POST' && pathname === '/api/v1/callback') {
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
				return sendJson(res, 200, { ok: true })
			})
			return
		}

		return notFound(res)
	} catch (e) {
		console.error('[server] error:', e && e.stack ? e.stack : e)
		return sendJson(res, 500, { error: 'internal-error', message: String(e && e.message ? e.message : e) })
	}
})

const PORT = Number(process.env.PORT || 8081)
server.on('error', (err) => {
	console.error('[server] listen error:', err && err.code ? err.code : err)
})
server.listen(PORT, () => {
	console.log(`[server] listening on port ${PORT}`)
})


