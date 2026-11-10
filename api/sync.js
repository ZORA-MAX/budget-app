import { requireOwner } from '../server/auth.js'
import { privateBlobAdapter } from '../server/blob-adapter.js'
import { createCloudStore } from '../server/cloud-store.js'
import { bodyJSON, fail, json, method, HttpError } from '../server/http.js'
export default async function handler(req, res) {
  try {
    method(req, ['GET', 'PUT']); const user = await requireOwner(req)
    const store = createCloudStore(privateBlobAdapter(), user.id)
    if (req.method === 'GET') {
      const manifestOnly = new URL(req.url, 'https://local.invalid').searchParams.get('manifest') === '1'
      const result = await store.load({ manifestOnly })
      if (!manifestOnly && Buffer.byteLength(JSON.stringify(result)) > 4 * 1024 * 1024) throw new HttpError(413, 'USE_SHARDED_SYNC', '请使用分片云端恢复')
      json(res, 200, result)
    } else json(res, 200, await store.commit(await bodyJSON(req)))
  } catch (error) { fail(res, error) }
}
