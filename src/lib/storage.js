import { openDB } from 'idb'

const DB_NAME = 'budget-app'
// Version 3 was already used by an earlier deployed build. Opening it with a
// lower number throws VersionError and makes the entire History page unusable.
const DB_VERSION = 3
const STORE_NAME = 'monthly-data'
const OVERRIDE_STORE_NAME = 'overrides'

export const BACKUP_FORMAT = 'budget-app-backup'
export const BACKUP_SCHEMA_VERSION = 1

async function getDB() {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'monthKey' })
      }
      if (!db.objectStoreNames.contains(OVERRIDE_STORE_NAME)) {
        db.createObjectStore(OVERRIDE_STORE_NAME, { keyPath: 'monthKey' })
      }
    },
  })
}

/**
 * Save a month's transactions.
 * @param {string} monthKey - e.g. '2025-01'
 * @param {Array} transactions - array of { date, name, amount, source }
 */
export async function saveMonth(monthKey, transactions) {
  const db = await getDB()
  // Serialize dates to ISO strings for storage
  const serialized = transactions.map(tx => ({
    ...tx,
    date: normalizeDate(tx.date),
  }))
  await db.put(STORE_NAME, { monthKey, transactions: serialized, updatedAt: new Date().toISOString() })
}

/**
 * Load a month's transactions.
 * @returns {Array|null}
 */
export async function loadMonth(monthKey) {
  const db = await getDB()
  const record = await db.get(STORE_NAME, monthKey)
  if (!record) return null
  // Deserialize dates
  return record.transactions.map(tx => ({
    ...tx,
    date: new Date(tx.date),
  }))
}

/**
 * Get all saved month keys, sorted descending.
 */
export async function listMonths() {
  const db = await getDB()
  const keys = await db.getAllKeys(STORE_NAME)
  return keys.sort().reverse()
}

/**
 * Load all months' transactions merged.
 */
export async function loadAllMonths() {
  const db = await getDB()
  const all = await db.getAll(STORE_NAME)
  const txs = []
  for (const record of all) {
    for (const tx of record.transactions) {
      txs.push({ ...tx, date: new Date(tx.date) })
    }
  }
  return txs.sort((a, b) => b.date - a.date)
}

/**
 * Delete a month's data.
 */
export async function deleteMonth(monthKey) {
  const db = await getDB()
  const tx = db.transaction([STORE_NAME, OVERRIDE_STORE_NAME], 'readwrite')
  await Promise.all([
    tx.objectStore(STORE_NAME).delete(monthKey),
    tx.objectStore(OVERRIDE_STORE_NAME).delete(monthKey),
    tx.done,
  ])
}

/**
 * Clear all data.
 */
export async function clearAll() {
  const db = await getDB()
  const tx = db.transaction([STORE_NAME, OVERRIDE_STORE_NAME], 'readwrite')
  await Promise.all([
    tx.objectStore(STORE_NAME).clear(),
    tx.objectStore(OVERRIDE_STORE_NAME).clear(),
    tx.done,
  ])
}

/**
 * Save category overrides for a month.
 * @param {string} monthKey - e.g. '2025-01'
 * @param {Object} overrides - map of txKey → { catKey, subKey }
 */
export async function saveOverrides(monthKey, overrides) {
  const db = await getDB()
  await db.put(OVERRIDE_STORE_NAME, { monthKey, overrides, updatedAt: new Date().toISOString() })
}

/**
 * Load category overrides for a month.
 */
export async function loadOverrides(monthKey) {
  const db = await getDB()
  const record = await db.get(OVERRIDE_STORE_NAME, monthKey)
  return record?.overrides || {}
}

/**
 * Load all overrides merged.
 */
export async function loadAllOverrides() {
  const db = await getDB()
  const all = await db.getAll(OVERRIDE_STORE_NAME)
  const merged = {}
  for (const record of all) {
    Object.assign(merged, record.overrides)
  }
  return merged
}

function normalizeDate(value) {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) throw new Error('账单中包含无效日期')
  return date.toISOString()
}

function validateMonthRecord(record) {
  if (!record || !/^\d{4}-\d{2}$/.test(record.monthKey || '') || !Array.isArray(record.transactions)) {
    throw new Error('备份中的月份数据格式不正确')
  }

  const transactions = record.transactions.map(tx => {
    if (!tx || typeof tx !== 'object' || !String(tx.name || '').trim()) {
      throw new Error(`${record.monthKey} 中包含缺少名称的账单`)
    }
    const amount = Number(tx.amount)
    if (!Number.isFinite(amount)) throw new Error(`${record.monthKey} 中包含无效金额`)
    return { ...tx, name: String(tx.name).trim(), amount, date: normalizeDate(tx.date) }
  })

  return {
    ...record,
    monthKey: record.monthKey,
    transactions,
    updatedAt: record.updatedAt || new Date().toISOString(),
  }
}

function validateOverrideRecord(record) {
  if (!record || !/^\d{4}-\d{2}$/.test(record.monthKey || '') || !record.overrides || typeof record.overrides !== 'object' || Array.isArray(record.overrides)) {
    throw new Error('备份中的人工分类数据格式不正确')
  }
  return {
    ...record,
    monthKey: record.monthKey,
    overrides: record.overrides,
    updatedAt: record.updatedAt || new Date().toISOString(),
  }
}

/**
 * Build a restorable, versioned backup containing every stored transaction
 * field and all manual category overrides.
 */
export async function createFullBackup() {
  const db = await getDB()
  const [months, overrides] = await Promise.all([
    db.getAll(STORE_NAME),
    db.getAll(OVERRIDE_STORE_NAME),
  ])

  return {
    format: BACKUP_FORMAT,
    schemaVersion: BACKUP_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    data: { months, overrides },
  }
}

/**
 * Restore a backup by replacing months present in the file while preserving
 * other local months. The write is committed as one IndexedDB transaction.
 */
export async function restoreFullBackup(payload) {
  if (payload?.format !== BACKUP_FORMAT || payload?.schemaVersion !== BACKUP_SCHEMA_VERSION) {
    throw new Error('这不是受支持的月度账单完整备份')
  }
  if (!Array.isArray(payload.data?.months) || !Array.isArray(payload.data?.overrides)) {
    throw new Error('备份文件不完整')
  }

  const months = payload.data.months.map(validateMonthRecord)
  const overrides = payload.data.overrides.map(validateOverrideRecord)
  const monthKeys = new Set(months.map(record => record.monthKey))
  if (monthKeys.size !== months.length) throw new Error('备份中存在重复月份')

  const overrideByMonth = new Map(overrides.map(record => [record.monthKey, record]))
  const db = await getDB()
  const tx = db.transaction([STORE_NAME, OVERRIDE_STORE_NAME], 'readwrite')
  const monthStore = tx.objectStore(STORE_NAME)
  const overrideStore = tx.objectStore(OVERRIDE_STORE_NAME)
  const requests = months.map(record => monthStore.put(record))

  for (const monthKey of monthKeys) {
    const overrideRecord = overrideByMonth.get(monthKey)
    requests.push(overrideRecord ? overrideStore.put(overrideRecord) : overrideStore.delete(monthKey))
  }
  for (const record of overrides) {
    if (!monthKeys.has(record.monthKey)) requests.push(overrideStore.put(record))
  }

  await Promise.all([...requests, tx.done])
  return {
    monthCount: months.length,
    transactionCount: months.reduce((sum, record) => sum + record.transactions.length, 0),
  }
}
