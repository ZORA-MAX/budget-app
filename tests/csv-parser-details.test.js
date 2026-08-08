import test from 'node:test'
import assert from 'node:assert/strict'

import { parseCSV } from '../src/lib/csv-parser.js'

test('keeps WeChat merchant, product and useful transaction details separate', () => {
  const csv = [
    '微信支付账单明细',
    '交易时间,交易类型,交易对方,商品,收/支,金额(元),支付方式,当前状态,备注',
    '2026-07-18 12:30:00,商户消费,星巴克,冰摇柠檬茶,支出,32.00,零钱,支付成功,朋友聚会',
  ].join('\n')

  const [tx] = parseCSV(csv)
  assert.equal(tx.name, '星巴克 冰摇柠檬茶')
  assert.equal(tx.merchant, '星巴克')
  assert.equal(tx.productName, '冰摇柠檬茶')
  assert.equal(tx.details, '商户消费 · 零钱 · 朋友聚会')
})

test('keeps Alipay merchant, product and notes available for display and analysis', () => {
  const csv = [
    '支付宝交易记录',
    '交易时间,类型,交易对方,商品名称,收/支,金额,交易状态,交易来源地,备注',
    '2026-07-19 09:00:00,即时到账交易,盒马鲜生,有机牛奶 2 瓶,支出,58.60,交易成功,支付宝,家庭早餐',
  ].join('\n')

  const [tx] = parseCSV(csv)
  assert.equal(tx.name, '盒马鲜生 有机牛奶 2 瓶')
  assert.equal(tx.merchant, '盒马鲜生')
  assert.equal(tx.productName, '有机牛奶 2 瓶')
  assert.equal(tx.details, '即时到账交易 · 支付宝 · 家庭早餐')
})
