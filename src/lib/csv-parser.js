import Papa from 'papaparse'
import * as XLSX from 'xlsx'

// ─── Entry point: detect format and parse ───
export function parseCSV(text) {
  text = text.replace(/^\uFEFF/, '')

  if (text.includes('完整时间') && text.includes('类型') && text.includes('金额') && (text.includes('交易对象') || text.includes('名称'))) {
    return parseConsolidatedWorkbook(text)
  }
  if (text.includes('微信支付账单明细') || text.includes('交易时间,交易类型,交易对方')) return parseWechat(text)
  if (text.includes('支付宝') && text.includes('交易对方')) return parseAlipay(text)
  if (text.includes('记录时间') && text.includes('分类') && text.includes('收支类型')) return parseCashbook(text)
  if (text.includes('交易号') || text.includes('收/支')) return parseAlipay(text)

  const wx = parseWechat(text)
  if (wx.length > 0) return wx
  const ali = parseAlipay(text)
  if (ali.length > 0) return ali
  return parseCashbook(text)
}

// ─── Excel file parser ───
export function parseExcel(arrayBuffer) {
  const wb = XLSX.read(arrayBuffer, { type: 'array' })
  const sheet = wb.Sheets[wb.SheetNames[0]]
  const csv = XLSX.utils.sheet_to_csv(sheet)
  return parseCSV(csv)
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
  const m = s.match(/(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (!m) return null
  return new Date(parseInt(m[1]), parseInt(m[2]) - 1, parseInt(m[3]))
}

function cleanAmount(str) {
  if (!str) return 0
  return parseFloat(str.replace(/[¥,￥\s]/g, '')) || 0
}

function sourceFromRow(row) {
  const text = `${row['平台'] || ''} ${row['来源'] || ''} ${row['账户'] || ''}`.toLowerCase()
  if (text.includes('微信')) return 'wechat'
  if (text.includes('支付宝') || text.includes('花呗')) return 'alipay'
  if (text.includes('拼多多')) return 'pdd'
  if (text.includes('银行') || text.includes('借记卡') || text.includes('储蓄卡')) return 'bank'
  return 'cashbook'
}

function joinDistinct(values) {
  const distinct = []
  for (const value of values.map(item => String(item || '').trim()).filter(Boolean)) {
    if (!distinct.some(existing => existing === value || existing.includes(value))) distinct.push(value)
  }
  return distinct.join(' ')
}

function parseConsolidatedWorkbook(text) {
  const lines = text.split('\n')
  const headerIdx = findHeaderLine(lines, ['完整时间', '类型', '金额'])
  if (headerIdx < 0) return []
  const { data } = Papa.parse(lines.slice(headerIdx).join('\n'), { header: true, skipEmptyLines: true })
  const records = data.map(row => {
    const record = {}
    for (const key in row) record[key.trim()] = typeof row[key] === 'string' ? row[key].trim() : row[key]
    return record
  })
  const monthCounts = new Map()
  for (const record of records) {
    const date = parseDate(String(record['完整时间'] || record['日期'] || ''))
    if (!date) continue
    const key = `${date.getFullYear()}-${date.getMonth()}`
    monthCounts.set(key, (monthCounts.get(key) || 0) + 1)
  }
  const inferredMonth = [...monthCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]
  const [fallbackYear, fallbackMonth] = inferredMonth ? inferredMonth.split('-').map(Number) : []
  const rows = []

  for (const record of records) {
    if (!String(record['类型'] || '').includes('支出')) continue
    if (['否', '不计入'].some(value => String(record['是否计入收支'] || '').includes(value))) continue
    const status = String(record['状态'] || '')
    if (['退款', '关闭', '失败'].some(value => status.includes(value))) continue

    const amount = cleanAmount(String(record['金额'] || record['流出金额'] || ''))
    const date = parseDate(String(record['完整时间'] || record['日期'] || ''))
      || (Number.isInteger(fallbackYear) ? new Date(fallbackYear, fallbackMonth, 1) : null)
    if (amount <= 0 || !date) continue

    const name = String(record['名称'] || '').trim() || joinDistinct([
      record['交易对象'],
      record['具体商品或服务'],
      record['商品清单'],
    ])
    if (!name) continue

    rows.push({
      date,
      name,
      note: String(record['备注'] || '').trim(),
      amount,
      source: sourceFromRow(record),
      sourceLabel: String(record['平台'] || record['来源'] || '').trim(),
      originalCategory: String(record['一级分类'] || record['原始分类'] || '').trim(),
      importedClassification: {
        categoryLabel: String(record['一级分类'] || '').trim(),
        subcategoryLabel: String(record['二级分类'] || '').trim(),
        tagLabels: String(record['消费性质'] || '').trim(),
      },
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
  for (const row of data) {
    if (!(row['收/支'] || '').includes('支出')) continue
    const amount = cleanAmount(row['金额(元)'])
    if (amount <= 0) continue
    const date = parseDate(row['交易时间'])
    if (!date) continue
    const name = [(row['交易对方'] || '').trim(), (row['商品'] || '').trim()].filter(Boolean).join(' ')
    rows.push({ date, name, amount, source: 'wechat' })
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
    const r = {}
    for (const k in row) r[k.trim()] = typeof row[k] === 'string' ? row[k].trim() : row[k]
    const typeField = r['收/支'] || r['资金状态'] || ''
    if (!typeField.includes('支出') && !typeField.includes('付款')) continue
    const status = r['交易状态'] || r['资金状态'] || ''
    if (status.includes('退款') || status.includes('关闭') || status.includes('失败')) continue
    const amount = cleanAmount(r['金额'] || r['实际金额'] || r['金额（元）'] || '')
    if (amount <= 0) continue
    const date = parseDate(r['交易时间'] || r['交易创建时间'] || '')
    if (!date) continue
    const name = [(r['交易对方'] || '').trim(), (r['商品名称'] || r['商品说明'] || '').trim()].filter(Boolean).join(' ')
    rows.push({ date, name, amount, source: 'alipay' })
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
    const r = {}
    for (const k in row) r[k.trim()] = typeof row[k] === 'string' ? row[k].trim() : row[k]
    if (!(r['收支类型'] || '').includes('支出')) continue
    if ((r['分类'] || '').includes('退款')) continue
    const amount = cleanAmount(r['金额'] || '')
    if (amount <= 0) continue
    const date = parseDate(r['记录时间'] || '')
    if (!date) continue
    const name = (r['备注'] || '').trim() || (r['分类'] || '')
    const account = (r['账户'] || '').toLowerCase()
    let source = 'cashbook'
    if (account.includes('微信')) source = 'wechat'
    else if (account.includes('支付宝') || account.includes('花呗')) source = 'alipay'
    rows.push({ date, name, amount, source, originalCategory: (r['分类'] || '') })
  }
  return rows
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
  return '¥' + amount.toLocaleString('zh-CN', {
    minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
    maximumFractionDigits: 2,
  })
}

export function txKey(tx) {
  return `${tx.date.toISOString()}_${tx.amount}_${tx.name}`
}
