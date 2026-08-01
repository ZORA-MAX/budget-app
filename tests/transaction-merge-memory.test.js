import test from 'node:test'
import assert from 'node:assert/strict'
import { applyTransactionMergeMemory } from '../src/lib/transaction-merge-memory.js'

function tx(date, name, amount) {
  const [year, month, day] = date.split('-').map(Number)
  return { date: new Date(year, month - 1, day), name, amount, source: 'wechat' }
}

test('merges recurring Suzhou mini-program recharge names into one transport record', () => {
  const result = applyTransactionMergeMemory([
    tx('2026-07-28', '苏州支付宝小程序自动充值', 3),
    tx('2026-07-27', '苏州支付 · 地铁小程序自动充值', 3),
    tx('2026-07-25', '苏州出行小程序自动充值', 4),
    tx('2026-07-24', '普通午餐', 18),
  ])

  assert.equal(result.length, 2)
  const merged = result.find(item => item.name === '交通')
  assert.equal(merged.amount, 10)
  assert.equal(merged.mergeMemory.count, 3)
  assert.deepEqual(merged.mergeMemory.details.map(item => item.date), ['2026-07-28', '2026-07-27', '2026-07-25'])
  assert.deepEqual(merged.mergeMemory.details.map(item => item.amount), [3, 3, 4])
  assert.deepEqual(merged.mergeMemory.classification, {
    catKey: 'transport',
    subKey: 'metro_bus',
    tags: ['rigid', 'fixed', 'efficiency'],
  })
})

test('keeps merge-memory records separate across months', () => {
  const result = applyTransactionMergeMemory([
    tx('2026-07-31', '苏州支付小程序自动充值', 3),
    tx('2026-08-01', '苏州支付小程序自动充值', 4),
  ])

  assert.equal(result.length, 2)
  assert.deepEqual(result.map(item => item.amount), [4, 3])
  assert.ok(result.every(item => item.mergeMemory.count === 1))
})
