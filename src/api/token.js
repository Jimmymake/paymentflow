// Fetches and caches a bearer token using Basic auth against /api/v1
// Requires env values: VITE_BASIC_USER and VITE_BASIC_PASS

// Cache tokens per username so different creds can be used without clashes
const tokenCache = new Map() // key: username, value: { token, expiresAtMs }

function isTokenValidFor(username) {
  const entry = tokenCache.get(username)
  return Boolean(entry?.token) && Date.now() < ((entry?.expiresAtMs || 0) - 15_000) // 15s early refresh
}

export async function getBearerToken(options = {}) {
  // options: { username?: string, password?: string }
  const providedUsername = options.username
  const providedPassword = options.password

  // Prefer explicit credentials, then env, then dev defaults
  const username = (providedUsername ?? import.meta.env.VITE_BASIC_USER) || 'plugin'
  const password = (providedPassword ?? import.meta.env.VITE_BASIC_PASS) || 'PluginJimmyX@)_ss:3fkk'

  if (isTokenValidFor(username)) {
    return tokenCache.get(username).token
  }

  const basic = btoa(`${username}:${password}`)
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort('Token request timed out'), 15000)
  console.log('[token] requesting token for', username)
  const res = await fetch('/api/v1', {
    method: 'GET',
    headers: {
      'Authorization': `Basic ${basic}`,
      'Accept': 'application/json',
    },
    signal: controller.signal,
  }).catch((e) => {
    console.error('[token] fetch error:', e)
    throw e
  }).finally(() => clearTimeout(timeoutId))
  console.log('[token] response status:', res.status, res.statusText)

  let data
  try {
    data = await res.json()
  } catch {
    const text = await res.text()
    throw new Error(`Token endpoint returned non-JSON: ${text}`)
  }

  if (!res.ok) {
    throw new Error(data?.message || data?.error || `Token fetch failed: ${res.status}`)
  }

  const token = data?.token
  const expiresAtIso = data?.expires_at
  if (!token || !expiresAtIso) {
    throw new Error('Token response missing token or expires_at')
  }

  const expires = new Date(expiresAtIso)
  const expiresAtMs = Number.isNaN(expires.getTime()) ? Date.now() + 4 * 60 * 60 * 1000 : expires.getTime()
  tokenCache.set(username, { token, expiresAtMs })
  return token
}


