import test from 'node:test'
import assert from 'node:assert/strict'
import { createCloudStore } from '../server/cloud-store.js'
import { validateBackup, splitBackup, assembleBackup, hashJSON, canonicalJSON, PART_LIMIT } from '../server/backup-schema.js'

function fixture(amount = 100) {
  return { format: 'budget-app-backup', schemaVersion: 2, exportedAt: '2026-11-10T00:00:00Z', data: {
    months: [{ monthKey: '2026-09', updatedAt: '2026-11-10T00:00:00Z', transactions: [
      { date: '2026-09-01T02:00:00Z', name: '测试消费', amount, netConsumption: amount / 2, direction: 'expense', stableKey: 'test:1', rawFields: { 原始金额: amount, 备注: '证据保留' } },
      { date: '2026-09-01T02:00:00Z', name: '零金额记录', amount: 0, netConsumption: 0, direction: 'expense', stableKey: 'test:2' },
    ] }],
    overrides: [{ monthKey: '2026-09', overrides: { 'test:1': { catKey: 'food', subKey: 'takeout', annotationSource: 'auto' } } }, { monthKey: '2026-10', overrides: { orphan: { catKey: 'daily', subKey: 'misc_daily' } } }],
    classificationMemory: [{ key: 'expense|测试', catKey: 'food', subKey: 'takeout', tags: ['rigid'] }],
  }, taxonomy: { categories: [{ key: 'food', label: '餐饮', subs: [] }], tags: [] }, debtLedger: { version: 1, items: [{ id: 'debt-test', title: '测试贷款', originalPrincipal: 1000, payments: [{ date: '2026-11-10', amount: 10 }] }] } }
}

function memoryAdapter() {
  const data = new Map(); let sequence = 0
  return { data,
    async read(path) { const entry = data.get(path); return entry ? structuredClone(entry) : null },
    async write(path, value, options = {}) {
      const current = data.get(path)
      if ((options.createOnly && current) || (options.ifMatch && options.ifMatch !== current?.etag)) { const error = new Error('conflict'); error.code = 'PRECONDITION_FAILED'; throw error }
      const etag = `etag-${++sequence}`; data.set(path, { value: structuredClone(value), etag }); return { etag }
    },
  }
}

const id = suffix => `test-request-id-${suffix}`

test('cloud snapshot roundtrip preserves all finance evidence, zero rows, orphan overrides, taxonomy and debt', async () => {
  const store = createCloudStore(memoryAdapter(), 'owner-test')
  const snapshot = fixture()
  const result = await store.commit({ baseRevision: null, requestId: id('one'), snapshot })
  const loaded = await store.load()
  assert.equal(loaded.revision, result.revision)
  assert.deepEqual(loaded.snapshot, snapshot)
  assert.ok((await store.load({ manifestOnly: true })).parts.length === 2)
})

test('partitioning is deterministic and preserves metadata-only overrides', () => {
  const snapshot = fixture()
  const entries = splitBackup(snapshot).map(({ kind, monthKey, payload }) => ({ part: { kind, ...(monthKey ? { monthKey } : {}), hash: hashJSON(payload) }, payload }))
  assert.deepEqual(assembleBackup(entries), snapshot)
  assert.equal(hashJSON({ a: 1, b: 2 }), hashJSON({ b: 2, a: 1 }))
  assert.equal(entries.find(entry => entry.part.kind === 'metadata').payload.data.overrides[0].monthKey, '2026-10')
})

test('two devices saving the same base version cannot overwrite each other', async () => {
  const store = createCloudStore(memoryAdapter(), 'owner-test')
  const first = await store.commit({ baseRevision: null, requestId: id('initial'), snapshot: fixture() })
  const results = await Promise.allSettled([
    store.commit({ baseRevision: first.revision, requestId: id('device-a'), snapshot: fixture(200) }),
    store.commit({ baseRevision: first.revision, requestId: id('device-b'), snapshot: fixture(300) }),
  ])
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1)
  const failed = results.find(result => result.status === 'rejected')
  assert.equal(failed.reason.status, 409)
  const amount = (await store.load()).snapshot.data.months[0].transactions[0].amount
  assert.ok(amount === 200 || amount === 300)
})

test('first-save races also preserve exactly one committed snapshot', async () => {
  const store = createCloudStore(memoryAdapter(), 'owner-test')
  const results = await Promise.allSettled([
    store.commit({ baseRevision: null, requestId: id('new-a'), snapshot: fixture(200) }),
    store.commit({ baseRevision: null, requestId: id('new-b'), snapshot: fixture(300) }),
  ])
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1)
  assert.equal(results.find(result => result.status === 'rejected').reason.status, 409)
})

