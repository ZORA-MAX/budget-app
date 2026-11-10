import { authConfig, assertSameOrigin, finishLogin, cookie, OAUTH_COOKIE } from '../../server/auth.js'
import { fail, method, secureHeaders } from '../../server/http.js'
export default async function handler(req, res) {
  try {
    method(req, ['GET']); const config = authConfig(); assertSameOrigin(req, config)
    const result = await finishLogin(req, config)
    secureHeaders(res); res.setHeader('Set-Cookie', result.cookies); res.setHeader('Location', `${config.origin}/#/history`); res.statusCode = 302; res.end()
  } catch (error) { res.setHeader('Set-Cookie', cookie(OAUTH_COOKIE, '', 0)); fail(res, error) }
}
