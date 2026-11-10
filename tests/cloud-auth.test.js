import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { generateKeyPair, jwtVerify, SignJWT } from 'jose'
import { authConfig, assertSameOrigin, startLogin, finishLogin, createSession, requireOwner, verifyVercelIdentity, OAUTH_COOKIE, SESSION_COOKIE, cookie } from '../server/auth.js'
import { bodyJSON, fail, HttpError } from '../server/http.js'

const env = { BUDGET_APP_ORIGIN: 'https://budget.example.test', VERCEL_APP_CLIENT_ID: 'test-client', VERCEL_APP_CLIENT_SECRET: 'test-client-secret', BUDGET_OWNER_VERCEL_ID: 'test-owner', BUDGET_SESSION_SECRET: 'a-test-session-key-with-over-32-bytes-only' }
const config = authConfig(env)
const request = (method = 'GET', extra = {}) => ({ method, url: '/api/auth/session', headers: { host: 'budget.example.test', ...(method === 'GET' ? {} : { origin: config.origin, 'sec-fetch-site': 'same-origin' }), ...extra } })
const cookieHeader = setCookie => setCookie.split(';')[0]
const { publicKey, privateKey } = await generateKeyPair('RS256')
const identityToken = (claims = {}, options = {}) => new SignJWT({ nonce: 'test-nonce', ...claims }).setProtectedHeader({ alg: 'RS256' }).setIssuer(options.issuer || 'https://vercel.com').setAudience(options.audience || config.clientId).setSubject(claims.sub || config.ownerId).setIssuedAt().setExpirationTime(options.expires || '1h').sign(privateKey)

test('missing cloud configuration fails closed and secrets never enter errors', () => {
  assert.throws(() => authConfig({}), error => error.status === 503 && !error.message.includes('test-client-secret'))
  assert.throws(() => authConfig({ ...env, BUDGET_APP_ORIGIN: 'http://budget.example.test' }))
  assert.throws(() => authConfig({ ...env, BUDGET_SESSION_SECRET: 'short' }))
  assert.throws(() => authConfig({ ...env, VERCEL_APP_CLIENT_SECRET: undefined }), error => error.status === 503)
  assert.throws(() => authConfig({ ...env, VERCEL_APP_TOKEN_AUTH_METHOD: 'unknown' }), error => error.status === 503)
})

test('login uses PKCE S256, state and nonce bound to secure signed HttpOnly cookies', async () => {
  const result = await startLogin(config)
  const url = new URL(result.location)
  assert.equal(url.origin, 'https://vercel.com')
  assert.equal(url.searchParams.get('redirect_uri'), `${config.origin}/api/auth/callback`)
  assert.equal(url.searchParams.get('scope'), 'openid profile')
  const token = cookieHeader(result.cookie).slice(`${OAUTH_COOKIE}=`.length)
  const { payload } = await jwtVerify(token, config.secret, { issuer: config.origin, audience: 'budget-oauth' })
  assert.equal(url.searchParams.get('state'), payload.state)
  assert.equal(url.searchParams.get('nonce'), payload.nonce)
  assert.equal(url.searchParams.get('code_challenge'), createHash('sha256').update(payload.verifier).digest('base64url'))
  assert.match(result.cookie, /HttpOnly; Secure; SameSite=Lax/)
  assert.match(result.cookie, /^__Host-/)
  assert.doesNotMatch(result.location, /test-client-secret/)
})

test('callback rejects a wrong state before exchanging any authorization code', async () => {
  const started = await startLogin(config)
  const req = request('GET', { cookie: cookieHeader(started.cookie) }); req.url = '/api/auth/callback?code=test&state=wrong'
  let calls = 0
  await assert.rejects(finishLogin(req, config, { fetcher: () => { calls++; throw new Error('must not fetch') } }), error => error.code === 'AUTH_STATE_MISMATCH')
  assert.equal(calls, 0)
})

test('OIDC identity requires valid signature, audience, issuer, expiry, nonce and fixed owner', async () => {
  const valid = await identityToken()
  assert.equal((await verifyVercelIdentity(valid, config, 'test-nonce', publicKey)).id, config.ownerId)
  await assert.rejects(verifyVercelIdentity(await identityToken({ sub: 'another-owner' }), config, 'test-nonce', publicKey), error => error.code === 'OWNER_ONLY')
  await assert.rejects(verifyVercelIdentity(valid, config, 'wrong-nonce', publicKey), error => error.code === 'AUTH_NONCE_MISMATCH')
  await assert.rejects(verifyVercelIdentity(await identityToken({}, { issuer: 'https://evil.example' }), config, 'test-nonce', publicKey))
  await assert.rejects(verifyVercelIdentity(await identityToken({}, { audience: 'other-client' }), config, 'test-nonce', publicKey))
  await assert.rejects(verifyVercelIdentity(await identityToken({}, { expires: '-1h' }), config, 'test-nonce', publicKey))
  const { publicKey: otherKey } = await generateKeyPair('RS256')
  await assert.rejects(verifyVercelIdentity(valid, config, 'test-nonce', otherKey))
})

