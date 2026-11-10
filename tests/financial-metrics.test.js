import test from 'node:test'
import assert from 'node:assert/strict'
import { txKey } from '../src/lib/csv-parser.js'
import { consumptionAmount, financialMetrics, transactionOverride } from '../src/lib/financial-metrics.js'
import { summarizeByCategory, resolveClassification } from '../src/lib/classifier.js'
import { buildTransactionExportRows, buildCashflowSummaryRows } from '../src/lib/export-transactions.js'
import { validateDebtLedger, saveDebtLedger, loadDebtLedger } from '../src/lib/debt-ledger.js'

const date = new Date('2026-09-01T10:00:00+08:00')
const purchase = { date, name: '衣服', amount: 100, netConsumption: 70, direction: 'expense', isEffective: true }

test('partial and full refunds keep gross cashflow distinct from original-order net consumption', () => {
  const txs = [purchase, { date, name: '实际退款', amount: 30, direction: 'refund' },
    { date, name: '已全退原付款', amount: 50, netConsumption: 0, direction: 'expense', isEffective: true },
    { date, name: '实际全额退款', amount: 50, direction: 'refund' }]
  const before = JSON.stringify(txs)
  assert.deepEqual(financialMetrics(txs), { consumption: 70, grossExpense: 150, income: 0, refund: 80, cashflow: -70, unreviewedCount: 0 })
  assert.equal(summarizeByCategory(txs).reduce((sum, cat) => sum + cat.total, 0), 70)
  const exported = buildTransactionExportRows(txs)
  assert.equal(exported.find(row => row.名称 === '衣服').金额, 100)
  assert.equal(exported.find(row => row.名称 === '衣服').净消费, 70)
  assert.equal(buildCashflowSummaryRows(exported)[0].净现金流, -70)
  assert.equal(JSON.stringify(txs), before)
})

test('unmatched refunds affect cashflow without inventing a category allocation', () => {
  const metrics = financialMetrics([purchase, { date, name: '待关联退款', amount: 60, direction: 'refund' }])
  assert.equal(metrics.consumption, 70)
  assert.equal(metrics.cashflow, -40)
})

test('external loan principal repayments reduce cashflow but never consumption', () => {
  const debt = { date, name: '偿债本金', amount: 2702.02, direction: 'transfer', includeInConsumption: false, cashflowImpact: -2702.02 }
  const metrics = financialMetrics([debt])
  assert.equal(metrics.consumption, 0)
  assert.equal(metrics.cashflow, -2702.02)
  assert.equal(buildCashflowSummaryRows(buildTransactionExportRows([debt]))[0].净现金流, -2702.02)
})

test('legacy amounts remain unchanged and are explicitly counted as unreviewed', () => {
  const legacy = { date, name: '历史消费', amount: 120, recordId: 'old-row' }
  const override = { catKey: 'fashion', subKey: 'clothes', tags: ['elastic'], editedAmount: 90 }
  const overrides = { [`${date.toISOString()}_120_历史消费_old-row`]: override }
  assert.equal(transactionOverride(legacy, overrides), override)
  assert.equal(financialMetrics([legacy], overrides).consumption, 90)
  assert.equal(financialMetrics([legacy], overrides).unreviewedCount, 1)
  assert.equal(summarizeByCategory([legacy], overrides)[0].total, 90)
})

test('corrected payment amount preserves its verified refund offset', () => {
  assert.equal(consumptionAmount(purchase, { editedAmount: 120 }), 90)
  assert.equal(consumptionAmount(purchase, { editedDirection: 'transfer' }), 0)
  assert.equal(consumptionAmount({ ...purchase, isEffective: false }), 0)
})

test('debt ledger validates balances and keeps schedules separate from transactions', () => {
  const ledger = { version: 1, asOf: '2026-11-10', items: [{ id: 'example', title: '示例贷款', originalPrincipal: 300, unbilledPrincipal: 200, payments: [{ date: '2026-11-10', amount: 100 }], schedule: [{ period: 2, amount: 100, status: '计划' }] }] }
  assert.equal(validateDebtLedger(ledger), ledger)
  assert.throws(() => validateDebtLedger({ ...ledger, items: [{ id: 'x', title: '错误', originalPrincipal: -1 }] }))
  assert.throws(() => validateDebtLedger({ ...ledger, items: [ledger.items[0], ledger.items[0]] }))
  const values = new Map()
  globalThis.window = { localStorage: { getItem: key => values.get(key) || null, setItem: (key, value) => values.set(key, value) } }
  try { saveDebtLedger(ledger); assert.deepEqual(loadDebtLedger(), ledger) } finally { delete globalThis.window }
})


test('stable transaction keys distinguish identical zero-amount source rows without changing legacy keys', () => {
  const base = { date, name: '重复展示名称', amount: 0, direction: 'expense' }
  assert.equal(txKey(base), `${date.toISOString()}_0_重复展示名称`)
  const first = { ...base, stableKey: '2026-09:EV-1' }
  const second = { ...base, stableKey: '2026-09:EV-2' }
  assert.notEqual(txKey(first), txKey(second))
  const overrides = { [txKey(first)]: { catKey: 'food', subKey: 'takeout' }, [txKey(second)]: { catKey: 'fashion', subKey: 'clothes' } }
  assert.equal(transactionOverride(first, overrides).catKey, 'food')
  assert.equal(transactionOverride(second, overrides).catKey, 'fashion')
})


test('saving an unchanged transfer direction preserves external repayment cashflow', () => {
  const tx = { date, name: '外部偿债', amount: 200, direction: 'transfer', cashflowImpact: -200, includeInConsumption: false, stableKey: 'debt-record' }
  const overrides = { 'debt-record': { editedDirection: 'transfer', editedAmount: 210 } }
  assert.equal(financialMetrics([tx], overrides).cashflow, -210)
  overrides['debt-record'].editedDirection = 'income'
  assert.equal(financialMetrics([tx], overrides).cashflow, 210)
})


test('imported automatic annotations are not presented as manual user decisions', () => {
  const automatic = { catKey: 'fashion', subKey: 'clothes', tags: ['elastic'], annotationSource: '自动标注或继承原账分类，详见classificationBasis' }
  assert.equal(resolveClassification(purchase, automatic).source, 'auto-annotation')
  assert.equal(resolveClassification(purchase, { ...automatic, annotationSource: 'manual' }).source, 'override')
  assert.equal(resolveClassification(purchase, { catKey: 'fashion', subKey: 'clothes' }).source, 'override')
  const overrides = { [txKey(purchase)]: automatic }
  assert.equal(buildTransactionExportRows([purchase], overrides)[0].分类依据, '自动标注')
})
