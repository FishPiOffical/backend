import { bumpAuthContextVersion, getApiUrl, queueCredentialRequest, setAccessToken } from './http'

const CLIENT_ID = 'website_v3'
// 该会话与摸鱼派网站共用刷新 Cookie，申请与第一方网站登录一致的 scope。
const SCOPE = 'profile.read content.read activity.read content.write comments.write reactions.write follows.write notifications.read notifications.write activity.write settings.write uploads.write messages.read messages.write'
const STORAGE_KEY = 'rhythm-admin-oauth'
const ATTEMPT_TTL_MS = 15 * 60 * 1000

interface LoginAttempt {
  state: string
  verifier: string
  redirectUri: string
  target: string
  startedAt: number
}

function base64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')
}

function callbackUrl(): URL {
  return new URL(`${import.meta.env.BASE_URL}oauth/callback`, window.location.origin)
}

export async function startWebsiteOAuth(target: string): Promise<void> {
  const verifier = base64url(crypto.getRandomValues(new Uint8Array(32)))
  const state = base64url(crypto.getRandomValues(new Uint8Array(32)))
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))
  const redirectUri = callbackUrl().href
  const provider = import.meta.env.VITE_FISHPI_OAUTH_ORIGIN || import.meta.env.VITE_API_BASE_URL || (
    import.meta.env.DEV ? `http://${window.location.hostname}:8080` : 'https://fishpi.cn'
  )
  const authorize = new URL('/api/v3/oauth/authorize', provider)
  authorize.search = new URLSearchParams({
    response_type: 'code',
    client_id: CLIENT_ID,
    redirect_uri: redirectUri,
    scope: SCOPE,
    state,
    code_challenge: base64url(new Uint8Array(digest)),
    code_challenge_method: 'S256',
  }).toString()

  const attempt: LoginAttempt = { state, verifier, redirectUri, target, startedAt: Date.now() }
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(attempt))
  window.location.assign(authorize.href)
}

export function takeWebsiteOAuthCallback(): { code: string; attempt: LoginAttempt } {
  const callback = new URL(window.location.href)
  const expected = callbackUrl()
  window.history.replaceState(window.history.state, '', expected.pathname)
  const pending = sessionStorage.getItem(STORAGE_KEY)
  sessionStorage.removeItem(STORAGE_KEY)
  const attempt = pending ? JSON.parse(pending) as LoginAttempt : null
  const states = callback.searchParams.getAll('state')
  const age = attempt ? Date.now() - attempt.startedAt : NaN
  if (!attempt || states.length !== 1 || states[0] !== attempt.state || attempt.redirectUri !== expected.href
      || !Number.isFinite(age) || age < 0 || age > ATTEMPT_TTL_MS) {
    throw new Error('登录请求已失效，请返回后台登录页重新发起授权。')
  }

  const codes = callback.searchParams.getAll('code')
  const errors = callback.searchParams.getAll('error')
  if (errors.length === 1 && errors[0] === 'access_denied' && codes.length === 0) {
    throw new Error('你已取消摸鱼派授权。')
  }
  if (errors.length || codes.length !== 1 || !codes[0]) {
    throw new Error('未收到有效的授权码，请重新发起授权。')
  }
  return { code: codes[0], attempt }
}

export async function exchangeWebsiteOAuthCode(code: string, attempt: LoginAttempt): Promise<void> {
  await queueCredentialRequest(async () => {
    const response = await fetch(getApiUrl('/api/v3/oauth/token'), {
      method: 'POST',
      credentials: 'include',
      cache: 'no-store',
      redirect: 'error',
      headers: { Accept: 'application/json' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: CLIENT_ID,
        redirect_uri: attempt.redirectUri,
        code,
        code_verifier: attempt.verifier,
      }),
    })
    const token = await response.json().catch(() => null)
    if (!response.ok || token?.token_type !== 'Bearer' || typeof token.access_token !== 'string' || !token.access_token) {
      throw new Error('摸鱼派授权登录未能完成，请重新发起授权。')
    }
    bumpAuthContextVersion()
    setAccessToken(token.access_token, false)
  })
}
