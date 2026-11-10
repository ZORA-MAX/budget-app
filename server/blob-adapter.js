import { get, put, BlobNotFoundError, BlobPreconditionFailedError } from '@vercel/blob'
import { HttpError } from './http.js'

export function privateBlobAdapter(env = process.env, sdk = { get, put }) {
  if (!env.BLOB_STORE_ID && !env.BLOB_READ_WRITE_TOKEN) throw new HttpError(503, 'CLOUD_NOT_CONFIGURED', '私有云端存储尚未连接')
  const credentials = env.BLOB_READ_WRITE_TOKEN ? { token: env.BLOB_READ_WRITE_TOKEN } : { storeId: env.BLOB_STORE_ID }
  async function read(pathname, { fresh = false } = {}) {
      let result
      try { result = await sdk.get(pathname, { access: 'private', useCache: !fresh, ...credentials }) }
      catch (error) { if (error instanceof BlobNotFoundError) return null; throw error }
      if (!result) return null
      if (!result.stream || result.statusCode !== 200) throw new HttpError(503, 'CLOUD_READ_FAILED', '云端读取未完成，请稍后重试')
      return { value: JSON.parse(await new Response(result.stream).text()), etag: result.blob.etag }
  }
  return {
    read,
    async write(pathname, value, { ifMatch, createOnly = false } = {}) {
      try {
        return await sdk.put(pathname, JSON.stringify(value), { access: 'private', addRandomSuffix: false, allowOverwrite: !createOnly, ...(ifMatch ? { ifMatch } : {}), contentType: 'application/json', cacheControlMaxAge: 60, ...credentials })
      } catch (error) {
        // SDK errors inherit name="Error". Use the class, not error.name.
        // A create collision may be a generic BlobError. Read back privately to
        // distinguish a concurrent creation (including a lost success response)
        // from a failed write without relying on provider error-message text.
        const createdMeanwhile = createOnly ? await read(pathname, { fresh: true }) : null
        if (error instanceof BlobPreconditionFailedError || createdMeanwhile) {
          const conflict = new Error('conditional-write-failed'); conflict.code = 'PRECONDITION_FAILED'; throw conflict
        }
        throw error
      }
    },
  }
}
