import { loadDebtLedger, saveDebtLedger, clearDebtLedger, validateDebtLedger } from './debt-ledger.js'
import { createTaxonomySnapshot, createDefaultTaxonomySnapshot, restoreTaxonomySnapshot, validateTaxonomySnapshot } from './categories.js'
import { emitBudgetChange, withBudgetWrite, duringCloudReplacement, notifyCloudApplied } from './budget-events.js'
import { openDB } from 'idb'
import { analysisRowsToMemoryRecords, classificationMemoryKey, mergeMemoryRecord } from './classification-memory.js'

const DB_NAME = 'budget-app'
const DB_VERSION = 5
const STORE_NAME = 'monthly-data'
const OVERRIDE_STORE_NAME = 'overrides'
const MEMORY_STORE = 'classification-memory'
const SYNC_STORE = 'cloud-sync-state'

export const BACKUP_FORMAT = 'budget-app-backup'
export const BACKUP_SCHEMA_VERSION = 2

let databasePromise
async function getDB() {
  if (!databasePromise) databasePromise = openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'monthKey' })
      }
      if (!db.objectStoreNames.contains(OVERRIDE_STORE_NAME)) {
        db.createObjectStore(OVERRIDE_STORE_NAME, { keyPath: 'monthKey' })
      }
      if (!db.objectStoreNames.contains(MEMORY_STORE)) {
        db.createObjectStore(MEMORY_STORE, { keyPath: 'key' })
      }
      if (!db.objectStoreNames.contains(SYNC_STORE)) db.createObjectStore(SYNC_STORE, { keyPath: 'key' })
    },
    blocking() { databasePromise?.then(db => db.close()); databasePromise = null },
    terminated() { databasePromise = null },
  })
  try { return await databasePromise } catch (error) { databasePromise = null; throw error }
}

function normalizeDate(value) {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) throw new Error('账单中包含无效日期')
  return date.toISOString()
}

export async function saveMonth(monthKey, transactions) {
  return withBudgetWrite(async () => {
    const db = await getDB()
    const serialized = transactions.map(tx => ({ ...tx, date: normalizeDate(tx.date) }))
    await db.put(STORE_NAME, { monthKey, transactions: serialized, updatedAt: new Date().toISOString() })
    emitBudgetChange('month')
  })
}

export async function loadMonth(monthKey) {
  const db = await getDB()
  const record = await db.get(STORE_NAME, monthKey)
  if (!record) return null
  return record.transactions.map(tx => ({ ...tx, date: new Date(tx.date) }))
}

export async function listMonths() {
  const db = await getDB()
  const keys = await db.getAllKeys(STORE_NAME)
  return keys.sort().reverse()
}

export async function loadAllMonths() {
  const db = await getDB()
  const all = await db.getAll(STORE_NAME)
  const transactions = all.flatMap(record =>
    record.transactions.map(tx => ({ ...tx, date: new Date(tx.date) })))
  return transactions.sort((a, b) => b.date - a.date)
}

export async function deleteMonth(monthKey) {
  return withBudgetWrite(async () => {
    const db = await getDB()
    const transaction = db.transaction([STORE_NAME, OVERRIDE_STORE_NAME], 'readwrite')
    await Promise.all([
      transaction.objectStore(STORE_NAME).delete(monthKey),
      transaction.objectStore(OVERRIDE_STORE_NAME).delete(monthKey),
      transaction.done,
    ])
    emitBudgetChange('delete-month')
  })
}

export async function clearAll() {
  return withBudgetWrite(async () => {
    const db = await getDB()
    const transaction = db.transaction([STORE_NAME, OVERRIDE_STORE_NAME, MEMORY_STORE], 'readwrite')
    await Promise.all([
      transaction.objectStore(STORE_NAME).clear(),
      transaction.objectStore(OVERRIDE_STORE_NAME).clear(),
      transaction.objectStore(MEMORY_STORE).clear(),
      transaction.done,
    ])
    emitBudgetChange('clear')
  })
}

export async function saveOverrides(monthKey, overrides) {
  return withBudgetWrite(async () => {
    const db = await getDB()
    await db.put(OVERRIDE_STORE_NAME, { monthKey, overrides, updatedAt: new Date().toISOString() })
    emitBudgetChange('overrides')
  })
}

