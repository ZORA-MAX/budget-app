import * as XLSX from 'xlsx'
import { resolveClassification } from './classifier.js'
import { getCategoryByKey, TAG_MAP } from './categories.js'
import { txKey } from './csv-parser.js'

const SOURCE_LABELS = {
  wechat: '微信',
  alipay: '支付宝',
  cashbook: '记账本',
  'merged-memory': '合并记忆',
  manual: '手动录入',
  bank: '银行卡',
  screenshot: '消费截图',
}

const DIRECTION_LABELS = { expense: '支出', income: '收入', refund: '退款', transfer: '资金流转', other: '其他' }

const CLASSIFICATION_SOURCE_LABELS = {
  override: '手动修改',
  memory: '分类记忆',
  'merge-memory': '合并记忆',
  policy: '个人规则',
  classifier: '关键词分类',
}

export const EXPORT_SHEET_NAMES = [
  '完整流水',
  '月度收支汇总',
  '支出分类汇总',
  '账单原始字段',
  '截图识别明细',
  '合并原始明细',
]

export const EXPORT_HEADERS = {
  '完整流水': ['完整时间', '日期', '月份', '类型', '金额', '流入金额', '流出金额', '净额', '名称', '交易对象', '具体商品或服务', '账单原商品字段', '交易详情', '平台', '来源', '来源文件', '工作表', '状态', '是否计入收支', '支付方式', '账户', '余额', '交易号', '订单号', '原始分类', '一级分类', '二级分类', '消费性质', '分类依据', '截图文件', '截图匹配状态', '截图匹配分数', '截图识别置信度', '合并规则', '合并笔数'],
  '月度收支汇总': ['月份', '收入', '退款', '支出', '净现金流', '流水笔数'],
  '支出分类汇总': ['月份', '一级分类', '二级分类', '笔数', '支出金额'],
  '账单原始字段': ['来源', '来源文件', '工作表', '标准时间', '标准类型', '标准金额', '完整时间', '类型', '金额', '币种', '交易对象', '具体商品或服务', '商品清单', '平台', '状态', '是否计入收支', '支付方式', '账户', '余额', '交易号', '订单号', '一级分类', '二级分类', '消费性质', '截图文件', '匹配状态', '匹配依据', '识别置信度', '来源工作表', '原始行号', '证据ID', '备注'],
  '截图识别明细': ['截图文件', '时间', '类型', '金额', '平台', '商家', '具体商品或服务', '商品清单', '匹配状态', '匹配分数', '识别置信度', '订单号', '交易号'],
  '合并原始明细': ['合并规则', '归属月份', '原交易日期', '原交易金额', '原交易名称', '原交易来源'],
}

function localDateString(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return ''
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-')
}

function localDateTimeString(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return ''
  return `${localDateString(date)} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}:${String(date.getSeconds()).padStart(2, '0')}`
}

function effectiveTransaction(tx, override) {
  return {
    ...tx,
    name: override?.editedName ?? tx.name,
    merchant: override?.editedMerchant ?? tx.merchant ?? '',
    productName: override?.editedProductName ?? tx.productName ?? '',
    details: override?.editedDetails ?? tx.details ?? '',
    amount: Number.isFinite(override?.editedAmount) ? override.editedAmount : tx.amount,
  }
}

