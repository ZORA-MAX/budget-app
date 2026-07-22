import test from 'node:test'
import assert from 'node:assert/strict'
import {
  analysisRowsToMemoryRecords,
  classificationMemoryKey,
  mergeMemoryRecord,
  normalizeMemoryName,
  recallClassification,
} from '../src/lib/classification-memory.js'
import { resolveClassification } from '../src/lib/classifier.js'
import { matchPersonalPolicy } from '../src/lib/personal-policy.js'

test('normalizes changing order metadata without losing merchant identity', () => {
  assert.equal(
    normalizeMemoryName('某商户 商户订单号：178538285083789312006121 微信支付'),
    '某商户',
  )
})

test('keeps income and expense memories separate', () => {
  const expense = classificationMemoryKey({ name: '同一对象', flowType: 'expense' })
  const income = classificationMemoryKey({ name: '同一对象', flowType: 'income' })
  assert.notEqual(expense, income)
})

test('last explicit correction wins and increases evidence count', () => {
  const tx = { name: '测试网络超市', flowType: 'expense' }
  const first = mergeMemoryRecord(null, tx, { catKey: 'daily', subKey: 'online_grocery', tags: ['rigid'] }, '2026-06-01T00:00:00.000Z')
  const second = mergeMemoryRecord(first, tx, { catKey: 'daily', subKey: 'online_grocery', tags: ['rigid', 'improve'] }, '2026-06-02T00:00:00.000Z')
  assert.equal(second.count, 2)
  assert.deepEqual(second.tags, ['rigid', 'improve'])
  assert.equal(recallClassification(tx, { [second.key]: second }), second)
})

test('imports edited analysis rows only', () => {
  const memory = analysisRowsToMemoryRecords({ transactions: [
    { name: '需学习', flowType: 'expense', edited: true, date: '2026-06-02', category: { key: 'food' }, subcategory: { key: 'coffee' }, tags: [{ key: 'elastic' }] },
    { name: '不学习', flowType: 'expense', edited: false, category: { key: 'other' }, subcategory: { key: 'unknown' }, tags: [] },
  ] })
  assert.equal(Object.keys(memory).length, 1)
  assert.deepEqual(Object.values(memory)[0].tags, ['elastic'])
})

test('privacy-safe policy captures repeated category preferences', () => {
  assert.deepEqual(matchPersonalPolicy({ name: '香蕉攀岩周末票', flowType: 'expense' }), {
    catKey: 'sport',
    subKey: 'outdoor',
    tags: ['emotion', 'entertainment'],
    ruleId: 'outdoor-experience',
  })
})

test('manual override outranks local memory and personal policy', () => {
  const tx = { name: '房租', flowType: 'expense' }
  const key = classificationMemoryKey(tx)
  const memory = { [key]: { key, catKey: 'housing', subKey: 'rent', tags: ['rigid', 'fixed'] } }
  const override = { catKey: 'other', subKey: 'unknown', tags: ['pending'] }
  assert.deepEqual(resolveClassification(tx, override, memory), { ...override, source: 'override' })
})