export async function loadOverrides(monthKey) {
  const db = await getDB()
  const record = await db.get(OVERRIDE_STORE_NAME, monthKey)
  return record?.overrides || {}
}

export async function loadAllOverrides() {
  const db = await getDB()
  const all = await db.getAll(OVERRIDE_STORE_NAME)
  const merged = {}
  for (const record of all) Object.assign(merged, record.overrides)
  return merged
}

export async function loadClassificationMemory() {
  const db = await getDB()
  const records = await db.getAll(MEMORY_STORE)
  return Object.fromEntries(records.map(record => [record.key, record]))
}

export async function rememberClassification(tx, classification) {
  return withBudgetWrite(async () => {
    const key = classificationMemoryKey(tx)
    if (!key) return null
    const db = await getDB()
    const existing = await db.get(MEMORY_STORE, key)
    const record = mergeMemoryRecord(existing, tx, classification)
    if (!record) return null
    await db.put(MEMORY_STORE, record)
    emitBudgetChange('classification-memory')
    return record
  })
}

export async function importClassificationMemory(analysis) {
  return withBudgetWrite(async () => {
    const db = await getDB()
    const existing = await loadClassificationMemory()
    const next = analysisRowsToMemoryRecords(analysis, existing)
    const records = Object.values(next)
    const transaction = db.transaction(MEMORY_STORE, 'readwrite')
    await Promise.all([...records.map(record => transaction.store.put(record)), transaction.done])
    emitBudgetChange('classification-memory')
    return next
  })
}

function validateMonthRecord(record) {
  if (!record || !/^\d{4}-\d{2}$/.test(record.monthKey || '') || !Array.isArray(record.transactions)) {
    throw new Error('备份中的月份数据格式不正确')
  }
  return {
    ...record,
    transactions: record.transactions.map(tx => {
      if (!tx || typeof tx !== 'object' || !String(tx.name || '').trim()) {
        throw new Error(`${record.monthKey} 中包含缺少名称的账单`)
      }
      const amount = Number(tx.amount)
      if (!Number.isFinite(amount)) throw new Error(`${record.monthKey} 中包含无效金额`)
      if (tx.netConsumption !== undefined && (!Number.isFinite(tx.netConsumption) || tx.netConsumption < 0)) throw new Error('净消费金额无效')
      if (tx.includeInConsumption !== undefined && typeof tx.includeInConsumption !== 'boolean') throw new Error('消费纳入标记无效')
      if (tx.cashflowImpact !== undefined && !Number.isFinite(tx.cashflowImpact)) throw new Error('现金流金额无效')
      return { ...tx, name: String(tx.name).trim(), amount, date: normalizeDate(tx.date) }
    }),
    updatedAt: record.updatedAt || new Date().toISOString(),
  }
}

function validateOverrideRecord(record) {
  if (!record || !/^\d{4}-\d{2}$/.test(record.monthKey || '') || !record.overrides || typeof record.overrides !== 'object' || Array.isArray(record.overrides)) {
    throw new Error('备份中的人工分类数据格式不正确')
  }
  return { ...record, updatedAt: record.updatedAt || new Date().toISOString() }
}

function validateMemoryRecord(record) {
  if (!record || !String(record.key || '').trim() || !record.catKey || !record.subKey) {
    throw new Error('备份中的分类学习记忆格式不正确')
  }
  return { ...record, key: String(record.key), tags: Array.isArray(record.tags) ? record.tags : [] }
}

async function readFullBackup() {
  const db = await getDB()
  const transaction = db.transaction([STORE_NAME, OVERRIDE_STORE_NAME, MEMORY_STORE], 'readonly')
  const [months, overrides, classificationMemory] = await Promise.all([
    transaction.objectStore(STORE_NAME).getAll(),
    transaction.objectStore(OVERRIDE_STORE_NAME).getAll(),
    transaction.objectStore(MEMORY_STORE).getAll(),
  ])
  await transaction.done
  return {
    format: BACKUP_FORMAT,
    schemaVersion: BACKUP_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    data: { months, overrides, classificationMemory },
    debtLedger: loadDebtLedger(),
    taxonomy: createTaxonomySnapshot(),
  }
}

export function createFullBackup() { return withBudgetWrite(readFullBackup) }
export const createCloudSnapshot = createFullBackup