export function buildTransactionExportRows(transactions, overrides = {}, memory = {}) {
  return transactions
    .slice()
    .sort((a, b) => b.date - a.date)
    .map(tx => {
      const override = overrides[txKey(tx)]
      const effectiveTx = effectiveTransaction(tx, override)
      const classification = resolveClassification(effectiveTx, override, memory)
      const isExpense = (effectiveTx.direction || 'expense') === 'expense' && effectiveTx.isEffective !== false
      const category = isExpense ? getCategoryByKey(classification.catKey) : null
      const subcategory = category?.subs?.find(item => item.key === classification.subKey)
      const direction = effectiveTx.direction || 'expense'
      const amount = Number(effectiveTx.amount) || 0
      const inflow = effectiveTx.isEffective === false ? 0 : direction === 'income' || direction === 'refund' ? amount : 0
      const outflow = effectiveTx.isEffective === false ? 0 : direction === 'expense' ? amount : 0

      return {
        完整时间: localDateTimeString(effectiveTx.date),
        日期: localDateString(effectiveTx.date),
        月份: localDateString(effectiveTx.date).slice(0, 7),
        类型: DIRECTION_LABELS[direction] || direction,
        金额: amount,
        流入金额: inflow,
        流出金额: outflow,
        净额: Math.round((inflow - outflow + Number.EPSILON) * 100) / 100,
        名称: effectiveTx.name || '',
        交易对象: effectiveTx.merchant || '',
        具体商品或服务: effectiveTx.productName || '',
        账单原商品字段: effectiveTx.billProductName || '',
        交易详情: effectiveTx.details || '',
        平台: SOURCE_LABELS[effectiveTx.platform] || effectiveTx.platform || SOURCE_LABELS[effectiveTx.source] || '',
        来源: SOURCE_LABELS[effectiveTx.source] || effectiveTx.source || '未知',
        来源文件: effectiveTx.sourceFile || '',
        工作表: effectiveTx.sheetName || '',
        状态: effectiveTx.status || '',
        是否计入收支: effectiveTx.isEffective === false ? '否' : '是',
        支付方式: effectiveTx.paymentMethod || '',
        账户: effectiveTx.account || '',
        余额: Number.isFinite(effectiveTx.balance) ? effectiveTx.balance : '',
        交易号: effectiveTx.transactionId || '',
        订单号: effectiveTx.orderId || '',
        原始分类: effectiveTx.originalCategory || '',
        一级分类: category?.label || '',
        二级分类: subcategory?.label || '',
        消费性质: isExpense ? (classification.tags || []).map(tag => TAG_MAP[tag]?.label || tag).join('、') : '',
        分类依据: isExpense ? CLASSIFICATION_SOURCE_LABELS[classification.source] || classification.source || '' : '',
        截图文件: effectiveTx.screenshotFile || '',
        截图匹配状态: effectiveTx.receiptMatch?.status || '',
        截图匹配分数: effectiveTx.receiptMatch?.score ?? '',
        截图识别置信度: effectiveTx.screenshotConfidence ?? '',
        合并规则: effectiveTx.mergeMemory?.label || '',
        合并笔数: effectiveTx.mergeMemory?.count || 1,
      }
    })
}

export function buildMonthlySummaryRows(rows) {
  const summary = new Map()
  for (const row of rows) {
    if (!row.流出金额) continue
    const key = `${row.月份}|${row.一级分类}|${row.二级分类}`
    const current = summary.get(key) || {
      月份: row.月份,
      一级分类: row.一级分类,
      二级分类: row.二级分类,
      笔数: 0,
      支出金额: 0,
    }
    current.笔数 += row.合并笔数 || 1
    current.支出金额 = Math.round((current.支出金额 + row.流出金额 + Number.EPSILON) * 100) / 100
    summary.set(key, current)
  }
  return [...summary.values()].sort((a, b) => b.月份.localeCompare(a.月份) || b.支出金额 - a.支出金额)
}

export function buildCashflowSummaryRows(rows) {
  const summary = new Map()
  for (const row of rows) {
    const current = summary.get(row.月份) || { 月份: row.月份, 收入: 0, 退款: 0, 支出: 0, 净现金流: 0, 流水笔数: 0 }
    current.流水笔数 += row.合并笔数 || 1
    if (row.类型 === '收入') current.收入 += row.流入金额
    if (row.类型 === '退款') current.退款 += row.流入金额
    current.支出 += row.流出金额
    current.净现金流 += row.净额
    for (const key of ['收入', '退款', '支出', '净现金流']) current[key] = Math.round((current[key] + Number.EPSILON) * 100) / 100
    summary.set(row.月份, current)
  }
  return [...summary.values()].sort((a, b) => b.月份.localeCompare(a.月份))
}

