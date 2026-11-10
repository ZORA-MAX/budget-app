import { authConfig, assertSameOrigin, startLogin } from '../../server/auth.js'
import { fail, method, secureHeaders } from '../../server/http.js'
export default async function handler(req, res) {
  try {
    method(req, ['GET']); const config = authConfig(); assertSameOrigin(req, config)
    const result = await startLogin(config)
    secureHeaders(res); res.setHeader('Set-Cookie', result.cookie); res.setHeader('Location', result.location); res.statusCode = 302; res.end()
  } catch (error) { fail(res, error) }
}
