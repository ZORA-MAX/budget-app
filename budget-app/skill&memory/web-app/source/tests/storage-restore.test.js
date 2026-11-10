import test from 'node:test'
import assert from 'node:assert/strict'
import { commitRestoreTransaction } from '../src/lib/storage.js'

function fixture({ metadataFailure, commitFailure = false } = {}) {
  const before = {
    months: { '2026-08': ['existing August'], '2026-09': ['old September'] },
    overrides: { '2026-09': { old: 'food' } }, memory: { old: 'food' },
  }
  let database = structuredClone(before)
  const browser = { debt: { id: 'old debt' }, taxonomy: { id: 'old taxonomy' } }
  const previousBrowser = structuredClone(browser)
  let staged, aborted = false, resolve, reject
  const done = new Promise((a, b) => { resolve = a; reject = b })
  const transaction = {
    done,
    abort() { aborted = true; reject(new DOMException('aborted', 'AbortError')) },
  }
  const writes = []
  const access = {
    readDebt: () => structuredClone(browser.debt),
    readTaxonomy: () => structuredClone(browser.taxonomy),
    writeDebt(value) {
      writes.push(['debt', value.id])
      metadataFailure?.('debt', value)
      browser.debt = structuredClone(value)
    },
    writeTaxonomy(value) {
      writes.push(['taxonomy', value.id])
      metadataFailure?.('taxonomy', value)
      browser.taxonomy = structuredClone(value)
    },
  }
  function queueWrites() {
    staged = structuredClone(database)
    staged.months['2026-09'] = ['imported September']
    staged.months['2026-10'] = ['imported October']
    staged.overrides['2026-09'] = { updated: 'daily' }
    staged.memory.new = 'daily'
    // Native IDB commits only after the synchronous JS task has completed.
    setImmediate(() => {
      if (aborted) return
      if (commitFailure) { reject(new DOMException('IDB quota exceeded', 'QuotaExceededError')); return }
      database = staged
      resolve()
    })
    return [Promise.resolve()]
  }
  return { transaction, queueWrites, access, before, previousBrowser, browser, writes, database: () => database, aborted: () => aborted }
}

const incoming = { debtLedger: { id: 'new debt' }, taxonomy: { id: 'new taxonomy' } }

test('file restore aborts every IDB store and rolls back debt when taxonomy exceeds localStorage quota', async () => {
  const h = fixture({ metadataFailure: (kind, value) => {
    if (kind === 'taxonomy' && value.id === 'new taxonomy') throw new DOMException('quota exceeded', 'QuotaExceededError')
  } })
  await assert.rejects(commitRestoreTransaction(h.transaction, h.queueWrites, incoming, h.access), { name: 'QuotaExceededError' })
  assert.equal(h.aborted(), true)
  assert.deepEqual(h.database(), h.before)
  assert.deepEqual(h.browser, h.previousBrowser)
  assert.deepEqual(h.writes, [['debt', 'new debt'], ['taxonomy', 'new taxonomy'], ['debt', 'old debt']])
})

test('a localStorage security failure leaves the database and both metadata values unchanged', async () => {
  const h = fixture({ metadataFailure: () => { throw new DOMException('storage denied', 'SecurityError') } })
  await assert.rejects(commitRestoreTransaction(h.transaction, h.queueWrites, incoming, h.access), { name: 'SecurityError' })
  assert.deepEqual(h.database(), h.before)
  assert.deepEqual(h.browser, h.previousBrowser)
})

test('an asynchronous IndexedDB failure rolls back already-written debt and taxonomy', async () => {
  const h = fixture({ commitFailure: true })
  await assert.rejects(commitRestoreTransaction(h.transaction, h.queueWrites, incoming, h.access), { name: 'QuotaExceededError' })
  assert.deepEqual(h.database(), h.before)
  assert.deepEqual(h.browser, h.previousBrowser)
  assert.deepEqual(h.writes.slice(-2), [['taxonomy', 'old taxonomy'], ['debt', 'old debt']])
})

test('successful file restoration keeps months outside the import and commits metadata together', async () => {
  const h = fixture()
  await commitRestoreTransaction(h.transaction, h.queueWrites, incoming, h.access)
  assert.deepEqual(h.database().months, { '2026-08': ['existing August'], '2026-09': ['imported September'], '2026-10': ['imported October'] })
  assert.deepEqual(h.database().memory, { old: 'food', new: 'daily' })
  assert.deepEqual(h.browser, { debt: incoming.debtLedger, taxonomy: incoming.taxonomy })
  assert.equal(h.aborted(), false)
})

test('legacy files without debt or taxonomy leave browser metadata untouched', async () => {
  const h = fixture()
  const deniedMetadata = new Proxy({}, { get() { throw new Error('legacy import must not access metadata') } })
  await commitRestoreTransaction(h.transaction, h.queueWrites, {}, deniedMetadata)
  assert.deepEqual(h.browser, h.previousBrowser)
  assert.deepEqual(h.database().months['2026-09'], ['imported September'])
})

test('rollback attempts both metadata keys even if restoring one is rejected', async () => {
  const h = fixture({ commitFailure: true, metadataFailure: (kind, value) => {
    if (kind === 'taxonomy' && value.id === 'old taxonomy') throw new DOMException('blocked rollback', 'SecurityError')
  } })
  await assert.rejects(commitRestoreTransaction(h.transaction, h.queueWrites, incoming, h.access), error => error instanceof AggregateError && error.errors.length === 2)
  assert.deepEqual(h.database(), h.before)
  assert.deepEqual(h.browser.debt, h.previousBrowser.debt)
  assert.deepEqual(h.writes.slice(-2), [['taxonomy', 'old taxonomy'], ['debt', 'old debt']])
})
