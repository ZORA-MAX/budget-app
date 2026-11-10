import test from 'node:test'
import assert from 'node:assert/strict'
import {
  createCloudSyncController, createCloudTransport, fingerprintSnapshot,
  splitCloudSnapshot, assembleCloudSnapshot, isEmptySnapshot, snapshotContent,
} from '../src/lib/cloud-sync.js'
import { createDefaultTaxonomySnapshot, validateBackupPayload } from '../src/lib/storage.js'
import { createCloudStore } from '../server/cloud-store.js'
import { subscribeBudgetChanges } from '../src/lib/budget-events.js'
import { addCategory, renameCategory, restoreTaxonomySnapshot } from '../src/lib/categories.js'
import { saveDebtLedger, clearDebtLedger } from '../src/lib/debt-ledger.js'

const copy = value => structuredClone(value)
function snapshot(amount = null, monthKey = '2026-09') {
  return {
    format: 'budget-app-backup', schemaVersion: 2, exportedAt: '2026-11-10T00:00:00.000Z',
    data: { months: amount === null ? [] : [{ monthKey, transactions: [{ name: '早餐', amount, date: `${monthKey}-01T01:00:00.000Z`, rawId: '90071992547409931234' }] }], overrides: [], classificationMemory: [] },
    debtLedger: null, taxonomy: createDefaultTaxonomySnapshot(),
  }
}
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b }); return { promise, resolve, reject } }

async function harness(t, { local = snapshot(), cloud = null, baseline, revision = cloud ? 'r1' : null } = {}) {
  let current = copy(local), remote = { snapshot: copy(cloud), revision }, checkpoint = baseline ? { revision: 'r0', fingerprint: await fingerprintSnapshot(baseline) } : null
  let version = 0, subscriber
  const calls = { pulls: 0, pushes: [], replacements: [], backups: [] }
  const storage = {
    createSnapshot: async () => copy(current),
    replaceSnapshot: async (value, { shouldApply }) => {
      if (!shouldApply()) throw Object.assign(new Error('local changed'), { code: 'LOCAL_CHANGED' })
      calls.replacements.push(copy(value)); current = copy(value); version += 1
      subscriber?.({ source: 'cloud' })
    },
    loadCheckpoint: async () => copy(checkpoint),
    saveCheckpoint: async value => { checkpoint = copy(value) },
    saveBackups: async value => { calls.backups.push(copy(value)); return `backup-${calls.backups.length}` },
    subscribe: callback => { subscriber = callback; return () => { subscriber = null } },
    getVersion: () => version,
  }
  const transport = {
    pull: async () => { calls.pulls += 1; return copy(remote) },
    push: async (value, baseRevision) => {
      calls.pushes.push({ snapshot: copy(value), baseRevision })
      assert.equal(baseRevision, remote.revision, 'must use the observed cloud revision')
      remote = { snapshot: copy(value), revision: `r${calls.pushes.length + 10}` }
      return { revision: remote.revision }
    },
  }
  const controller = createCloudSyncController({ storage, transport, pollMs: 0, debounceMs: 10000 })
  t.after(() => controller.stop())
  return { controller, storage, transport, calls,
    local: () => copy(current), checkpoint: () => copy(checkpoint),
    setRemote: (value, rev) => { remote = { snapshot: copy(value), revision: rev } },
    edit: value => { current = copy(value); version += 1; subscriber?.({ source: 'local' }) },
  }
}

test('an empty device restores cloud data, debt and taxonomy after a durable local backup', async t => {
  const cloud = snapshot(20)
  cloud.debtLedger = { version: 1, items: [{ id: 'loan', title: '助学贷款', remainingPrincipal: 92000 }] }
  cloud.taxonomy.categories[0].label = '我的居住'
  const h = await harness(t, { cloud })
  await h.controller.start()
  assert.deepEqual(h.local(), cloud)
  assert.equal(h.calls.backups.length, 1)
  assert.equal(h.calls.pushes.length, 0)
  assert.equal(h.controller.getState().status, 'synced')
})

test('a first local ledger can initialize an empty cloud using CAS null', async t => {
  const h = await harness(t, { local: snapshot(20) })
  await h.controller.start()
  assert.equal(h.calls.pushes.length, 1)
  assert.equal(h.calls.pushes[0].baseRevision, null)
  assert.equal(h.controller.getState().status, 'synced')
})