export function buildRawFieldRows(transactions) {
  const serializable = value => {
    if (value === null || value === undefined) return ''
    if (value instanceof Date) return localDateTimeString(value)
    if (typeof value === 'object') return JSON.stringify(value)
    return value
  }
  return transactions.map(tx => {
    const raw = Object.fromEntries(Object.entries(tx.rawFields || {}).map(([key, value]) => [key, serializable(value)]))
    const direction = DIRECTION_LABELS[tx.direction || 'expense'] || tx.direction
    const platform = SOURCE_LABELS[tx.platform] || tx.platform || SOURCE_LABELS[tx.source] || tx.source || ''
    const value = (key, fallback = '') => raw[key] ?? fallback
    return {
      来源: value('来源', SOURCE_LABELS[tx.source] || tx.source || ''),
      来源文件: value('来源文件', tx.sourceFile || ''),
      工作表: value('工作表', tx.sheetName || ''),
      标准时间: localDateTimeString(tx.date),
      标准类型: direction,
      标准金额: Number(tx.amount) || 0,
      完整时间: value('完整时间', localDateTimeString(tx.date)),
      类型: value('类型', direction),
      金额: value('金额', Number(tx.amount) || 0),
      币种: value('币种', tx.currency || 'CNY'),
      交易对象: value('交易对象', tx.merchant || tx.name || ''),
      具体商品或服务: value('具体商品或服务', tx.productName || ''),
      商品清单: value('商品清单', (tx.itemNames || []).join('、')),
      平台: value('平台', platform),
      状态: value('状态', tx.status || ''),
      是否计入收支: value('是否计入收支', tx.isEffective === false ? '否' : '是'),
      支付方式: value('支付方式', tx.paymentMethod || ''),
      账户: value('账户', tx.account || ''),
      余额: value('余额', Number.isFinite(tx.balance) ? tx.balance : ''),
      交易号: value('交易号', tx.transactionId || ''),
      订单号: value('订单号', tx.orderId || ''),
      一级分类: value('一级分类'),
      二级分类: value('二级分类'),
      消费性质: value('消费性质'),
      截图文件: value('截图文件', tx.screenshotFile || ''),
      匹配状态: value('匹配状态', tx.receiptMatch?.status || ''),
      匹配依据: value('匹配依据', tx.receiptMatch?.reason || ''),
      识别置信度: value('识别置信度', tx.screenshotConfidence ?? ''),
      来源工作表: value('来源工作表', tx.sheetName || ''),
      原始行号: value('原始行号', tx.sourceRow ?? ''),
      证据ID: value('证据ID', tx.evidenceId || ''),
      备注: value('备注', tx.details || ''),
    }
  })
}

export function buildReceiptRows(transactions) {
  return transactions.filter(tx => tx.screenshotFile).map(tx => ({
    截图文件: tx.screenshotFile,
    时间: localDateTimeString(tx.date),
    类型: DIRECTION_LABELS[tx.direction || 'expense'] || tx.direction,
    金额: Number(tx.amount) || 0,
    平台: tx.platform || '',
    商家: tx.merchant || '',
    具体商品或服务: tx.productName || '',
    商品清单: (tx.itemNames || []).join('、'),
    匹配状态: tx.receiptMatch?.status || '',
    匹配分数: tx.receiptMatch?.score ?? '',
    识别置信度: tx.screenshotConfidence ?? '',
    订单号: tx.orderId || '',
    交易号: tx.transactionId || '',
  }))
}

export function buildMergedDetailRows(transactions) {
  return transactions.flatMap(tx => (tx.mergeMemory?.details || []).map(detail => ({
    合并规则: tx.mergeMemory.label || '',
    归属月份: localDateString(tx.date).slice(0, 7),
    原交易日期: detail.date || '',
    原交易金额: Number(detail.amount) || 0,
    原交易名称: detail.name || '',
    原交易来源: SOURCE_LABELS[detail.source] || detail.source || '',
  })))
}

