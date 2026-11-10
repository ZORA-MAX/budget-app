import { requireOwner } from '../server/auth.js'
import { privateBlobAdapter } from '../server/blob-adapter.js'
import { createCloudStore } from '../server/cloud-store.js'
import { bodyJSON, fail, json, method } from '../server/http.js'
export default async function handler(req, res) {
  try {
    method(req, ['GET', 'PUT']); const user = await requireOwner(req)
    const store = createCloudStore(privateBlobAdapter(), user.id)
    if (req.method === 'GET') {
      const query = new URL(req.url, 'https://local.invalid').searchParams
      const part = { kind: query.get('kind'), hash: query.get('hash'), ...(query.has('monthKey') ? { monthKey: query.get('monthKey') } : {}) }
      json(res, 200, await store.readPart(part))
    } else json(res, 200, { part: await store.uploadPart(await bodyJSON(req)) })
  } catch (error) { fail(res, error) }
}
