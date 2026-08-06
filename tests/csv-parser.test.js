import test from 'node:test'
import assert from 'node:assert/strict'
import * as XLSX from 'xlsx'
import { parseExcel } from '../src/lib/csv-parser.js'

function workbookBuffer(rows, sheetName = '完整流水') {
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows), sheetName)
  return XLSX.write(workbook, { type: 'array', bookType: 'xlsx' })
}

test('parses the consolidated review workbook and preserves product and classification fields', () => {
  const transactions = parseExcel(workbookBuffer([
    {
      完整时间: '2026-05-08 12:30:00',
      类型: '支出',
      金额: '29.90',
      交易对象: '拼多多平台商户',
      具体商品或服务: '便携咖啡杯',
      商品清单: '双层不锈钢咖啡杯 1个',
      平台: '拼多多',
      是否计入收支: '是',
      一级分类: '日用消耗',
      二级分类: '生活小物',
      消费性质: '刚需、改善',
      备注: '旅行使用',
    },
    { 完整时间: '2026-05-09', 类型: '收入', 金额: '100', 交易对象: '退款', 平台: '支付宝' },
    { 完整时间: '2026-05-10', 类型: '支出', 金额: '9.9', 交易对象: '不计入项目', 是否计入收支: '否' },
    { 完整时间: '', 类型: '支出', 金额: '6.8', 交易对象: '日期待核对商品', 平台: '银行卡账单', 备注: '原截图未显示日期' },
  ]))

  assert.equal(transactions.length, 2)
  assert.equal(transactions[0].source, 'pdd')
  assert.match(transactions[0].name, /双层不锈钢咖啡杯/)
  assert.equal(transactions[0].note, '旅行使用')
  assert.deepEqual(transactions[0].importedClassification, {
    categoryLabel: '日用消耗',
    subcategoryLabel: '生活小物',
    tagLabels: '刚需、改善',
  })
  assert.equal(transactions[1].date.getFullYear(), 2026)
  assert.equal(transactions[1].date.getMonth(), 4)
})

test('uses the reviewed name column when present', () => {
  const [transaction] = parseExcel(workbookBuffer([
    {
      完整时间: '2026-05-12',
      类型: '支出',
      金额: 18,
      名称: '瑞幸咖啡',
      交易对象: '原始支付对象',
      平台: '微信',
      一级分类: '餐饮消费',
      二级分类: '咖啡奶茶',
      消费性质: '弹性',
    },
  ], '网页导入流水'))

  assert.equal(transaction.name, '瑞幸咖啡')
  assert.equal(transaction.source, 'wechat')
})