export function validateBackupPayload(payload, { cloud = false } = {}) {
  const supportedVersion = payload?.schemaVersion === 1 || payload?.schemaVersion === BACKUP_SCHEMA_VERSION
  if (payload?.format !== BACKUP_FORMAT || !supportedVersion) {
    throw new Error('这不是受支持的月度账单完整备份')
  }
  if (!Array.isArray(payload.data?.months) || !Array.isArray(payload.data?.overrides)) {
    throw new Error('备份文件不完整')
  }

  const debtLedger = payload.debtLedger == null ? payload.debtLedger : validateDebtLedger(payload.debtLedger)
  const taxonomy = payload.taxonomy === undefined ? undefined : validateTaxonomySnapshot(payload.taxonomy)
  if (cloud && (taxonomy === undefined || debtLedger === undefined)) throw new Error('云端快照缺少债务或分类信息')
  const months = payload.data.months.map(validateMonthRecord)
  const overrides = payload.data.overrides.map(validateOverrideRecord)
  const classificationMemory = (payload.data.classificationMemory || []).map(validateMemoryRecord)
  const monthKeys = new Set(months.map(record => record.monthKey))
  if (monthKeys.size !== months.length) throw new Error('备份中存在重复月份')
  if (new Set(overrides.map(record => record.monthKey)).size !== overrides.length) throw new Error('备份中存在重复人工分类月份')
  if (new Set(classificationMemory.map(record => record.key)).size !== classificationMemory.length) throw new Error('备份中存在重复分类记忆')
  return { ...payload, data: { ...payload.data, months, overrides, classificationMemory }, debtLedger, taxonomy }
}

const browserMetadata = {
  readDebt: loadDebtLedger,
  readTaxonomy: createTaxonomySnapshot,
  writeDebt(value) {
    if (value === null) clearDebtLedger({ source: 'cloud', silent: true })
    else saveDebtLedger(value, { source: 'cloud', silent: true })
  },
  writeTaxonomy(value) { restoreTaxonomySnapshot(value, { source: 'cloud', silent: true }) },
}

// IDB cannot commit until we yield. Write synchronous browser metadata first,
// then await the transaction; either failure aborts IDB and restores changed metadata.
export async function commitRestoreTransaction(transaction, queueWrites, metadata, access = browserMetadata) {
  const completed = transaction.done
  completed.catch(() => {})
  const undo = []
  try {
    const previousDebt = metadata.debtLedger === undefined ? undefined : access.readDebt()
    const previousTaxonomy = metadata.taxonomy === undefined ? undefined : access.readTaxonomy()
    const written = Promise.all(queueWrites())
    written.catch(() => {})
    if (metadata.debtLedger !== undefined) {
      access.writeDebt(metadata.debtLedger)
      undo.push(() => access.writeDebt(previousDebt))
    }
    if (metadata.taxonomy !== undefined) {
      access.writeTaxonomy(metadata.taxonomy)
      undo.push(() => access.writeTaxonomy(previousTaxonomy))
    }
    await Promise.all([written, completed])
  } catch (error) {
    try { transaction.abort() } catch { /* already aborted */ }
    await completed.catch(() => {})
    const rollbackErrors = []
    for (const restore of undo.reverse()) {
      try { restore() } catch (rollbackError) { rollbackErrors.push(rollbackError) }
    }
    if (rollbackErrors.length) throw new AggregateError([error, ...rollbackErrors], '恢复未完成，浏览器拒绝还原部分设置；原账单已保留')
    throw error
  }
}

export function restoreFullBackup(payload) {
  const validated = validateBackupPayload(payload)
  return withBudgetWrite(() => duringCloudReplacement(async () => {
    const { data: { months, overrides, classificationMemory }, debtLedger, taxonomy } = validated
    const monthKeys = new Set(months.map(record => record.monthKey))

    const overrideByMonth = new Map(overrides.map(record => [record.monthKey, record]))
    const db = await getDB()
    const transaction = db.transaction([STORE_NAME, OVERRIDE_STORE_NAME, MEMORY_STORE], 'readwrite')
    const monthStore = transaction.objectStore(STORE_NAME)
    const overrideStore = transaction.objectStore(OVERRIDE_STORE_NAME)
    const memoryStore = transaction.objectStore(MEMORY_STORE)
    await commitRestoreTransaction(transaction, () => {
      const requests = months.map(record => monthStore.put(record))
      for (const monthKey of monthKeys) {
        const overrideRecord = overrideByMonth.get(monthKey)
        requests.push(overrideRecord ? overrideStore.put(overrideRecord) : overrideStore.delete(monthKey))
      }
      for (const record of overrides) {
        if (!monthKeys.has(record.monthKey)) requests.push(overrideStore.put(record))
      }
      for (const record of classificationMemory) requests.push(memoryStore.put(record))
      return requests
    }, { debtLedger, taxonomy })
    emitBudgetChange('import')
    return {
      monthCount: months.length,
      transactionCount: months.reduce((sum, record) => sum + record.transactions.length, 0),
      memoryCount: classificationMemory.length,
    }
  }))
}