test('first connection with two different ledgers asks for a choice without any writes', async t => {
  const h = await harness(t, { local: snapshot(20), cloud: snapshot(30) })
  await h.controller.start()
  assert.equal(h.controller.getState().status, 'conflict')
  assert.deepEqual(h.controller.getState().conflict.localSummary.monthKeys, ['2026-09'])
  assert.equal(h.calls.pushes.length + h.calls.replacements.length, 0)
})

test('a stale unchanged device pulls a newer cloud; it never overwrites it with old local data', async t => {
  const old = snapshot(20)
  const h = await harness(t, { local: old, cloud: snapshot(30), baseline: old, revision: 'r2' })
  await h.controller.start()
  assert.equal(h.local().data.months[0].transactions[0].amount, 30)
  assert.equal(h.calls.pushes.length, 0)
})

test('unsynced edits on both devices pause automatic sync', async t => {
  const h = await harness(t, { local: snapshot(25), cloud: snapshot(30), baseline: snapshot(20), revision: 'r2' })
  await h.controller.start()
  await h.controller.syncNow()
  assert.equal(h.controller.getState().status, 'conflict')
  assert.equal(h.calls.pushes.length + h.calls.replacements.length, 0)
})

test('an intentional local clear is uploaded when the cloud still matches the checkpoint', async t => {
  const old = snapshot(20)
  const h = await harness(t, { local: snapshot(), cloud: old, baseline: old })
  await h.controller.start()
  assert.equal(h.calls.replacements.length, 0)
  assert.equal(h.calls.pushes[0].snapshot.data.months.length, 0)
})

test('choosing cloud saves both copies and replaces the whole local ledger', async t => {
  const local = snapshot(20, '2026-08'), cloud = snapshot(30, '2026-09')
  const h = await harness(t, { local, cloud })
  await h.controller.start()
  const result = await h.controller.resolveConflict('cloud')
  assert.equal(result.backupId, 'backup-1')
  assert.deepEqual(h.calls.backups[0].local, local)
  assert.deepEqual(h.calls.backups[0].cloud, cloud)
  assert.deepEqual(h.local().data.months.map(month => month.monthKey), ['2026-09'])
})

test('choosing local also backs up the cloud and commits against its observed revision', async t => {
  const h = await harness(t, { local: snapshot(20), cloud: snapshot(30) })
  await h.controller.start()
  await h.controller.resolveConflict('local')
  assert.equal(h.calls.backups[0].cloud.data.months[0].transactions[0].amount, 30)
  assert.equal(h.calls.pushes[0].baseRevision, 'r1')
})

test('a cloud change since the conflict was shown requires a fresh choice', async t => {
  const h = await harness(t, { local: snapshot(20), cloud: snapshot(30) })
  await h.controller.start()
  h.setRemote(snapshot(40), 'r2')
  await h.controller.resolveConflict('local')
  assert.equal(h.calls.pushes.length, 0)
  assert.equal(h.controller.getState().revision, 'r2')
  assert.equal(h.controller.getState().status, 'conflict')
})

test('a backup failure prevents any overwrite', async t => {
  const h = await harness(t, { local: snapshot(20), cloud: snapshot(30) })
  await h.controller.start()
  h.storage.saveBackups = async () => { throw new Error('quota exceeded') }
  await h.controller.resolveConflict('cloud')
  assert.equal(h.calls.replacements.length + h.calls.pushes.length, 0)
  assert.equal(h.local().data.months[0].transactions[0].amount, 20)
  assert.equal(h.controller.getState().status, 'error')
})

test('local changes while backups are saved are preserved and require a fresh choice', async t => {
  const h = await harness(t, { local: snapshot(20), cloud: snapshot(30) })
  await h.controller.start()
  h.storage.saveBackups = async () => { h.edit(snapshot(25)); return 'backup' }
  await h.controller.resolveConflict('cloud')
  assert.equal(h.calls.replacements.length, 0)
  assert.equal(h.local().data.months[0].transactions[0].amount, 25)
  assert.equal(h.controller.getState().status, 'conflict')
})

