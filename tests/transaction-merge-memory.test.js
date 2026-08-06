import test from 'node:test'
import assert from 'node:assert/strict'
import { applyTransactionMergeMemory } from '../src/lib/transaction-merge-memory.js'
import { fmtMoney } from '../src/lib/csv-parser.js'

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

test('merges recurring Meituan bike pay-later charges into one transport record', () => {
  const result = applyTransactionMergeMemory([
    tx('2026-07-30', '美团 先骑后付', 1),
    tx('2026-07-29', '美团单车·先骑后付', 2.5),
    tx('2026-07-27', '美团 共享单车 先骑后付', 1.5),
    tx('2026-07-24', '美团外卖', 22),
  ])

  assert.equal(result.length, 2)
  const merged = result.find(item => item.mergeMemory?.ruleId === 'meituan-bike-pay-later')
  assert.equal(merged.name, '交通')
  assert.equal(merged.amount, 5)
  assert.equal(merged.mergeMemory.count, 3)
  assert.deepEqual(merged.mergeMemory.details.map(item => item.date), ['2026-07-30', '2026-07-29', '2026-07-27'])
  assert.deepEqual(merged.mergeMemory.details.map(item => item.amount), [1, 2.5, 1.5])
  assert.deepEqual(merged.mergeMemory.classification, {
    catKey: 'transport',
    subKey: 'bike',
    tags: ['rigid', 'fixed', 'efficiency'],
  })
})

test('keeps subway and bike merge memories as separate detail groups', () => {
  const result = applyTransactionMergeMemory([
    tx('2026-07-30', '美团 先骑后付', 1),
    tx('2026-07-30', '苏州支付小程序自动充值', 3),
  ])

  assert.equal(result.length, 2)
  assert.deepEqual(
    result.map(item => item.mergeMemory.classification.subKey).sort(),
    ['bike', 'metro_bus'],
  )
})

test('combines Hello Bike and Meituan rides into the same bike travel record', () => {
  const result = applyTransactionMergeMemory([
    tx('2026-07-30', '美团 先骑后付', 2.5),
    tx('2026-07-29', '哈啰助力车骑行', 1),
    tx('2026-07-27', '哈啰单车骑行订单', 3),
    tx('2026-07-26', '哈啰出行月卡', 12),
  ])

  assert.equal(result.length, 2)
  const merged = result.find(item => item.mergeMemory?.label === '共享单车出行')
  assert.equal(merged.name, '交通')
  assert.equal(merged.amount, 6.5)
  assert.equal(merged.mergeMemory.count, 3)
  assert.deepEqual(merged.mergeMemory.details.map(item => item.amount), [2.5, 1, 3])
  assert.equal(merged.mergeMemory.classification.subKey, 'bike')
  assert.equal(result.find(item => item.name === '哈啰出行月卡').amount, 12)
})

test('preserves decimal transaction amounts in detail labels', () => {
  assert.equal(fmtMoney(1), '¥1')
  assert.equal(fmtMoney(2.5), '¥2.50')
  assert.equal(fmtMoney(12.34), '¥12.34')
})
