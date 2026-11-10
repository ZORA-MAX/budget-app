import { authConfig, assertSameOrigin, cookie, SESSION_COOKIE, OAUTH_COOKIE } from '../../server/auth.js'
import { fail, method, json } from '../../server/http.js'
export default async function handler(req, res) {
  try {
    method(req, ['POST']); assertSameOrigin(req, authConfig(), true)
    res.setHeader('Set-Cookie', [cookie(SESSION_COOKIE, '', 0), cookie(OAUTH_COOKIE, '', 0)]); json(res, 200, { authenticated: false })
  } catch (error) { fail(res, error) }
}