test('network retry is idempotent and a reused request id cannot change content', async () => {
  const store = createCloudStore(memoryAdapter(), 'owner-test')
  const request = { baseRevision: null, requestId: id('retry'), snapshot: fixture() }
  const first = await store.commit(request)
  assert.deepEqual(await store.commit(request), first)
  await assert.rejects(store.commit({ ...request, snapshot: fixture(200) }), error => error.code === 'REQUEST_ID_REUSED')
})

test('missing or invalid parts never replace the current manifest', async () => {
  const adapter = memoryAdapter(); const store = createCloudStore(adapter, 'owner-test')
  const first = await store.commit({ baseRevision: null, requestId: id('before-failure'), snapshot: fixture() })
  await assert.rejects(store.commit({ baseRevision: first.revision, requestId: id('bad-parts'), parts: [{ kind: 'metadata', hash: 'f'.repeat(64) }] }), error => error.code === 'MISSING_PART')
  const bad = fixture(); bad.data.months[0].transactions[0].netConsumption = -1
  await assert.rejects(store.commit({ baseRevision: first.revision, requestId: id('bad-value'), snapshot: bad }), error => error.code === 'INVALID_BACKUP')
  assert.equal((await store.load()).revision, first.revision)
})

test('part references are isolated by authenticated owner and reject path traversal', async () => {
  const adapter = memoryAdapter(); const a = createCloudStore(adapter, 'owner-a'); const b = createCloudStore(adapter, 'owner-b')
  const part = await a.uploadPart(splitBackup(fixture())[0])
  await assert.rejects(b.readPart(part), error => error.code === 'MISSING_PART')
  await assert.rejects(a.readPart({ ...part, monthKey: '../../secrets' }), error => error.code === 'INVALID_BACKUP')
})

test('sharded transfer can save and restore a snapshot larger than one function request', async () => {
  const snapshot = fixture()
  snapshot.data.months = Array.from({ length: 6 }, (_, index) => ({ monthKey: `2026-${String(index + 1).padStart(2, '0')}`, transactions: [{ date: '2026-01-01T00:00:00Z', name: '测试大分片', amount: 1, details: 'x'.repeat(800000) }] }))
  assert.ok(Buffer.byteLength(canonicalJSON(snapshot)) > 4.5 * 1024 * 1024)
  const store = createCloudStore(memoryAdapter(), 'owner-test'); const parts = []
  for (const part of splitBackup(snapshot)) parts.push(await store.uploadPart(part))
  await store.commit({ baseRevision: null, requestId: id('large'), parts })
  const manifest = await store.load({ manifestOnly: true })
  const entries = []
  for (const part of manifest.parts) entries.push(await store.readPart(part))
  assert.equal(assembleBackup(entries).data.months.length, 6)
  const tooLarge = splitBackup(fixture())[0]; tooLarge.payload.month.transactions[0].details = 'x'.repeat(PART_LIMIT)
  await assert.rejects(store.uploadPart(tooLarge), error => error.status === 413)
})

test('malformed and prototype-polluting backups are rejected before any write', () => {
  const bad = JSON.parse('{"format":"budget-app-backup","schemaVersion":2,"data":{"months":[],"overrides":[],"__proto__":{"polluted":true}}}')
  assert.throws(() => validateBackup(bad), error => error.code === 'INVALID_BACKUP')
  const duplicate = fixture(); duplicate.data.months.push(structuredClone(duplicate.data.months[0]))
  assert.throws(() => validateBackup(duplicate), error => error.code === 'INVALID_BACKUP')
})


test('missing storage ETag fails closed instead of allowing an unconditional overwrite', async () => {
  const adapter = memoryAdapter(); const store = createCloudStore(adapter, 'owner-test')
  const first = await store.commit({ baseRevision: null, requestId: id('etag-initial'), snapshot: fixture() })
  for (const [path, entry] of adapter.data) if (path.endsWith('/latest.json')) adapter.data.set(path, { value: entry.value })
  await assert.rejects(store.commit({ baseRevision: first.revision, requestId: id('etag-missing'), snapshot: fixture(200) }), error => error.code === 'CLOUD_DATA_INVALID')
})


test('explicit null debt ledger represents an empty debt state in a complete cloud snapshot', async () => {
  const snapshot = fixture(); snapshot.debtLedger = null
  const store = createCloudStore(memoryAdapter(), 'owner-test')
  await store.commit({ baseRevision: null, requestId: id('no-debt'), snapshot })
  assert.equal((await store.load()).snapshot.debtLedger, null)
})
