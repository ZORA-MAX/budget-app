const NOISE_PATTERNS = [
  /商户订单号[:：]?\s*[a-z0-9-]+/gi,
  /(?:交易|订单)号[:：]?\s*[a-z0-9-]+/gi,
  /\b\d{12,}\b/g,
  /收款方备注[:：]?\s*/gi,
  /(?:二维码|扫码)收款/gi,
  /转账备注[:：]?\s*微信转账/gi,
  /微信支付/gi,
]

export function normalizeMemoryName(name = '') {
  let normalized = String(name).normalize('NFKC').toLowerCase()
  for (const pattern of NOISE_PATTERNS) normalized = normalized.replace(pattern, ' ')
  return normalized
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function classificationMemoryKey(tx) {
  const name = normalizeMemoryName(tx?.name)
  if (name.length < 2) return ''
  return `${tx?.flowType || 'expense'}|${name}`
}

export function recallClassification(tx, memory = {}) {
  const key = classificationMemoryKey(tx)
  return key ? memory[key] || null : null
}

export function mergeMemoryRecord(existing, tx, classification, learnedAt = new Date().toISOString()) {
  const key = classificationMemoryKey(tx)
  if (!key || !classification?.catKey || !classification?.subKey) return null
  return {
    key,
    catKey: classification.catKey,
    subKey: classification.subKey,
    tags: [...new Set(classification.tags || [])],
    count: (existing?.count || 0) + 1,
    firstLearnedAt: existing?.firstLearnedAt || learnedAt,
    lastLearnedAt: learnedAt,
  }
}

export function analysisRowsToMemoryRecords(analysis, existingMemory = {}) {
  const rows = Array.isArray(analysis?.transactions)
    ? analysis.transactions.filter(tx => tx?.edited)
    : []
  const memory = { ...existingMemory }

  // Exported rows are newest-first. Replay oldest-first so the latest correction wins.
  for (const tx of [...rows].reverse()) {
    const key = classificationMemoryKey(tx)
    if (!key) continue
    const record = mergeMemoryRecord(memory[key], tx, {
      catKey: tx.category?.key,
      subKey: tx.subcategory?.key,
      tags: (tx.tags || []).map(tag => typeof tag === 'string' ? tag : tag.key).filter(Boolean),
    }, tx.date ? `${tx.date}T00:00:00.000Z` : undefined)
    if (record) memory[key] = record
  }

  return memory
}
