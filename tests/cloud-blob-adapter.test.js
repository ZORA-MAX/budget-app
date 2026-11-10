import test from 'node:test'
import assert from 'node:assert/strict'
import { BlobError, BlobNotFoundError, BlobPreconditionFailedError } from '@vercel/blob'
import { privateBlobAdapter } from '../server/blob-adapter.js'

const env = { BLOB_STORE_ID: 'store_test' }
const blob = (value = { sample: true }) => ({ statusCode: 200, stream: new Response(JSON.stringify(value)).body, blob: { etag: '"etag-test"' } })

test('private reads use SDK stream/etag and bypass cache for the mutable manifest', async () => {
  const adapter = privateBlobAdapter(env, {
    get: async (path, options) => {
      assert.equal(path, 'latest.json'); assert.equal(options.access, 'private'); assert.equal(options.useCache, false); assert.equal(options.storeId, env.BLOB_STORE_ID)
      return blob()
    },
  })
  assert.deepEqual(await adapter.read('latest.json', { fresh: true }), { value: { sample: true }, etag: '"etag-test"' })
})

test('SDK BlobNotFoundError is identified by class, not its inherited Error name', async () => {
  const error = new BlobNotFoundError()
  assert.equal(error.name, 'Error')
  const adapter = privateBlobAdapter(env, { get: async () => { throw error } })
  assert.equal(await adapter.read('missing.json'), null)
})

test('SDK BlobPreconditionFailedError maps to CAS conflict and preserves ifMatch', async () => {
  const adapter = privateBlobAdapter(env, { put: async (_path, _body, options) => {
    assert.equal(options.access, 'private'); assert.equal(options.allowOverwrite, true); assert.equal(options.ifMatch, '"old-etag"'); assert.equal(options.addRandomSuffix, false)
    throw new BlobPreconditionFailedError()
  } })
  await assert.rejects(adapter.write('latest.json', { sample: true }, { ifMatch: '"old-etag"' }), error => error.code === 'PRECONDITION_FAILED')
})

test('generic SDK create collision is recognized by fresh readback without blind overwrite', async () => {
  let writes = 0
  const adapter = privateBlobAdapter(env, {
    put: async (_path, _body, options) => { writes++; assert.equal(options.allowOverwrite, false); assert.equal(options.ifMatch, undefined); throw new BlobError('existing file') },
    get: async (_path, options) => { assert.equal(options.useCache, false); return blob() },
  })
  await assert.rejects(adapter.write('latest.json', { sample: true }, { createOnly: true }), error => error.code === 'PRECONDITION_FAILED')
  assert.equal(writes, 1)
})

test('a failed create with no remote object keeps the original storage error', async () => {
  const error = new BlobError('storage unavailable')
  const adapter = privateBlobAdapter(env, { put: async () => { throw error }, get: async () => null })
  await assert.rejects(adapter.write('new.json', {}, { createOnly: true }), candidate => candidate === error)
})
