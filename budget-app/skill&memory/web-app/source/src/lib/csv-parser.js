import Papa from 'papaparse'
import * as XLSX from 'xlsx'

// ─── Entry point: detect format and parse ───
export function parseCSV(text) {
  text = text.replace(/^\uFEFF/, '')

  if (text.includes('完整时间') && text.includes('具体商品或服务') && text.includes('匹配状态')) return parseReconciledLedger(text)
  if (text.includes('微信支付账单明细') || (text.includes('交易时间,交易类型,交易对方') && text.includes('金额(元)'))) return parseWechat(text)
  if (text.includes('支付宝') && text.includes('交易对方')) return parseAlipay(text)
  if (text.includes('记录时间') && text.includes('分类') && text.includes('收支类型')) return parseCashbook(text)
  if (text.includes('交易号') && (text.includes('商品名称') || text.includes('资金状态'))) {
    const alipay = parseAlipay(text)
    if (alipay.length > 0) return alipay
  }

  const cashbook = parseCashbook(text)
  if (cashbook.length > 0) return cashbook
  const bank = parseGenericBank(text)
  if (bank.length > 0) return bank
  if (text.includes('金额(元)') && text.includes('支付方式')) return parseWechat(text)
  if (text.includes('交易创建时间') || text.includes('资金状态')) return parseAlipay(text)
  return []
}

// ─── Excel file parser ───
export function parseExcel(arrayBuffer) {
  const wb = XLSX.read(arrayBuffer, { type: 'array' })
  const webpageSheet = wb.SheetNames.find(sheetName => sheetName.trim() === '网页导入流水')
  const sheetsToRead = webpageSheet ? [webpageSheet] : wb.SheetNames
  return sheetsToRead.flatMap(sheetName => {
    const csv = XLSX.utils.sheet_to_csv(wb.Sheets[sheetName])
    return parseCSV(csv).map(tx => ({ ...tx, sheetName }))
  })
}

// ─── Helpers ───
function findHeaderLine(lines, required) {
  for (let i = 0; i < Math.min(lines.length, 30); i++) {
    if (required.every(r => lines[i].includes(r))) return i
  }
  return -1
}