export async function loadSyncCheckpoint() {
  const db = await getDB()
  return (await db.get(SYNC_STORE, 'checkpoint'))?.value || null
}

export async function saveSyncCheckpoint(value) {
  const db = await getDB()
  await db.put(SYNC_STORE, { key: 'checkpoint', value })
}

function backupId() {
  return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export async function saveConflictBackups({ local, cloud, cloudRevision, reason = 'conflict' }) {
  const db = await getDB()
  const id = backupId()
  // Both complete copies are stored together. A quota/transaction failure stops replacement.
  await db.put(SYNC_STORE, { key: `backup:${id}`, id, createdAt: new Date().toISOString(), local, cloud, cloudRevision, reason })
  return id
}

export async function getConflictBackup(id) {
  const db = await getDB()
  return await db.get(SYNC_STORE, `backup:${id}`) || null
}

export async function listConflictBackups() {
  const db = await getDB()
  const records = await db.getAll(SYNC_STORE)
  return records.filter(record => record.key.startsWith('backup:')).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

// Only cloud restoration replaces the whole database. File imports above retain merge semantics.
export function replaceCloudSnapshot(payload, { shouldApply = () => true, expectedSnapshot } = {}) {
  const validated = validateBackupPayload(payload, { cloud: true })
  return withBudgetWrite(async () => {
    const db = await getDB()
    if (!shouldApply()) throw Object.assign(new Error('本机账本已变化，请重新选择版本'), { code: 'LOCAL_CHANGED' })
    return duringCloudReplacement(async () => {
      const transaction = db.transaction([STORE_NAME, OVERRIDE_STORE_NAME, MEMORY_STORE], 'readwrite')
      const completed = transaction.done
      completed.catch(() => {})
      try {
        if (expectedSnapshot) {
          // Read again while holding the IDB write transaction. This catches another tab's
          // committed edit even if its BroadcastChannel message has not arrived yet.
          const [months, overrides, classificationMemory] = await Promise.all([
            transaction.objectStore(STORE_NAME).getAll(),
            transaction.objectStore(OVERRIDE_STORE_NAME).getAll(),
            transaction.objectStore(MEMORY_STORE).getAll(),
          ])
          const sameData = JSON.stringify({ months, overrides, classificationMemory }) === JSON.stringify(expectedSnapshot.data)
          const sameDebt = JSON.stringify(loadDebtLedger()) === JSON.stringify(expectedSnapshot.debtLedger)
          const sameTaxonomy = JSON.stringify(createTaxonomySnapshot()) === JSON.stringify(expectedSnapshot.taxonomy)
          if (!sameData || !sameDebt || !sameTaxonomy || !shouldApply()) throw Object.assign(new Error('本机账本已变化，请重新选择版本'), { code: 'LOCAL_CHANGED' })
        }
        await commitRestoreTransaction(transaction, () => {
          const requests = []
          for (const [name, records] of [[STORE_NAME, validated.data.months], [OVERRIDE_STORE_NAME, validated.data.overrides], [MEMORY_STORE, validated.data.classificationMemory]]) {
            const target = transaction.objectStore(name)
            requests.push(target.clear(), ...records.map(record => target.put(record)))
          }
          return requests
        }, validated)
      } catch (error) {
        try { transaction.abort() } catch { /* already aborted */ }
        await completed.catch(() => {})
        throw error
      }
      emitBudgetChange('replace', 'cloud')
      notifyCloudApplied()
      return { monthCount: validated.data.months.length, transactionCount: validated.data.months.reduce((sum, month) => sum + month.transactions.length, 0) }
    })
  })
}

export { createDefaultTaxonomySnapshot }