test('CAS 409 stops further pushes until an explicit new conflict choice', async t => {
  const old = snapshot(20)
  const h = await harness(t, { local: snapshot(25), cloud: old, baseline: old })
  let pushes = 0
  h.transport.push = async () => { pushes += 1; h.setRemote(snapshot(40), 'r2'); throw Object.assign(new Error('conflict'), { status: 409, revision: 'r2' }) }
  await h.controller.start()
  h.edit(snapshot(26))
  await h.controller.syncNow()
  assert.equal(pushes, 1)
  assert.equal(h.controller.getState().status, 'conflict')
})

test('edits made during a successful push remain pending for the next revision', async t => {
  const old = snapshot(20)
  const h = await harness(t, { local: snapshot(25), cloud: old, baseline: old })
  const push = h.transport.push
  h.transport.push = async (...args) => { h.edit(snapshot(26)); return push(...args) }
  await h.controller.start()
  assert.equal(h.controller.getState().pendingChanges, true)
  assert.equal(h.checkpoint().fingerprint, await fingerprintSnapshot(snapshot(25)))
  h.transport.push = push
  await h.controller.syncNow()
  assert.equal(h.calls.pushes.at(-1).snapshot.data.months[0].transactions[0].amount, 26)
  assert.equal(h.controller.getState().pendingChanges, false)
})

test('logout cancels pending work and a new login can start immediately', async t => {
  const h = await harness(t, { cloud: snapshot(30) })
  const gate = deferred(), pull = h.transport.pull
  h.transport.pull = () => gate.promise
  const pending = h.controller.start()
  h.controller.stop()
  h.transport.pull = pull
  await h.controller.start()
  gate.resolve({ revision: 'old', snapshot: snapshot(99) })
  await pending
  assert.equal(h.local().data.months[0].transactions[0].amount, 30)
  assert.equal(h.calls.replacements.length, 1)
})

test('offline errors preserve data and successful reconnect resumes', async t => {
  const h = await harness(t, { local: snapshot(20) })
  const pull = h.transport.pull
  h.transport.pull = async () => { throw new TypeError('network unavailable') }
  await h.controller.start()
  assert.equal(h.controller.getState().status, 'offline')
  assert.equal(h.calls.pushes.length, 0)
  h.transport.pull = pull
  await h.controller.syncNow()
  assert.equal(h.controller.getState().status, 'synced')
})

test('an expired session stops listening and leaves all local data intact', async t => {
  const h = await harness(t, { local: snapshot(20) })
  h.transport.pull = async () => { throw Object.assign(new Error('expired'), { status: 401 }) }
  await h.controller.start()
  assert.equal(h.controller.getState().status, 'signed-out')
  assert.equal(h.calls.pushes.length + h.calls.replacements.length, 0)
  assert.equal(h.local().data.months[0].transactions[0].amount, 20)
})

test('fingerprints ignore export/save timestamps and object/record order, but retain financial detail', async () => {
  const first = snapshot(20), second = copy(first)
  first.data.months.push(...snapshot(10, '2026-08').data.months)
  second.data.months = copy(first.data.months).reverse()
  second.data.months[0].updatedAt = '2026-11-11T00:00:00Z'
  second.exportedAt = '2026-11-12T00:00:00Z'
  assert.equal(await fingerprintSnapshot(first), await fingerprintSnapshot(second))
  second.data.months[0].transactions[0].netConsumption = 0
  assert.notEqual(await fingerprintSnapshot(first), await fingerprintSnapshot(second))
})

test('month parts round-trip full details, debt, taxonomy and orphan overrides without merging', () => {
  const original = snapshot(0)
  original.data.months[0].transactions[0].netConsumption = 0
  original.data.months[0].transactions[0].includeInConsumption = false
  original.data.overrides = [{ monthKey: '2026-09', overrides: { abc: { catKey: 'food', subKey: 'breakfast' } } }, { monthKey: '2026-07', overrides: { orphan: { tags: ['rigid'] } } }]
  const parts = splitCloudSnapshot(original)
  const rebuilt = assembleCloudSnapshot(parts)
  assert.deepEqual(snapshotContent(rebuilt), snapshotContent(original))
  assert.equal(rebuilt.data.months[0].transactions[0].rawId, '90071992547409931234')
  assert.equal(isEmptySnapshot(snapshot()), true)
  const customizedEmpty = snapshot()
  customizedEmpty.taxonomy.categories[0].label = '自定义'
  assert.equal(isEmptySnapshot(customizedEmpty), false)
})

