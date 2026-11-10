import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { SignJWT, jwtVerify, createRemoteJWKSet } from 'jose'
import { HttpError } from './http.js'

export const SESSION_COOKIE = '__Host-budget_session'
export const OAUTH_COOKIE = '__Host-budget_oauth'
const VERCEL_ISSUER = 'https://vercel.com'
const TOKEN_ENDPOINT = 'https://api.vercel.com/login/oauth/token'
const JWKS = createRemoteJWKSet(new URL('https://vercel.com/.well-known/jwks'))
const SESSION_SECONDS = 7 * 24 * 60 * 60

export function authConfig(env = process.env) {
  const { BUDGET_APP_ORIGIN: origin, VERCEL_APP_CLIENT_ID: clientId, VERCEL_APP_CLIENT_SECRET: clientSecret, BUDGET_OWNER_VERCEL_ID: ownerId, BUDGET_SESSION_SECRET: secret } = env
  const tokenAuthMethod = env.VERCEL_APP_TOKEN_AUTH_METHOD || 'client_secret_post'
  let url
  try { url = new URL(origin) } catch { /* invalid configuration remains unavailable */ }
  if (!url || url.protocol !== 'https:' || url.origin !== origin || !clientId || !['client_secret_post', 'none'].includes(tokenAuthMethod) || (tokenAuthMethod === 'client_secret_post' && !clientSecret) || !ownerId || !secret || Buffer.byteLength(secret) < 32) throw new HttpError(503, 'CLOUD_NOT_CONFIGURED', '云端登录尚未配置完成')
  return { origin, clientId, clientSecret, tokenAuthMethod, ownerId, secret: new TextEncoder().encode(secret) }
}

export function assertSameOrigin(req, config, write = false) {
  const host = String(req.headers?.host || '').toLowerCase()
  if (host !== new URL(config.origin).host.toLowerCase()) throw new HttpError(403, 'INVALID_ORIGIN', '请从正式账本入口访问云端')
  if (write && req.headers?.origin !== config.origin) throw new HttpError(403, 'INVALID_ORIGIN', '拒绝跨站写入云端账本')
  const site = req.headers?.['sec-fetch-site']
  if (write && site && site !== 'same-origin' && site !== 'none') throw new HttpError(403, 'INVALID_ORIGIN', '拒绝跨站写入云端账本')
}

export function cookies(req) {
  const result = {}
  for (const piece of String(req.headers?.cookie || '').split(';')) {
    const index = piece.indexOf('=')
    if (index > 0) result[piece.slice(0, index).trim()] = piece.slice(index + 1).trim()
  }
  return result
}

export function cookie(name, value, maxAge) {
  return `${name}=${value}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`
}

export function sameSecret(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false
  const left = Buffer.from(a); const right = Buffer.from(b)
  return left.length === right.length && timingSafeEqual(left, right)
}

async function signCookie(payload, config, audience, lifetime) {
  return new SignJWT(payload).setProtectedHeader({ alg: 'HS256' }).setIssuer(config.origin).setAudience(audience).setIssuedAt().setExpirationTime(`${lifetime}s`).sign(config.secret)
}

async function readCookie(value, config, audience) {
  if (!value) throw new HttpError(401, 'UNAUTHENTICATED', '请先登录 Vercel')
  try {
    const { payload } = await jwtVerify(value, config.secret, { issuer: config.origin, audience, algorithms: ['HS256'], requiredClaims: ['exp', 'iat'] })
    return payload
  } catch { throw new HttpError(401, 'UNAUTHENTICATED', '登录已失效，请重新登录 Vercel') }
}

export async function startLogin(config) {
  const state = randomBytes(32).toString('base64url')
  const nonce = randomBytes(32).toString('base64url')
  const verifier = randomBytes(48).toString('base64url')
  const token = await signCookie({ state, nonce, verifier }, config, 'budget-oauth', 600)
  const params = new URLSearchParams({ client_id: config.clientId, redirect_uri: `${config.origin}/api/auth/callback`, scope: 'openid profile', response_type: 'code', state, nonce, code_challenge: createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256' })
  return { location: `https://vercel.com/oauth/authorize?${params}`, cookie: cookie(OAUTH_COOKIE, token, 600) }
}

export async function verifyVercelIdentity(idToken, config, nonce, keySet = JWKS) {
  const { payload } = await jwtVerify(idToken, keySet, { issuer: VERCEL_ISSUER, audience: config.clientId, algorithms: ['RS256'], maxTokenAge: '10m', clockTolerance: 5, requiredClaims: ['sub', 'exp', 'iat', 'nonce'] })
  if (!sameSecret(payload.nonce, nonce)) throw new HttpError(401, 'AUTH_NONCE_MISMATCH', '登录校验失败，请重新登录')
  if (!sameSecret(payload.sub, config.ownerId)) throw new HttpError(403, 'OWNER_ONLY', '此账本仅允许所有者登录')
  return { id: payload.sub, name: String(payload.name || payload.preferred_username || '账本所有者').slice(0, 120) }
}

export async function createSession(user, config) {
  if (!sameSecret(user.id, config.ownerId)) throw new HttpError(403, 'OWNER_ONLY', '此账本仅允许所有者登录')
  return cookie(SESSION_COOKIE, await signCookie({ sub: user.id, name: user.name }, config, 'budget-session', SESSION_SECONDS), SESSION_SECONDS)
}

export async function finishLogin(req, config, { fetcher = fetch, verifyIdentity = verifyVercelIdentity } = {}) {
  const url = new URL(req.url, config.origin)
  const state = url.searchParams.get('state')
  const code = url.searchParams.get('code')
  const saved = await readCookie(cookies(req)[OAUTH_COOKIE], config, 'budget-oauth')
  if (!code || code.length > 2048 || !sameSecret(state, saved.state)) throw new HttpError(401, 'AUTH_STATE_MISMATCH', '登录已失效或校验失败，请重新登录')
  let response
  try {
    response = await fetcher(TOKEN_ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'authorization_code', client_id: config.clientId, ...(config.tokenAuthMethod === 'none' ? {} : { client_secret: config.clientSecret }), code, code_verifier: saved.verifier, redirect_uri: `${config.origin}/api/auth/callback` }), signal: AbortSignal.timeout(10000) })
  } catch { throw new HttpError(502, 'AUTH_PROVIDER_ERROR', 'Vercel 登录服务暂时不可用，请重试') }
  if (!response.ok) throw new HttpError(401, 'AUTH_EXCHANGE_FAILED', '登录授权未完成，请重新登录')
  const tokenData = await response.json()
  if (!tokenData.id_token) throw new HttpError(401, 'AUTH_EXCHANGE_FAILED', '登录授权缺少身份凭据')
  let user
  try { user = await verifyIdentity(tokenData.id_token, config, saved.nonce) } catch (error) {
    if (error instanceof HttpError) throw error
    throw new HttpError(401, 'INVALID_ID_TOKEN', '身份凭据验证失败，请重新登录')
  }
  // Access/refresh tokens are deliberately neither persisted nor exposed. Only identity is needed.
  return { user, cookies: [await createSession(user, config), cookie(OAUTH_COOKIE, '', 0)] }
}

export async function requireOwner(req, config = authConfig()) {
  assertSameOrigin(req, config, !['GET', 'HEAD'].includes(req.method))
  const session = await readCookie(cookies(req)[SESSION_COOKIE], config, 'budget-session')
  if (!sameSecret(session.sub, config.ownerId)) throw new HttpError(403, 'OWNER_ONLY', '此账本仅允许所有者访问')
  return { id: session.sub, name: String(session.name || '账本所有者').slice(0, 120) }
}
