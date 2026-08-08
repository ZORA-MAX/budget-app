const MAX_MATCH_HOURS = 72
const AMOUNT_TOLERANCE = 0.01
const VAGUE_PRODUCT_PATTERN = /^(拼多多|淘宝|天猫|京东|美团|微信|支付宝)?\s*(先用后付|平台商户|商户消费|消费|付款|支付|订单|商品|购物|代扣|交易)?$/i

function normalizeText(value) {
  return String(value || '').normalize('NFKC').replace(/\s+/g, '').toLowerCase()
}

function parseReceiptDate(value) {
  if (value instanceof Date) return value
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function meaningfulProduct(value) {
  const text = String(value || '').trim()
  return text.length >= 2 && !VAGUE_PRODUCT_PATTERN.test(text)
}

export function chooseDetailedProduct(receipt) {
  const itemNames = (receipt.itemNames || []).map(item => String(item || '').trim()).filter(meaningfulProduct)
  if (itemNames.length > 0) return [...new Set(itemNames)].join('、')
  return meaningfulProduct(receipt.productName) ? String(receipt.productName).trim() : ''
}

function platformAlignment(tx, receipt) {
  const haystack = normalizeText([
    tx.source,
    tx.platform,
    tx.merchant,
    tx.name,
    tx.productName,
    tx.details,
    tx.paymentMethod,
  ].join(' '))
  const needles = [receipt.platform, receipt.merchant].map(normalizeText).filter(value => value.length >= 2)
  return needles.some(value => haystack.includes(value))
}

function matchScore(tx, receipt) {
  const receiptDate = parseReceiptDate(receipt.date)
  if (!receiptDate || !(tx.date instanceof Date)) return null
  if (Math.abs((Number(tx.amount) || 0) - (Number(receipt.amount) || 0)) > AMOUNT_TOLERANCE) return null
  const hours = Math.abs(tx.date.getTime() - receiptDate.getTime()) / 36e5
  if (hours > MAX_MATCH_HOURS) return null
  const direction = receipt.direction || 'expense'
  if ((tx.direction || 'expense') !== direction) return null

  const orderMatch = receipt.orderId && tx.orderId && normalizeText(receipt.orderId) === normalizeText(tx.orderId)
  const aligned = platformAlignment(tx, receipt)
  if (!orderMatch && !aligned) return null

  let score = 50
  score += hours <= 6 ? 25 : hours <= 24 ? 20 : 10
  if (aligned) score += 15
  if (orderMatch) score += 30
  return { score, hours, orderMatch, aligned }
}

export function normalizeReceiptTransactions(transactions, screenshotFile) {
  return (transactions || []).flatMap((receipt, index) => {
    const date = parseReceiptDate(receipt.date)
    const amount = Number(receipt.amount)
    if (!date || !Number.isFinite(amount) || amount <= 0) return []
    const productName = chooseDetailedProduct(receipt)
    const merchant = String(receipt.merchant || '').trim()
    const platform = String(receipt.platform || '').trim()
    return [{
      ...receipt,
      id: `${screenshotFile}-${index}`,
      date,
      amount,
      direction: receipt.direction || 'expense',
      merchant,
      platform,
      productName,
      itemNames: receipt.itemNames || [],
      screenshotFile,
    }]
  })
}

function receiptAsTransaction(receipt) {
  const productName = chooseDetailedProduct(receipt)
  const merchant = receipt.merchant || receipt.platform || '截图记录'
  return {
    date: receipt.date,
    name: [merchant, productName].filter(Boolean).join(' '),
    merchant,
    productName,
    details: receipt.rawText || '',
    amount: receipt.amount,
    signedAmount: receipt.direction === 'expense' ? -receipt.amount : receipt.amount,
    direction: receipt.direction,
    status: receipt.status || '截图识别',
    isEffective: true,
    source: 'screenshot',
    platform: receipt.platform || '',
    paymentMethod: receipt.paymentMethod || '',
    transactionId: receipt.transactionId || '',
    orderId: receipt.orderId || '',
    screenshotFile: receipt.screenshotFile,
    screenshotConfidence: receipt.confidence ?? null,
    itemNames: receipt.itemNames || [],
    rawFields: receipt,
    receiptMatch: { status: 'unmatched', score: 0 },
  }
}

export function reconcileReceiptTransactions(billTransactions, receiptTransactions) {
  const enriched = billTransactions.map(tx => ({ ...tx }))
  const usedBillIndexes = new Set()
  const matches = []
  const unmatchedReceipts = []

  for (const receipt of receiptTransactions) {
    let best = null
    for (let index = 0; index < enriched.length; index += 1) {
      if (usedBillIndexes.has(index)) continue
      const result = matchScore(enriched[index], receipt)
      if (!result || (best && result.score <= best.result.score)) continue
      best = { index, result }
    }

    if (!best || best.result.score < 75) {
      unmatchedReceipts.push(receipt)
      continue
    }

    const tx = enriched[best.index]
    const productName = chooseDetailedProduct(receipt)
    const merchant = receipt.merchant || tx.merchant || ''
    enriched[best.index] = {
      ...tx,
      billProductName: tx.productName || '',
      productName: productName || tx.productName || '',
      merchant,
      name: [merchant || tx.merchant, productName || tx.productName].filter(Boolean).join(' ') || tx.name,
      platform: receipt.platform || tx.platform || tx.source,
      screenshotFile: receipt.screenshotFile,
      screenshotConfidence: receipt.confidence ?? null,
      itemNames: receipt.itemNames || [],
      receiptMatch: {
        status: productName ? 'matched-enriched' : 'matched-no-product',
        score: best.result.score,
        timeDifferenceHours: Math.round(best.result.hours * 10) / 10,
        receiptId: receipt.id,
      },
    }
    usedBillIndexes.add(best.index)
    matches.push({ transactionIndex: best.index, receiptId: receipt.id, score: best.result.score, productName })
  }

  return {
    transactions: [...enriched, ...unmatchedReceipts.map(receiptAsTransaction)],
    matches,
    unmatchedReceipts,
  }
}