test('transport uploads immutable parts before the only CAS commit and surfaces 409', async () => {
  const paths = [], commits = []
  const transport = createCloudTransport({ fetchImpl: async (url, options) => {
    paths.push(url)
    const body = JSON.parse(options.body)
    if (url === '/api/sync-part') return { ok: true, json: async () => ({ part: { kind: body.kind, ...(body.monthKey ? { monthKey: body.monthKey } : {}), hash: `hash-${paths.length}` } }) }
    commits.push(body)
    return { ok: false, status: 409, json: async () => ({ error: { code: 'REVISION_CONFLICT', message: 'new revision' }, revision: 'r2' }) }
  } })
  await assert.rejects(transport.push(snapshot(20), 'r1'), error => error.status === 409 && error.revision === 'r2')
  assert.deepEqual(paths, ['/api/sync-part', '/api/sync-part', '/api/sync'])
  assert.equal(commits[0].baseRevision, 'r1')
  assert.equal(commits[0].parts.length, 2)
  assert.match(commits[0].requestId, /^[0-9a-f-]{36}$/)
})

test('invalid complete snapshots are rejected before any restore', () => {
  const value = snapshot(20)
  value.data.months.push(copy(value.data.months[0]))
  assert.throws(() => validateBackupPayload(value, { cloud: true }), /重复月份/)
  const broken = snapshot(20)
  broken.taxonomy.tags.push(copy(broken.taxonomy.tags[0]))
  assert.throws(() => validateBackupPayload(broken, { cloud: true }), /标签/)
})

test('taxonomy and debt mutations notify automatic sync without page-specific wiring', () => {
  const events = []
  const unsubscribe = subscribeBudgetChanges(detail => events.push(detail))
  try {
    const category = addCategory('同步测试')
    renameCategory(category.key, '已改名')
    saveDebtLedger({ version: 1, items: [] })
    clearDebtLedger()
    assert.deepEqual(events.map(event => event.kind), ['taxonomy', 'taxonomy', 'debt', 'debt'])
    assert.ok(events.every(event => event.source === 'local'))
  } finally {
    unsubscribe()
    restoreTaxonomySnapshot(createDefaultTaxonomySnapshot(), { silent: true })
  }
})

test('frontend sharded transport interoperates with the server store, including null debt and CAS', async () => {
  const records = new Map()
  let sequence = 0
  const store = createCloudStore({
    async read(path) { return copy(records.get(path) || null) },
    async write(path, value, options = {}) {
      const old = records.get(path)
      if ((options.createOnly && old) || (options.ifMatch && old?.etag !== options.ifMatch)) throw Object.assign(new Error('conflict'), { code: 'PRECONDITION_FAILED' })
      const etag = `e${++sequence}`
      records.set(path, { value: copy(value), etag })
      return { etag }
    },
  }, 'transport-test-owner')
  const transport = createCloudTransport({ fetchImpl: async (path, options) => {
    assert.equal(options.credentials, 'same-origin')
    assert.equal(options.cache, 'no-store')
    const url = new URL(path, 'https://example.test'), body = options.body ? JSON.parse(options.body) : null
    try {
      let result
      if (url.pathname === '/api/sync') result = body ? await store.commit(body) : await store.load({ manifestOnly: true })
      else if (body) result = { part: await store.uploadPart(body) }
      else result = await store.readPart(Object.fromEntries(url.searchParams))
      return { ok: true, json: async () => result }
    } catch (error) {
      return { ok: false, status: error.status, json: async () => ({ error: { code: error.code, message: error.message }, ...error.details }) }
    }
  } })
  assert.equal((await transport.pull()).snapshot, null)
  const original = snapshot(20)
  original.data.overrides = [{ monthKey: '2026-07', overrides: { orphan: { tags: ['rigid'] } } }]
  const first = await transport.push(original, null)
  const loaded = await transport.pull()
  assert.equal(loaded.revision, first.revision)
  assert.deepEqual(snapshotContent(loaded.snapshot), snapshotContent(original))
  await transport.push(snapshot(30), first.revision)
  await assert.rejects(transport.push(snapshot(40), first.revision), error => error.status === 409)
  assert.equal((await transport.pull()).snapshot.data.months[0].transactions[0].amount, 30)
})
