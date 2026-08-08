// Privacy-safe patterns distilled from manual corrections. Exact merchant/person
// memories belong in IndexedDB and are intentionally never committed.
export const PERSONAL_CLASSIFICATION_RULES = [
  {
    id: 'red-packet-before-bag-keyword',
    keywords: ['红包'],
    result: { catKey: 'social', subKey: 'red_packet', tags: ['social'] },
  },
  {
    id: 'online-grocery',
    keywords: ['七鲜', '精品超市', '百佳超市'],
    result: { catKey: 'daily', subKey: 'online_grocery', tags: ['rigid'] },
  },
  {
    id: 'outdoor-experience',
    keywords: ['攀岩', '潜水'],
    flowTypes: ['expense'],
    result: { catKey: 'sport', subKey: 'outdoor', tags: ['emotion', 'entertainment'] },
  },
  {
    id: 'shared-bike-pay-later',
    keywords: ['先骑后付'],
    flowTypes: ['expense'],
    result: { catKey: 'transport', subKey: 'bike', tags: ['rigid', 'fixed'] },
  },
  {
    id: 'camera-for-image',
    keywords: ['ccd', 'gr3x', '佳能g12', '相机租'],
    flowTypes: ['expense'],
    result: { catKey: 'fashion', subKey: 'camera', tags: ['career_img', 'elastic', 'emotion'] },
  },
  {
    id: 'beverage-treat',
    keywords: ['可口可乐', '茉莉奶白'],
    flowTypes: ['expense'],
    result: { catKey: 'food', subKey: 'coffee', tags: ['elastic', 'emotion'] },
  },
  {
    id: 'body-jewelry',
    keywords: ['舌钉', '舌环'],
    flowTypes: ['expense'],
    result: { catKey: 'fashion', subKey: 'accessories', tags: ['career_img', 'elastic', 'emotion'] },
  },
  {
    id: 'rent-is-fixed',
    keywords: ['房租'],
    flowTypes: ['expense'],
    result: { catKey: 'housing', subKey: 'rent', tags: ['rigid', 'fixed'] },
  },
  {
    id: 'social-meal',
    keywords: ['聚餐'],
    flowTypes: ['expense'],
    result: { catKey: 'food', subKey: 'gathering', tags: ['social', 'elastic', 'entertainment'] },
  },
  {
    id: 'ai-as-growth',
    keywords: ['chatgpt', 'openai', 'claude'],
    result: { catKey: 'digital', subKey: 'ai_tools', tags: ['long_invest', 'growth'] },
  },
]

export function matchPersonalPolicy(tx) {
  const text = String(tx?.name || '').normalize('NFKC').toLowerCase()
  const flowType = tx?.flowType || 'expense'
  for (const rule of PERSONAL_CLASSIFICATION_RULES) {
    if (rule.flowTypes && !rule.flowTypes.includes(flowType)) continue
    if (rule.keywords.some(keyword => text.includes(keyword.toLowerCase()))) {
      return { ...rule.result, ruleId: rule.id }
    }
  }
  return null
}
