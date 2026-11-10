import test from 'node:test'
import assert from 'node:assert/strict'
import { localFinancialSummary, localFinancialInsight } from '../src/lib/financial-summary.js'

const categories = [
  { cat: { key: 'housing', label: '居住生活' }, total: 800, count: 1, subs: [{ sub: { key: 'rent' }, total: 800 }] },
  { cat: { key: 'other', label: '其他异常' }, total: 200, count: 20, subs: [{ sub: { key: 'unknown' }, total: 200 }] },
]

test('local summary reports amounts and pending categories without inventing frequency or trend causes', () => {
  const text = localFinancialSummary(categories, 1000, '2026-10')
  assert.match(text, /原单净消费/)
  assert.match(text, /21 笔/)
  assert.match(text, /80%/)
  assert.match(text, /待分类/)
  assert.doesNotMatch(text, /上升|零散|控制|多花|少花/)
  assert.doesNotMatch(localFinancialInsight(categories, 1000), /上升|零散|控制/)
})

test('unreviewed legacy amounts are never described as fully verified net consumption', () => {
  const text = localFinancialSummary(categories, 1000, '2026-10', 2)
  assert.match(text, /含未核退款/)
  assert.doesNotMatch(text, /按总账核验/)
})
