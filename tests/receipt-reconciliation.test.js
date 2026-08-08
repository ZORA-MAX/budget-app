import test from 'node:test'
import assert from 'node:assert/strict'

import { chooseDetailedProduct, normalizeReceiptTransactions, reconcileReceiptTransactions } from '../src/lib/receipt-reconciliation.js'

test('prefers concrete screenshot item names over vague platform labels', () => {
  assert.equal(chooseDetailedProduct({ productName: '拼多多先用后付', itemNames: ['新疆长绒棉床单 1.8m'] }), '新疆长绒棉床单 1.8m')
  assert.equal(chooseDetailedProduct({ productName: '平台商户', itemNames: [] }), '')
})

test('enriches a bill only when amount, time and platform or merchant align', () => {
  const bill = [{
    date: new Date('2026-07-19T09:00:00+08:00'),
    name: '拼多多先用后付',
    merchant: '拼多多先用后付',
    productName: '',
    amount: 88.8,
    direction: 'expense',
    source: 'wechat',
    platform: 'wechat',
  }]
  const receipts = normalizeReceiptTransactions([{
    date: '2026-07-19T10:00:00+08:00',
    amount: 88.8,
    direction: 'expense',
    platform: '拼多多',
    merchant: '棉品家居店',
    productName: '拼多多先用后付',
    itemNames: ['新疆长绒棉床单 1.8m'],
    confidence: 0.96,
  }], 'order.png')

  const result = reconcileReceiptTransactions(bill, receipts)
  assert.equal(result.matches.length, 1)
  assert.equal(result.transactions.length, 1)
  assert.equal(result.transactions[0].productName, '新疆长绒棉床单 1.8m')
  assert.equal(result.transactions[0].merchant, '棉品家居店')
  assert.equal(result.transactions[0].receiptMatch.status, 'matched-enriched')
})

test('keeps an unmatched screenshot as a reviewable standalone transaction', () => {
  const receipt = normalizeReceiptTransactions([{
    date: '2026-07-19T10:00:00+08:00', amount: 99, platform: '淘宝', merchant: '生活馆', itemNames: ['玻璃水杯'],
  }], 'unmatched.png')
  const result = reconcileReceiptTransactions([], receipt)
  assert.equal(result.matches.length, 0)
  assert.equal(result.transactions[0].source, 'screenshot')
  assert.equal(result.transactions[0].productName, '玻璃水杯')
  assert.equal(result.transactions[0].receiptMatch.status, 'unmatched')
})