function styleSheet(sheet, widths, currencyColumns = []) {
  sheet['!cols'] = widths.map(width => ({ wch: width }))
  if (sheet['!ref']) sheet['!autofilter'] = { ref: sheet['!ref'] }
  if (!sheet['!ref']) return
  const range = XLSX.utils.decode_range(sheet['!ref'])
  for (const currencyColumn of currencyColumns) {
    for (let row = 1; row <= range.e.r; row += 1) {
      const cell = sheet[XLSX.utils.encode_cell({ r: row, c: currencyColumn })]
      if (cell) cell.z = '¥#,##0.00;[Red]-¥#,##0.00'
    }
  }
}

function rowsToSheet(rows, sheetName) {
  return XLSX.utils.json_to_sheet(rows, { header: EXPORT_HEADERS[sheetName] })
}

export function buildExportWorkbook(transactions, overrides = {}, memory = {}) {
  const detailRows = buildTransactionExportRows(transactions, overrides, memory)
  const summaryRows = buildMonthlySummaryRows(detailRows)
  const cashflowRows = buildCashflowSummaryRows(detailRows)
  const rawRows = buildRawFieldRows(transactions)
  const receiptRows = buildReceiptRows(transactions)
  const mergedRows = buildMergedDetailRows(transactions)
  const workbook = XLSX.utils.book_new()
  const detailSheet = rowsToSheet(detailRows, '完整流水')
  const cashflowSheet = rowsToSheet(cashflowRows, '月度收支汇总')
  const summarySheet = rowsToSheet(summaryRows, '支出分类汇总')
  const rawSheet = rowsToSheet(rawRows, '账单原始字段')

  styleSheet(detailSheet, [20, 12, 9, 10, 13, 13, 13, 13, 30, 22, 30, 24, 30, 14, 12, 18, 14, 14, 14, 18, 16, 18, 18, 16, 18, 18, 24, 14, 16, 18, 12, 12, 18, 10], [4, 5, 6, 7, 20])
  styleSheet(cashflowSheet, [10, 14, 14, 14, 16, 12], [1, 2, 3, 4])
  styleSheet(summarySheet, [10, 16, 18, 10, 14], [4])
  styleSheet(rawSheet, [14, 22, 16, 20, 12, 14, ...Array(30).fill(18)], [5])
  XLSX.utils.book_append_sheet(workbook, detailSheet, '完整流水')
  XLSX.utils.book_append_sheet(workbook, cashflowSheet, '月度收支汇总')
  XLSX.utils.book_append_sheet(workbook, summarySheet, '支出分类汇总')
  XLSX.utils.book_append_sheet(workbook, rawSheet, '账单原始字段')

  const receiptSheet = rowsToSheet(receiptRows, '截图识别明细')
  styleSheet(receiptSheet, [22, 20, 10, 14, 14, 22, 34, 34, 18, 12, 14, 18, 18], [3])
  XLSX.utils.book_append_sheet(workbook, receiptSheet, '截图识别明细')

  const mergedSheet = rowsToSheet(mergedRows, '合并原始明细')
  styleSheet(mergedSheet, [22, 12, 14, 14, 32, 14], [3])
  XLSX.utils.book_append_sheet(workbook, mergedSheet, '合并原始明细')

  return workbook
}

export function exportTransactionsToExcel(transactions, overrides = {}, memory = {}) {
  const workbook = buildExportWorkbook(transactions, overrides, memory)
  const months = [...new Set(transactions.map(tx => localDateString(tx.date).slice(0, 7)).filter(Boolean))].sort()
  const suffix = months.length === 1 ? months[0] : months.length > 1 ? `${months[0]}至${months.at(-1)}` : '账单'
  XLSX.writeFile(workbook, `${suffix}_完整收支与消费明细.xlsx`, { compression: true })
}
