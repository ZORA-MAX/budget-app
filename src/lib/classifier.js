import { CATEGORIES } from './categories'

// Map cashbook's original categories to our category keys
const CASHBOOK_CAT_MAP = {
  '餐饮': 'food', '美食': 'food',
  '交通': 'transport', '出行': 'transport',
  '转账': 'transfer',
  '酒店旅行': 'travel', '旅行': 'travel', '住宿': 'travel',
  '生活服务': 'housing', '生活缴费': 'housing', '缴费': 'housing',
  '购物': 'daily', '日用': 'daily', '超市': 'daily',
  '服饰美容': 'fashion', '美容': 'fashion',
  '数码': 'digital', '通讯': 'digital',
  '医疗': 'health', '医疗健康': 'health',
  '运动': 'sport', '健身': 'sport',
  '娱乐': 'entertain', '游戏': 'entertain', '休闲': 'entertain',
  '教育': 'education', '学习': 'education',
  '人情': 'social', '红包': 'social',
  '办公': 'career',
}

export function classify(name, originalCategory) {
  if (!name && !originalCategory) return { catKey: 'other', subKey: 'unknown' }
  const n = (name || '').toLowerCase()

  // First try keyword matching (most precise)
  for (const cat of CATEGORIES) {
    for (const sub of cat.subs) {
      if (sub.keywords.some(k => n.includes(k.toLowerCase()))) {
        return { catKey: cat.key, subKey: sub.key }
      }
    }
  }

  // Fallback: use cashbook's original category
  if (originalCategory) {
    const mapped = CASHBOOK_CAT_MAP[originalCategory]
    if (mapped) {
      const cat = CATEGORIES.find(c => c.key === mapped)
      if (cat) return { catKey: cat.key, subKey: cat.subs[0]?.key || '' }
    }
  }

  return { catKey: 'other', subKey: 'unknown' }
}

export function summarizeByCategory(transactions, overrides = {}) {
  const map = {}
  for (const tx of transactions) {
    const key = `${tx.date.toISOString()}_${tx.amount}_${tx.name}`
    const override = overrides[key]
    const { catKey, subKey } = override || classify(tx.name, tx.originalCategory)

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
    .map(item => ({ ...item, subs: Object.values(item.subMap).sort((a, b) => b.total - a.total) }))
    .sort((a, b) => b.total - a.total)
}
