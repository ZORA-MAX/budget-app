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
    const rule = rules.find(candidate => candidate.matches(tx.name))
    if (!rule) {
      passthrough.push(tx)
      continue
    }

    const key = `${rule.id}|${monthKey(tx.date)}`
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
        label: rule.label,
        description: rule.description,
        count: details.length,
        details,
        classification: rule.classification,
      },
    }
  })

  return [...passthrough, ...merged].sort((a, b) => b.date - a.date)
}
