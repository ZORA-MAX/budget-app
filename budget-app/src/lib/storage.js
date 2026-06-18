import { openDB } from 'idb'

const DB_NAME = 'budget-app'
const DB_VERSION = 2
const STORE_NAME = 'monthly-data'

async function getDB() {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'monthKey' })
      }
      if (!db.objectStoreNames.contains('overrides')) {
        db.createObjectStore('overrides', { keyPath: 'monthKey' })
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
    date: tx.date.toISOString(),
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
  await db.delete(STORE_NAME, monthKey)
}

/**
 * Clear all data.
 */
export async function clearAll() {
  const db = await getDB()
  await db.clear(STORE_NAME)
}

/**
 * Save category overrides for a month.
 * @param {string} monthKey - e.g. '2025-01'
 * @param {Object} overrides - map of txKey → { catKey, subKey }
 */
export async function saveOverrides(monthKey, overrides) {
  const db = await getDB()
  await db.put('overrides', { monthKey, overrides, updatedAt: new Date().toISOString() })
}

/**
 * Load category overrides for a month.
 */
export async function loadOverrides(monthKey) {
  const db = await getDB()
  const record = await db.get('overrides', monthKey)
  return record?.overrides || {}
}

/**
 * Load all overrides merged.
 */
export async function loadAllOverrides() {
  const db = await getDB()
  const all = await db.getAll('overrides')
  const merged = {}
  for (const record of all) {
    Object.assign(merged, record.overrides)
  }
  return merged
}
