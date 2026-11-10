import { requireOwner } from '../../server/auth.js'
import { fail, method, json } from '../../server/http.js'
export default async function handler(req, res) {
  try { method(req, ['GET']); json(res, 200, { authenticated: true, user: await requireOwner(req) }) } catch (error) { fail(res, error) }
}
