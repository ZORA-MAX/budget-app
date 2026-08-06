import { useEffect, useMemo, useState } from 'react'
import { summarizeByCategory } from '../lib/classifier'
import { groupByMonth, fmtMoney, txKey } from '../lib/csv-parser'
import { classify } from '../lib/classifier'
import { getCategoryByKey, TAG_MAP } from '../lib/categories'
import CategoryChart from './CategoryChart'
import CategoryBreakdown from './CategoryBreakdown'
import TopTransactions from './TopTransactions'
import TrendChart from './TrendChart'
import AISummary from './AISummary'
import { MiniAIInsight } from './AISummary'
import TransactionList from './TransactionList'
import DimensionBar from './DimensionBar'

export default function Dashboard({ transactions, overrides = {}, onOverride, onDelete, onAdd }) {
  const monthlyMap = useMemo(() => groupByMonth(transactions), [transactions])
  const monthKeys = useMemo(() => Object.keys(monthlyMap).sort().reverse(), [monthlyMap])
  const [selectedMonth, setSelectedMonth] = useState(monthKeys[0] || '')
  const [activeTab, setActiveTab] = useState('overview')

  useEffect(() => {
    if (!monthKeys.includes(selectedMonth)) setSelectedMonth(monthKeys[0] || '')
  }, [monthKeys, selectedMonth])

  const txs = useMemo(() => monthlyMap[selectedMonth] || [], [monthlyMap, selectedMonth])
  const byCat = useMemo(() => summarizeByCategory(txs, overrides), [txs, overrides])
  const total = useMemo(() => txs.reduce((s, t) => s + t.amount, 0), [txs])

  const prevKey = monthKeys[monthKeys.indexOf(selectedMonth) + 1]
  const prevTotal = prevKey ? (monthlyMap[prevKey] || []).reduce((s, t) => s + t.amount, 0) : 0
  const diff = total - prevTotal

  // Per-transaction tag totals
  const tagTotals = useMemo(() => {
    const map = {}
    for (const tx of txs) {
      const key = txKey(tx)
      const ov = overrides[key]
      const { catKey } = ov || classify(tx.name, tx.originalCategory)
      const tags = ov?.tags || getCategoryByKey(catKey).defaultTags || []
      const share = tx.amount / (tags.length || 1)
      for (const t of tags) {
        if (!map[t]) map[t] = 0
        map[t] += share
      }
    }
    return map
  }, [txs, overrides])

  const monthlyTotals = useMemo(() =>
    monthKeys.slice().reverse().map(k => ({
      label: k.split('-')[1] + '月',
      total: (monthlyMap[k] || []).reduce((s, t) => s + t.amount, 0)
    })),
  [monthKeys, monthlyMap])

  if (txs.length === 0) return null

  return (
    <div className="space-y-4">
      {monthKeys.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
          {monthKeys.map(k => {
            const [y, m] = k.split('-')
            return (
              <button key={k} onClick={() => setSelectedMonth(k)}
                className={`flex-shrink-0 px-4 py-1.5 rounded-full text-sm border transition-colors
                  ${k === selectedMonth ? 'border-brand text-brand bg-brand-faint font-medium' : 'border-gray-200 dark:border-gray-700 text-ink-secondary bg-white dark:bg-surface-card-dark'}`}>
                {y}年{parseInt(m)}月
              </button>
            )
          })}
        </div>
      )}

      {/* Single metric: total spending + dimension bar */}
      <div className="bg-white dark:bg-surface-card-dark rounded-xl p-4">
        <div className="text-xs text-ink-secondary">本月总支出</div>
        <div className="text-3xl font-semibold text-ink dark:text-white mt-1">{fmtMoney(total)}</div>
        {prevTotal > 0 && (
          <div className={`text-xs mt-1 ${diff > 0 ? 'text-red-500' : 'text-green-600'}`}>
            {diff > 0 ? '↑' : '↓'} 比上月{diff > 0 ? '多' : '少'} {fmtMoney(Math.abs(diff))}
          </div>
        )}
        <MiniAIInsight byCat={byCat} total={total} diff={diff} />
      </div>

      {/* Tab switch */}
      <div className="flex gap-2">
        <button onClick={() => setActiveTab('overview')}
          className={`flex-1 py-2 rounded-xl text-sm font-medium transition-colors
            ${activeTab === 'overview' ? 'bg-brand text-white' : 'bg-white dark:bg-surface-card-dark text-ink-secondary border border-gray-200 dark:border-gray-700'}`}>
          📊 总览
        </button>
        <button onClick={() => setActiveTab('transactions')}
          className={`flex-1 py-2 rounded-xl text-sm font-medium transition-colors
            ${activeTab === 'transactions' ? 'bg-brand text-white' : 'bg-white dark:bg-surface-card-dark text-ink-secondary border border-gray-200 dark:border-gray-700'}`}>
          📋 逐笔明细
        </button>
      </div>

      {activeTab === 'overview' ? (
        <>
          <DimensionBar tagTotals={tagTotals} total={total} />
          {monthlyTotals.length >= 2 && <TrendChart data={monthlyTotals} />}
          <div className="bg-white dark:bg-surface-card-dark rounded-xl p-4">
            <div className="text-xs font-medium text-ink-secondary uppercase tracking-wider mb-3">支出分类</div>
            <CategoryChart byCat={byCat} />
          </div>
          <CategoryBreakdown byCat={byCat} total={total} />
          <TopTransactions transactions={txs} overrides={overrides} />
          <AISummary byCat={byCat} total={total} diff={diff} prevTotal={prevTotal} month={selectedMonth} />
        </>
      ) : (
        <TransactionList transactions={txs} overrides={overrides} onOverride={onOverride} onDelete={onDelete} onAdd={onAdd} defaultMonth={selectedMonth} />
      )}
    </div>
  )
}
