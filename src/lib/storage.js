import { openDB } from 'idb'
import { analysisRowsToMemoryRecords, classificationMemoryKey, mergeMemoryRecord } from './classification-memory.js'

const DB_NAME = 'budget-app'
const DB_VERSION = 3
const STORE_NAME = 'monthly-data'
const OVERRIDE_STORE_NAME = 'overrides'
const MEMORY_STORE = 'classification-memory'

export const BACKUP_FORMAT = 'budget-app-backup'
export const BACKUP_SCHEMA_VERSION = 2

async function getDB() {
  return openDB(DB_NAME, DB_VERSION, {
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
    },
  })
}

function normalizeDate(value) {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) throw new Error('账单中包含无效日期')
  return date.toISOString()
}

export async function saveMonth(monthKey, transactions) {
  const db = await getDB()
  const serialized = transactions.map(tx => ({ ...tx, date: normalizeDate(tx.date) }))
  await db.put(STORE_NAME, { monthKey, transactions: serialized, updatedAt: new Date().toISOString() })
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
  const db = await getDB()
  const transaction = db.transaction([STORE_NAME, OVERRIDE_STORE_NAME], 'readwrite')
  await Promise.all([
    transaction.objectStore(STORE_NAME).delete(monthKey),
    transaction.objectStore(OVERRIDE_STORE_NAME).delete(monthKey),
    transaction.done,
  ])
}

export async function clearAll() {
  const db = await getDB()
  const transaction = db.transaction([STORE_NAME, OVERRIDE_STORE_NAME, MEMORY_STORE], 'readwrite')
  await Promise.all([
    transaction.objectStore(STORE_NAME).clear(),
    transaction.objectStore(OVERRIDE_STORE_NAME).clear(),
    transaction.objectStore(MEMORY_STORE).clear(),
    transaction.done,
  ])
}

export async function saveOverrides(monthKey, overrides) {
  const db = await getDB()
  await db.put(OVERRIDE_STORE_NAME, { monthKey, overrides, updatedAt: new Date().toISOString() })
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
  const key = classificationMemoryKey(tx)
  if (!key) return null
  const db = await getDB()
  const existing = await db.get(MEMORY_STORE, key)
  const record = mergeMemoryRecord(existing, tx, classification)
  if (!record) return null
  await db.put(MEMORY_STORE, record)
  return record
}

export async function importClassificationMemory(analysis) {
  const db = await getDB()
  const existing = await loadClassificationMemory()
  const next = analysisRowsToMemoryRecords(analysis, existing)
  const records = Object.values(next)
  const transaction = db.transaction(MEMORY_STORE, 'readwrite')
  await Promise.all([...records.map(record => transaction.store.put(record)), transaction.done])
  return next
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

export async function createFullBackup() {
  const db = await getDB()
  const [months, overrides, classificationMemory] = await Promise.all([
    db.getAll(STORE_NAME),
    db.getAll(OVERRIDE_STORE_NAME),
    db.getAll(MEMORY_STORE),
  ])
  return {
    format: BACKUP_FORMAT,
    schemaVersion: BACKUP_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    data: { months, overrides, classificationMemory },
  }
}

export async function restoreFullBackup(payload) {
  const supportedVersion = payload?.schemaVersion === 1 || payload?.schemaVersion === BACKUP_SCHEMA_VERSION
  if (payload?.format !== BACKUP_FORMAT || !supportedVersion) {
    throw new Error('这不是受支持的月度账单完整备份')
  }
  if (!Array.isArray(payload.data?.months) || !Array.isArray(payload.data?.overrides)) {
    throw new Error('备份文件不完整')
  }

  const months = payload.data.months.map(validateMonthRecord)
  const overrides = payload.data.overrides.map(validateOverrideRecord)
  const classificationMemory = (payload.data.classificationMemory || []).map(validateMemoryRecord)
  const monthKeys = new Set(months.map(record => record.monthKey))
  if (monthKeys.size !== months.length) throw new Error('备份中存在重复月份')

  const overrideByMonth = new Map(overrides.map(record => [record.monthKey, record]))
  const db = await getDB()
  const transaction = db.transaction([STORE_NAME, OVERRIDE_STORE_NAME, MEMORY_STORE], 'readwrite')
  const monthStore = transaction.objectStore(STORE_NAME)
  const overrideStore = transaction.objectStore(OVERRIDE_STORE_NAME)
  const memoryStore = transaction.objectStore(MEMORY_STORE)
  const requests = months.map(record => monthStore.put(record))

  for (const monthKey of monthKeys) {
    const overrideRecord = overrideByMonth.get(monthKey)
    requests.push(overrideRecord ? overrideStore.put(overrideRecord) : overrideStore.delete(monthKey))
  }
  for (const record of overrides) {
    if (!monthKeys.has(record.monthKey)) requests.push(overrideStore.put(record))
  }
  for (const record of classificationMemory) requests.push(memoryStore.put(record))

  await Promise.all([...requests, transaction.done])
  return {
    monthCount: months.length,
    transactionCount: months.reduce((sum, record) => sum + record.transactions.length, 0),
    memoryCount: classificationMemory.length,
  }
}