function parseDate(str) {
  if (!str) return null
  const s = str.trim().replace(/\//g, '-')
  const m = s.match(/(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/)
  if (!m) return null
  return new Date(
    parseInt(m[1]),
    parseInt(m[2]) - 1,
    parseInt(m[3]),
    parseInt(m[4] || '0'),
    parseInt(m[5] || '0'),
    parseInt(m[6] || '0'),
  )
}

function cleanAmount(str) {
  if (!str) return 0
  return parseFloat(str.replace(/[¥,￥\s]/g, '')) || 0
}

function joinDetails(parts) {
  return parts
    .map(part => String(part || '').trim())
    .filter(Boolean)
    .filter((part, index, items) => items.indexOf(part) === index)
    .join(' · ')
}

function normalizeRow(row) {
  const normalized = {}
  for (const key in row) {
    const cleanKey = String(key || '').trim()
    if (!cleanKey) continue
    normalized[cleanKey] = typeof row[key] === 'string' ? row[key].trim() : row[key]
  }
  return normalized
}

function directionFrom(typeField, status = '', category = '') {
  const text = `${typeField} ${status} ${category}`
  if (/退款|退回|冲正|撤销/.test(text)) return 'refund'
  if (/支出|付款|消费|借方|转出/.test(text)) return 'expense'
  if (/收入|收款|入账|贷方|转入/.test(text)) return 'income'
  if (/不计收支|资金流转|转账|还款/.test(text)) return 'transfer'
  return 'other'
}

function isEffectiveStatus(status = '') {
  return !/关闭|失败|已撤销|交易取消/.test(status)
}

function signedAmount(direction, amount, effective = true) {
  if (!effective) return 0
  if (direction === 'expense') return -amount
  if (direction === 'income' || direction === 'refund') return amount
  return 0
}

function commonFields({
  date,
  name,
  merchant = '',
  productName = '',
  details = '',
  amount,
  source,
  platform = source,
  direction,
  status = '',
  paymentMethod = '',
  transactionId = '',
  orderId = '',
  account = '',
  balance = null,
  originalCategory = '',
  rawFields = {},
}) {
  const isEffective = isEffectiveStatus(status)
  return {
    date,
    name,
    merchant,
    productName,
    details,
    amount,
    signedAmount: signedAmount(direction, amount, isEffective),
    direction,
    status,
    isEffective,
    source,
    platform,
    paymentMethod,
    transactionId,
    orderId,
    account,
    balance,
    originalCategory,
    rawFields,
  }
}

function sourceFromLabels(...labels) {
  const text = labels.map(value => String(value || '').toLowerCase()).join(' ')
  if (/微信|wechat/.test(text)) return 'wechat'
  if (/支付宝|花呗|alipay/.test(text)) return 'alipay'
  if (/银行|银行卡|bank/.test(text)) return 'bank'
  if (/截图|screenshot/.test(text)) return 'screenshot'
  return 'cashbook'
}

function parseConfidence(value) {
  const text = String(value || '').trim()
  if (!text) return null
  const parsed = parseFloat(text)
  if (!Number.isFinite(parsed)) return null
  return text.includes('%') ? parsed / 100 : parsed
}

function parseReconciledLedger(text) {
  const lines = text.split('\n')
  const headerIdx = findHeaderLine(lines, ['完整时间', '类型', '金额', '具体商品或服务'])
  if (headerIdx < 0) return []
  const { data } = Papa.parse(lines.slice(headerIdx).join('\n'), { header: true, skipEmptyLines: true })
  const rows = []
  for (const rawRow of data) {
    const row = normalizeRow(rawRow)
    const date = parseDate(row['完整时间'])
    const amount = cleanAmount(row['金额'] || '')
    if (!date || amount <= 0) continue

    const direction = directionFrom(row['类型'], row['状态'] || '', row['一级分类'] || '')
    const merchant = String(row['交易对象'] || '').trim()
    const productName = String(row['具体商品或服务'] || '').trim()
    const platform = String(row['平台'] || row['来源'] || '').trim()
    const source = sourceFromLabels(row['来源'], platform, row['账户'], row['支付方式'])
    const explicitEffective = row['是否计入收支'] !== '否'
    const normalized = commonFields({
      date,
      name: [merchant, productName].filter(Boolean).join(' ') || '已清洗流水',
      merchant,
      productName,
      details: joinDetails([row['商品清单'], row['备注'], row['匹配依据']]),
      amount,
      source,
      platform,
      direction,
      status: row['状态'] || '',
      paymentMethod: row['支付方式'] || '',
      transactionId: row['交易号'] || '',
      orderId: row['订单号'] || '',
      account: row['账户'] || '',
      balance: row['余额'] ? cleanAmount(row['余额']) : null,
      originalCategory: [row['一级分类'], row['二级分类']].filter(Boolean).join(' / '),
      rawFields: row,
    })
    if (!explicitEffective) {
      normalized.isEffective = false
      normalized.signedAmount = 0
    }
    rows.push({
      ...normalized,
      currency: row['币种'] || 'CNY',
      itemNames: String(row['商品清单'] || '').split('、').map(item => item.trim()).filter(Boolean),
      screenshotFile: row['截图文件'] || '',
      screenshotConfidence: parseConfidence(row['识别置信度']),
      receiptMatch: row['匹配状态'] ? { status: row['匹配状态'], basis: row['匹配依据'] || '' } : null,
      evidenceId: row['证据ID'] || '',
    })
  }
  return rows
}

function parseWechat(text) {
  const lines = text.split('\n')
  const headerIdx = findHeaderLine(lines, ['交易时间', '交易对方'])
  if (headerIdx < 0) return []
  const { data } = Papa.parse(lines.slice(headerIdx).join('\n'), { header: true, skipEmptyLines: true })
  const rows = []
  for (const rawRow of data) {
    const row = normalizeRow(rawRow)
    const amount = cleanAmount(row['金额(元)'] || row['金额（元）'] || row['金额'])
    if (amount <= 0) continue
    const date = parseDate(row['交易时间'])
    if (!date) continue
    const merchant = (row['交易对方'] || '').trim()
    const productName = (row['商品'] || '').trim()
    const name = [merchant, productName].filter(Boolean).join(' ')
    const details = joinDetails([row['交易类型'], row['支付方式'], row['备注']])
    const status = row['当前状态'] || row['交易状态'] || ''
    const direction = directionFrom(row['收/支'] || row['交易类型'], status)
    rows.push(commonFields({
      date,
      name,
      merchant,
      productName,
      details,
      amount,
      source: 'wechat',
      direction,
      status,
      paymentMethod: row['支付方式'] || '',
      transactionId: row['交易单号'] || row['交易号'] || '',
      orderId: row['商户单号'] || '',
      account: row['支付方式'] || '',
      rawFields: row,
    }))
  }
  return rows
}

function parseAlipay(text) {
  const lines = text.split('\n')
  const headerIdx = findHeaderLine(lines, ['交易对方'])
  if (headerIdx < 0) return []
  const { data } = Papa.parse(lines.slice(headerIdx).join('\n'), { header: true, skipEmptyLines: true })
  const rows = []
  for (const row of data) {
    const r = normalizeRow(row)
    const typeField = r['收/支'] || r['资金状态'] || ''
    const status = r['交易状态'] || r['资金状态'] || ''
    const amount = cleanAmount(r['金额'] || r['实际金额'] || r['金额（元）'] || '')
    if (amount <= 0) continue
    const date = parseDate(r['交易时间'] || r['交易创建时间'] || '')
    if (!date) continue
    const merchant = (r['交易对方'] || '').trim()
    const productName = (r['商品名称'] || r['商品说明'] || '').trim()
    const name = [merchant, productName].filter(Boolean).join(' ')
    const details = joinDetails([r['类型'], r['交易来源地'], r['付款方式'], r['备注']])
    const direction = directionFrom(typeField || r['类型'], status)
    rows.push(commonFields({
      date,
      name,
      merchant,
      productName,
      details,
      amount,
      source: 'alipay',
      direction,
      status,
      paymentMethod: r['付款方式'] || r['支付方式'] || '',
      transactionId: r['交易号'] || '',
      orderId: r['商家订单号'] || r['商户订单号'] || '',
      account: r['付款方式'] || '',
      rawFields: r,
    }))
  }
  return rows
}

function parseCashbook(text) {
  const lines = text.split('\n')
  const headerIdx = findHeaderLine(lines, ['记录时间', '分类'])
  if (headerIdx < 0) return []
  const { data } = Papa.parse(lines.slice(headerIdx).join('\n'), { header: true, skipEmptyLines: true })
  const rows = []
  for (const row of data) {
    const r = normalizeRow(row)
    const amount = cleanAmount(r['金额'] || '')
    if (amount <= 0) continue
    const date = parseDate(r['记录时间'] || '')
    if (!date) continue
    const productName = (r['备注'] || '').trim()
    const name = productName || (r['分类'] || '')
    const account = (r['账户'] || '').toLowerCase()
    let source = 'cashbook'
    if (account.includes('微信')) source = 'wechat'
    else if (account.includes('支付宝') || account.includes('花呗')) source = 'alipay'
    const direction = directionFrom(r['收支类型'], r['状态'] || '', r['分类'] || '')
    rows.push(commonFields({
      date,
      name,
      merchant: '',
      productName,
      details: joinDetails([r['标签'], r['成员'], r['项目']]),
      amount,
      source,
      direction,
      status: r['状态'] || '',
      paymentMethod: r['账户'] || '',
      account: r['账户'] || '',
      balance: r['账户余额'] ? cleanAmount(r['账户余额']) : null,
      originalCategory: (r['分类'] || ''),
      rawFields: r,
    }))
  }
  return rows
}

const BANK_DATE_FIELDS = ['交易时间', '交易日期', '记账日期', '入账时间', '发生时间', '日期']
const BANK_MERCHANT_FIELDS = ['交易对方', '对方户名', '商户名称', '收款方', '交易摘要', '摘要', '用途']

function firstValue(row, fields) {
  for (const field of fields) if (row[field] !== undefined && row[field] !== '') return row[field]
  return ''
}

function parseGenericBank(text) {
  const lines = text.split('\n')
  const headerIdx = lines.findIndex((line, index) => index < 40 && BANK_DATE_FIELDS.some(field => line.includes(field)))
  if (headerIdx < 0) return []
  const { data } = Papa.parse(lines.slice(headerIdx).join('\n'), { header: true, skipEmptyLines: true })
  const rows = []
  for (const rawRow of data) {
    const row = normalizeRow(rawRow)
    const date = parseDate(firstValue(row, BANK_DATE_FIELDS))
    if (!date) continue
    const debit = cleanAmount(firstValue(row, ['借方金额', '支出金额', '转出金额']))
    const credit = cleanAmount(firstValue(row, ['贷方金额', '收入金额', '转入金额']))
    const genericAmount = cleanAmount(firstValue(row, ['交易金额', '金额', '发生额']))
    const amount = debit || credit || Math.abs(genericAmount)
    if (amount <= 0) continue
    const typeField = firstValue(row, ['收/支', '收支类型', '交易类型', '借贷标志'])
    const direction = debit > 0 ? 'expense' : credit > 0 ? 'income' : genericAmount < 0 ? 'expense' : genericAmount > 0 ? 'income' : directionFrom(typeField)
    const merchant = String(firstValue(row, BANK_MERCHANT_FIELDS) || '').trim()
    const productName = String(firstValue(row, ['商品名称', '商品说明', '备注', '附言']) || '').trim()
    const name = [merchant, productName].filter(Boolean).join(' ') || typeField || '银行流水'
    const status = String(firstValue(row, ['交易状态', '状态']) || '').trim()
    rows.push(commonFields({
      date,
      name,
      merchant,
      productName,
      details: joinDetails([typeField, row['摘要'], row['用途'], row['备注']]),
      amount,
      source: 'bank',
      direction,
      status,
      paymentMethod: firstValue(row, ['卡号', '账号', '账户']),
      transactionId: firstValue(row, ['流水号', '交易流水号', '交易号']),
      orderId: firstValue(row, ['订单号', '商户订单号']),
      account: firstValue(row, ['卡号', '账号', '账户']),
      balance: firstValue(row, ['余额', '账户余额']) ? cleanAmount(firstValue(row, ['余额', '账户余额'])) : null,
      rawFields: row,
    }))
  }
  return rows
}

export function isExpenseTransaction(tx) {
  return (tx.direction || 'expense') === 'expense' && tx.isEffective !== false
}

export function isIncomeTransaction(tx) {
  return tx.direction === 'income' && tx.isEffective !== false
}

export function isRefundTransaction(tx) {
  return tx.direction === 'refund' && tx.isEffective !== false
}

export function groupByMonth(txs) {
  const map = {}
  for (const tx of txs) {
    const key = `${tx.date.getFullYear()}-${String(tx.date.getMonth() + 1).padStart(2, '0')}`
    if (!map[key]) map[key] = []
    map[key].push(tx)
  }
  return map
}

export function fmtMoney(n) {
  const amount = Number(n) || 0
  return `${amount < 0 ? '-¥' : '¥'}${Math.abs(amount).toLocaleString('zh-CN', {
    minimumFractionDigits: Number.isInteger(Math.abs(amount)) ? 0 : 2,
    maximumFractionDigits: 2,
  })}`
}

export function txKey(tx) {
  const direction = tx.direction && tx.direction !== 'expense' ? `_${tx.direction}` : ''
  return `${tx.date.toISOString()}_${tx.amount}_${tx.name}${direction}`
}
