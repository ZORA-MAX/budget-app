import test from 'node:test'
import assert from 'node:assert/strict'

import * as XLSX from 'xlsx'
import { parseCSV, parseExcel } from '../src/lib/csv-parser.js'

test('keeps WeChat income, refunds, failed rows, full time and raw fields', () => {
  const csv = [
    '微信支付账单明细',
    '交易时间,交易类型,交易对方,商品,收/支,金额(元),支付方式,当前状态,交易单号',
    '2026-07-18 12:30:45,转账,张三,工资,收入,5000.00,零钱,已入账,wx-income',
    '2026-07-19 09:15:00,商户消费,某商店,床单,支出,88.80,银行卡,已全额退款,wx-refund',
    '2026-07-20 10:00:00,商户消费,某商店,水杯,支出,20.00,零钱,支付失败,wx-failed',
  ].join('\n')

  const rows = parseCSV(csv)
  assert.equal(rows.length, 3)
  assert.equal(rows[0].direction, 'income')
  assert.equal(rows[0].signedAmount, 5000)
  assert.equal(rows[0].date.getSeconds(), 45)
  assert.equal(rows[0].rawFields['交易单号'], 'wx-income')
  assert.equal(rows[1].direction, 'expense')
  assert.equal(rows[1].signedAmount, -88.8)
  assert.equal(rows[2].isEffective, false)
  assert.equal(rows[2].signedAmount, 0)
})

test('recognizes generic bank debit and credit columns', () => {
  const csv = [
    '交易日期,交易摘要,借方金额,贷方金额,余额,流水号',
    '2026-07-21 08:00:00,便利店,35.50,,9964.50,bank-1',
    '2026-07-22 18:00:00,工资入账,,10000.00,19964.50,bank-2',
  ].join('\n')
  const rows = parseCSV(csv)
  assert.equal(rows.length, 2)
  assert.equal(rows[0].source, 'bank')
  assert.equal(rows[0].direction, 'expense')
  assert.equal(rows[0].balance, 9964.5)
  assert.equal(rows[1].direction, 'income')
  assert.equal(rows[1].transactionId, 'bank-2')
})

test('reads transactions from every Excel worksheet', () => {
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
    ['交易日期', '交易摘要', '借方金额', '贷方金额'],
    ['2026-07-01 09:00:00', '早餐', 15, ''],
  ]), '银行卡支出')
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
    ['交易日期', '交易摘要', '借方金额', '贷方金额'],
    ['2026-07-02 18:00:00', '工资', '', 8000],
  ]), '银行卡收入')
  const array = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' })
  const rows = parseExcel(array)
  assert.equal(rows.length, 2)
  assert.equal(rows[0].sheetName, '银行卡支出')
  assert.equal(rows[1].sheetName, '银行卡收入')
  assert.equal(rows[1].direction, 'income')
})

test('prefers the skill webpage import sheet and preserves reconciled evidence fields', () => {
  const workbook = XLSX.utils.book_new()
  const confirmed = XLSX.utils.json_to_sheet([{
    完整时间: '2026-07-18 14:35:20',
    类型: '支出',
    金额: 39.9,
    币种: 'CNY',
    交易对象: '测试商家',
    具体商品或服务: '蓝牙耳机保护套',
    商品清单: '蓝牙耳机保护套、挂绳',
    平台: '拼多多',
    来源: '支付宝账单',
    状态: '交易成功',
    是否计入收支: '是',
    支付方式: '花呗',
    订单号: '001234',
    截图文件: 'order.png',
    匹配状态: '精确匹配',
    匹配依据: '订单号与金额一致',
    识别置信度: 0.98,
    证据ID: 'EV-001',
  }])
  const pending = XLSX.utils.json_to_sheet([{
    完整时间: '2026-07-18 14:35:20',
    类型: '支出',
    金额: 39.9,
    具体商品或服务: '不应导入的候选记录',
    匹配状态: '待复核',
  }])
  XLSX.utils.book_append_sheet(workbook, confirmed, '网页导入流水')
  XLSX.utils.book_append_sheet(workbook, pending, '待复核')

  const rows = parseExcel(XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }))
  assert.equal(rows.length, 1)
  assert.equal(rows[0].productName, '蓝牙耳机保护套')
  assert.equal(rows[0].merchant, '测试商家')
  assert.equal(rows[0].platform, '拼多多')
  assert.equal(rows[0].source, 'alipay')
  assert.equal(rows[0].orderId, '001234')
  assert.deepEqual(rows[0].itemNames, ['蓝牙耳机保护套', '挂绳'])
  assert.equal(rows[0].evidenceId, 'EV-001')
})


test('keeps explicit original payments separate from actual refunds and imports reviewed net fields', () => {
  const csv = [
    '完整时间,类型,金额,交易对象,具体商品或服务,状态,是否计入收支,一级分类,二级分类,消费性质,匹配状态,净消费,是否计入消费,现金流影响',
    '2026-09-01 10:00:00,支出,100,商家,衣服,交易关闭（已付款后全退）,是,形象管理,服装,弹性,已核验,0,是,-100',
    '2026-09-02 10:00:00,退款,100,商家,衣服退款,成功,是,,,,已核验,0,否,100',
    '2026-09-03 10:00:00,资金流转,2702.02,银行,借款本金还款,成功,是,资金流转,借还款,非消费,已核验,0,否,-2702.02',
  ].join('\n')
  const rows = parseCSV(csv)
  assert.equal(rows.length, 3)
  assert.equal(rows[0].direction, 'expense')
  assert.equal(rows[0].isEffective, true)
  assert.equal(rows[0].amount, 100)
  assert.equal(rows[0].netConsumption, 0)
  assert.deepEqual(rows[0].importedClassification, { categoryLabel: '形象管理', subcategoryLabel: '服装', tagLabels: '弹性' })
  assert.equal(rows[1].direction, 'refund')
  assert.equal(rows[2].includeInConsumption, false)
  assert.equal(rows[2].cashflowImpact, -2702.02)
})


test('raw-provider refund credits use refund type without relabeling the original payment', () => {
  const wechat = [
    '微信支付账单明细',
    '交易时间,交易类型,交易对方,商品,收/支,金额(元),当前状态',
    '2026-09-01 10:00:00,商户消费,商户,衣服,支出,100,已全额退款',
    '2026-09-02 10:00:00,商户消费退款,商户,衣服,收入,100,退款成功',
  ].join('\n')
  assert.deepEqual(parseCSV(wechat).map(tx => tx.direction), ['expense', 'refund'])
  const alipay = [
    '支付宝交易明细',
    '交易时间,交易对方,商品说明,收/支,金额,交易状态,类型',
    '2026-09-01 10:00:00,商户,衣服,支出,100,退款成功,消费',
    '2026-09-02 10:00:00,商户,衣服退款,收入,100,成功,退款',
  ].join('\n')
  assert.deepEqual(parseCSV(alipay).map(tx => tx.direction), ['expense', 'refund'])
})

test('reviewed ledger net-inclusion amount applies only to expenses', () => {
  const csv = [
    '完整时间,类型,金额,交易对象,具体商品或服务,状态,是否计入收支,匹配状态,净计入金额',
    '2026-09-01 10:00:00,支出,100,商户,衣服,成功,是,已核验,60',
    '2026-09-02 10:00:00,收入,500,公司,工资,成功,是,已核验,500',
  ].join('\n')
  const rows = parseCSV(csv)
  assert.equal(rows[0].netConsumption, 60)
  assert.equal(rows[1].netConsumption, undefined)
  assert.equal(rows[1].amount, 500)
})
