import { CATEGORIES } from './categories'

/**
 * Classify a transaction by merchant name.
 * Returns { catKey, subKey } — the matched category and subcategory keys.
 */
export function classify(name) {
  if (!name) return { catKey: 'other', subKey: 'misc' }
  const n = name.toLowerCase()

  for (const cat of CATEGORIES) {
    for (const sub of cat.subs) {
      if (sub.keywords.some(k => n.includes(k.toLowerCase()))) {
        return { catKey: cat.key, subKey: sub.key }
      }
    }
  }
  return { catKey: 'other', subKey: 'misc' }
}

/**
 * Classify and summarize a list of transactions.
 * @param {Array} transactions
 * @param {Object} overrides - map of txKey → { catKey, subKey }
 * Returns array of { cat, total, count, subs: [{ sub, total, count }] }
 * sorted by total descending.
 */
export function summarizeByCategory(transactions, overrides = {}) {
  const map = {}

  for (const tx of transactions) {
    const key = `${tx.date.toISOString()}_${tx.amount}_${tx.name}`
    const override = overrides[key]
    const { catKey, subKey } = override || classify(tx.name)

    if (!map[catKey]) {
      const cat = CATEGORIES.find(c => c.key === catKey) || CATEGORIES.at(-1)
      map[catKey] = { cat, total: 0, count: 0, subMap: {} }
    }
    map[catKey].total += tx.amount
    map[catKey].count += 1

    if (!map[catKey].subMap[subKey]) {
      const sub = map[catKey].cat.subs.find(s => s.key === subKey) || { key: subKey, label: '其他' }
      map[catKey].subMap[subKey] = { sub, total: 0, count: 0 }
    }
    map[catKey].subMap[subKey].total += tx.amount
    map[catKey].subMap[subKey].count += 1
  }

  return Object.values(map)
    .map(item => ({
      ...item,
      subs: Object.values(item.subMap).sort((a, b) => b.total - a.total),
    }))
    .sort((a, b) => b.total - a.total)
}