test('successful callback never exposes or persists provider access tokens', async () => {
  const started = await startLogin(config); const url = new URL(started.location)
  const req = request('GET', { cookie: cookieHeader(started.cookie) }); req.url = `/api/auth/callback?code=authorization-code&state=${url.searchParams.get('state')}`
  const result = await finishLogin(req, config, {
    fetcher: async (_url, options) => {
      assert.equal(options.body.get('code'), 'authorization-code')
      assert.ok(options.body.get('code_verifier'))
      assert.equal(options.body.get('client_secret'), env.VERCEL_APP_CLIENT_SECRET)
      return { ok: true, json: async () => ({ id_token: 'verified-by-test', access_token: 'provider-access-token', refresh_token: 'provider-refresh-token' }) }
    },
    verifyIdentity: async (_token, _config, nonce) => { assert.equal(nonce, url.searchParams.get('nonce')); return { id: config.ownerId, name: '测试所有者' } },
  })
  assert.equal(result.user.id, config.ownerId)
  assert.equal(result.cookies.length, 2)
  assert.doesNotMatch(JSON.stringify(result), /provider-access-token|provider-refresh-token/)
  const authenticated = await requireOwner(request('GET', { cookie: cookieHeader(result.cookies[0]) }), config)
  assert.equal(authenticated.id, config.ownerId)
})

test('public client requires explicit none configuration and exchanges code with PKCE but no secret', async () => {
  const publicConfig = authConfig({ ...env, VERCEL_APP_CLIENT_SECRET: undefined, VERCEL_APP_TOKEN_AUTH_METHOD: 'none' })
  const started = await startLogin(publicConfig); const url = new URL(started.location)
  const req = request('GET', { cookie: cookieHeader(started.cookie) }); req.url = `/api/auth/callback?code=public-code&state=${url.searchParams.get('state')}`
  const result = await finishLogin(req, publicConfig, {
    fetcher: async (_url, options) => {
      assert.equal(options.body.has('client_secret'), false)
      assert.equal(options.body.get('client_id'), env.VERCEL_APP_CLIENT_ID)
      assert.equal(createHash('sha256').update(options.body.get('code_verifier')).digest('base64url'), url.searchParams.get('code_challenge'))
      return { ok: true, json: async () => ({ id_token: 'verified-by-test' }) }
    },
    verifyIdentity: async (_token, cfg, nonce) => { assert.equal(cfg.ownerId, config.ownerId); assert.equal(nonce, url.searchParams.get('nonce')); return { id: cfg.ownerId, name: '测试所有者' } },
  })
  assert.equal((await requireOwner(request('GET', { cookie: cookieHeader(result.cookies[0]) }), publicConfig)).id, config.ownerId)
})

test('session rejects unauthenticated, tampered and foreign-owner cookies', async () => {
  await assert.rejects(requireOwner(request(), config), error => error.status === 401)
  const session = await createSession({ id: config.ownerId, name: '测试' }, config)
  assert.equal((await requireOwner(request('GET', { cookie: cookieHeader(session) }), config)).id, config.ownerId)
  const tokenParts = cookieHeader(session).split('.')
  tokenParts[2] = (tokenParts[2][0] === 'a' ? 'b' : 'a') + tokenParts[2].slice(1)
  const tampered = tokenParts.join('.')
  await assert.rejects(requireOwner(request('GET', { cookie: tampered }), config), error => error.status === 401)
  await assert.rejects(createSession({ id: 'other-owner' }, config), error => error.status === 403)
  const expired = await new SignJWT({ sub: config.ownerId }).setProtectedHeader({ alg: 'HS256' }).setIssuer(config.origin).setAudience('budget-session').setIssuedAt().setExpirationTime('-1h').sign(config.secret)
  await assert.rejects(requireOwner(request('GET', { cookie: `${SESSION_COOKIE}=${expired}` }), config), error => error.status === 401)
})

test('write operations require the exact application Origin and host', () => {
  assert.doesNotThrow(() => assertSameOrigin(request('PUT'), config, true))
  assert.throws(() => assertSameOrigin(request('PUT', { origin: 'https://evil.example' }), config, true), error => error.status === 403)
  assert.throws(() => assertSameOrigin(request('PUT', { origin: undefined }), config, true), error => error.status === 403)
  assert.throws(() => assertSameOrigin(request('GET', { host: 'preview.example.test' }), config), error => error.status === 403)
  assert.throws(() => assertSameOrigin(request('PUT', { 'sec-fetch-site': 'cross-site' }), config, true), error => error.status === 403)
  assert.match(cookie(SESSION_COOKIE, '', 0), /Max-Age=0/)
})

test('request validation rejects wrong media, oversized and invalid JSON without returning source data', async () => {
  await assert.rejects(bodyJSON({ headers: { 'content-type': 'text/plain' }, body: '{}' }), error => error.status === 415)
  await assert.rejects(bodyJSON({ headers: { 'content-type': 'application/json' }, body: 'x'.repeat(50) }, 20), error => error.status === 413)
  await assert.rejects(bodyJSON({ headers: { 'content-type': 'application/json' }, body: '{bad' }), error => error.code === 'INVALID_JSON')
  const headers = {}; let body
  const res = { setHeader: (key, value) => { headers[key] = value }, end: value => { body = value } }
  fail(res, new Error('secret-content-not-for-response'))
  assert.equal(res.statusCode, 500); assert.doesNotMatch(body, /secret-content/)
  assert.equal(headers['Cache-Control'], 'private, no-store')
  fail(res, new HttpError(409, 'REVISION_CONFLICT', '版本冲突', { revision: 'r2' }))
  assert.equal(JSON.parse(body).revision, 'r2')
})
