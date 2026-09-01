export const DEFAULT_TRANSACTION_MERGE_MEMORIES = [
  {
    id: 'suzhou-commute-auto-recharge',
    label: '苏州地铁通勤自动充值',
    canonicalName: '交通',
    description: '名称同时包含“苏州”和“小程序自动充值”的交易',
    matches: name => {
      const text = String(name || '').normalize('NFKC').replace(/\s+/g, '').toLowerCase()
      return text.includes('苏州') && text.includes('小程序自动充值')
    },
    classification: {
      catKey: 'transport',
      subKey: 'metro_bus',
      tags: ['rigid', 'fixed', 'efficiency'],
    },
  },
  {
    id: 'meituan-bike-pay-later',
    label: '美团共享单车先骑后付',
    groupId: 'shared-bike-travel',
    groupLabel: '共享单车出行',
    canonicalName: '交通',
    description: '名称同时包含“美团”和“先骑后付”的交易（金额不限）',
    matches: name => {
      const text = String(name || '').normalize('NFKC').replace(/\s+/g, '').toLowerCase()
      return text.includes('美团') && text.includes('先骑后付')
    },
    classification: {
      catKey: 'transport',
      subKey: 'bike',
      tags: ['rigid', 'fixed', 'efficiency'],
    },
  },
  {
    id: 'hello-bike-rides',
    label: '哈啰骑行',
    groupId: 'shared-bike-travel',
    groupLabel: '共享单车出行',
    canonicalName: '交通',
    description: '名称包含“哈啰”，并带有“骑行”“单车”或“助力车”的交易（金额不限）',
    matches: name => {
      const text = String(name || '').normalize('NFKC').replace(/\s+/g, '').toLowerCase()
      return text.includes('哈啰') && ['骑行', '单车', '助力车'].some(keyword => text.includes(keyword))
    },
    classification: {
      catKey: 'transport',
      subKey: 'bike',
      tags: ['rigid', 'fixed', 'efficiency'],
    },
  },
  {
    id: 'amap-taxi-rides',
    label: '高德打车',
    groupId: 'amap-taxi-travel',
    groupLabel: '高德打车出行',
    canonicalName: '交通',
    description: '名称、商家、商品或原分类中同时可识别“高德”和“打车”的交易（金额不限）',
    matches: (name, transaction) => {
      const text = [
        name,
        transaction?.merchant,
        transaction?.productName,
        transaction?.originalCategory,
        transaction?.details,
      ].map(value => String(value || '')).join('')
        .normalize('NFKC')
        .replace(/\s+/g, '')
        .toLowerCase()
      return text.includes('高德') && text.includes('打车')
    },
    classification: {
      catKey: 'transport',
      subKey: 'taxi',
      tags: ['rigid', 'efficiency'],
    },
  },
]

function monthKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

function roundCurrency(amount) {
  return Math.round((amount + Number.EPSILON) * 100) / 100
}

function localDateString(date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-')
}

function detailFromTransaction(tx) {
  return {
    date: localDateString(tx.date),
    amount: tx.amount,
    name: tx.name,
    source: tx.source,
  }
}

export function applyTransactionMergeMemory(transactions, rules = DEFAULT_TRANSACTION_MERGE_MEMORIES) {
  const passthrough = []
  const buckets = new Map()

  for (const tx of transactions) {
    if (tx.direction && tx.direction !== 'expense') {
      passthrough.push(tx)
      continue
    }
    const rule = rules.find(candidate => candidate.matches(tx.name, tx))
    if (!rule) {
      passthrough.push(tx)
      continue
    }

    const key = `${rule.groupId || rule.id}|${monthKey(tx.date)}`
    const existing = buckets.get(key) || { rule, transactions: [] }
    existing.transactions.push(tx)
    buckets.set(key, existing)
  }

  const merged = [...buckets.values()].map(({ rule, transactions: matched }) => {
    const details = matched
      .slice()
      .sort((a, b) => b.date - a.date)
      .map(detailFromTransaction)
    const latestDate = new Date(Math.max(...matched.map(tx => tx.date.getTime())))
    const amount = roundCurrency(matched.reduce((sum, tx) => sum + tx.amount, 0))

    return {
      date: latestDate,
      name: rule.canonicalName,
      amount,
      source: 'merged-memory',
      originalCategory: '交通',
      mergeMemory: {
        ruleId: rule.id,
        label: rule.groupLabel || rule.label,
        description: rule.description,
        count: details.length,
        details,
        classification: rule.classification,
      },
    }
  })

  return [...passthrough, ...merged].sort((a, b) => b.date - a.date)
}
