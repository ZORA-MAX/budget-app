import test from 'node:test'
import assert from 'node:assert/strict'
import * as XLSX from 'xlsx'
import { txKey } from '../src/lib/csv-parser.js'

import {
  buildCashflowSummaryRows,
  buildExportWorkbook,
  buildMonthlySummaryRows,
  buildTransactionExportRows,
  EXPORT_HEADERS,
  EXPORT_SHEET_NAMES,
} from '../src/lib/export-transactions.js'

const transactions = [
  {
    date: new Date(2026, 6, 19),
    name: '星巴克 冰摇柠檬茶',
    merchant: '星巴克',
    productName: '冰摇柠檬茶',
    details: '商户消费 · 零钱',
    amount: 32,
    source: 'wechat',
  },
  {
    date: new Date(2026, 6, 20),
    name: '苏州地铁',
    amount: 8,
    source: 'alipay',
  },
]

test('builds auditable cleaned transaction rows with effective edits and labels', () => {
  const first = transactions[0]
  const key = `${first.date.toISOString()}_${first.amount}_${first.name}`
  const rows = buildTransactionExportRows(transactions, {
    [key]: {
      editedAmount: 30,
      catKey: 'food',
      subKey: 'coffee',
      tags: ['elastic'],
    },
  })

  assert.equal(rows[1].日期, '2026-07-19')
  assert.equal(rows[1].流出金额, 30)
  assert.equal(rows[1].来源, '微信')
  assert.equal(rows[1].一级分类, '餐饮消费')
  assert.equal(rows[1].二级分类, '咖啡奶茶')
  assert.equal(rows[1].消费性质, '弹性')
  assert.equal(rows[1].分类依据, '手动修改')
})

test('summarizes cleaned rows by month and category', () => {
  const summary = buildMonthlySummaryRows([
    { 月份: '2026-07', 一级分类: '交通出行', 二级分类: '地铁公交', 流出金额: 8, 合并笔数: 1 },
    { 月份: '2026-07', 一级分类: '交通出行', 二级分类: '地铁公交', 流出金额: 12.5, 合并笔数: 2 },
  ])

  assert.deepEqual(summary, [{
    月份: '2026-07',
    一级分类: '交通出行',
    二级分类: '地铁公交',
    笔数: 3,
    支出金额: 20.5,
  }])
})

test('summarizes income, refunds, expenses and net cashflow separately', () => {
  const summary = buildCashflowSummaryRows([
    { 月份: '2026-07', 类型: '收入', 流入金额: 5000, 流出金额: 0, 净额: 5000, 合并笔数: 1 },
    { 月份: '2026-07', 类型: '退款', 流入金额: 30, 流出金额: 0, 净额: 30, 合并笔数: 1 },
    { 月份: '2026-07', 类型: '支出', 流入金额: 0, 流出金额: 200, 净额: -200, 合并笔数: 1 },
  ])
  assert.deepEqual(summary, [{ 月份: '2026-07', 收入: 5000, 退款: 30, 支出: 200, 净现金流: 4830, 流水笔数: 3 }])
})

test('applies edited income fields and amount to detail and cashflow summary', () => {
  const income = {
    date: new Date(2026, 6, 25, 9, 30),
    direction: 'income',
    name: '入账',
    merchant: '原交易对方',
    productName: '原收入项目',
    details: '原备注',
    amount: 5000,
    source: 'bank',
  }
  const rows = buildTransactionExportRows([income], {
    [txKey(income)]: {
      editedName: '7月工资',
      editedMerchant: '测试公司',
      editedProductName: '工资与津贴',
      editedDetails: '2026年7月工资',
      editedAmount: 5800,
    },
  })

  assert.equal(rows[0].名称, '7月工资')
  assert.equal(rows[0].交易对象, '测试公司')
  assert.equal(rows[0].具体商品或服务, '工资与津贴')
  assert.equal(rows[0].交易详情, '2026年7月工资')
  assert.equal(rows[0].流入金额, 5800)
  assert.deepEqual(buildCashflowSummaryRows(rows), [{
    月份: '2026-07', 收入: 5800, 退款: 0, 支出: 0, 净现金流: 5800, 流水笔数: 1,
  }])
})

test('applies an edited transaction direction to exports and cashflow totals', () => {
  const transfer = {
    date: new Date(2026, 6, 26, 10, 15),
    direction: 'transfer',
    name: '信用卡还款',
    amount: 1200,
    source: 'bank',
  }
  const rows = buildTransactionExportRows([transfer], {
    [txKey(transfer)]: {
      editedDirection: 'expense',
      catKey: 'daily',
      subKey: 'household',
      tags: ['rigid'],
    },
  })

  assert.equal(rows[0].类型, '支出')
  assert.equal(rows[0].流入金额, 0)
  assert.equal(rows[0].流出金额, 1200)
  assert.equal(rows[0].净额, -1200)
  assert.deepEqual(buildCashflowSummaryRows(rows), [{
    月份: '2026-07', 收入: 0, 退款: 0, 支出: 1200, 净现金流: -1200, 流水笔数: 1,
  }])
})

test('creates detail and summary worksheets', () => {
  const workbook = buildExportWorkbook(transactions)
  assert.deepEqual(workbook.SheetNames, EXPORT_SHEET_NAMES)
  assert.ok(workbook.Sheets['完整流水']['!autofilter'])
  assert.ok(workbook.Sheets['月度收支汇总']['!autofilter'])

  const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' })
  const reopened = XLSX.read(buffer, { type: 'buffer' })
  const rows = XLSX.utils.sheet_to_json(reopened.Sheets['完整流水'])
  assert.equal(rows.length, 2)
  assert.equal(rows[0].名称, '苏州地铁')
  assert.equal(rows[1].流出金额, 32)
})

test('keeps the adjusted May template headers even when optional sheets are empty', () => {
  const workbook = buildExportWorkbook(transactions)
  for (const sheetName of EXPORT_SHEET_NAMES) {
    const header = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1 })[0]
    assert.deepEqual(header, EXPORT_HEADERS[sheetName])
  }
  assert.equal(XLSX.utils.sheet_to_json(workbook.Sheets['截图识别明细']).length, 0)
  assert.equal(XLSX.utils.sheet_to_json(workbook.Sheets['合并原始明细']).length, 0)
})

test('adds screenshot detail worksheet when a receipt was matched', () => {
  const workbook = buildExportWorkbook([{
    ...transactions[0],
    direction: 'expense',
    screenshotFile: 'order.png',
    screenshotConfidence: 0.96,
    receiptMatch: { status: 'matched-enriched', score: 90 },
    itemNames: ['冰摇柠檬茶'],
  }])
  assert.ok(workbook.SheetNames.includes('截图识别明细'))
  const rows = XLSX.utils.sheet_to_json(workbook.Sheets['截图识别明细'])
  assert.equal(rows[0].具体商品或服务, '冰摇柠檬茶')
  assert.equal(rows[0].匹配状态, 'matched-enriched')
})
