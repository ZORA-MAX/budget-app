import { useMemo, useState } from 'react'
import { summarizeByCategory } from '../lib/classifier'
import { groupByMonth, fmtMoney } from '../lib/csv-parser'
import CategoryChart from './CategoryChart'
import CategoryBreakdown from './CategoryBreakdown'
import TopTransactions from './TopTransactions'
import TrendChart from './TrendChart'
import AISummary from './AISummary'
import TransactionList from './TransactionList'
import DimensionBar from './DimensionBar'

export default function Dashboard({ transactions, overrides = {}, onOverride }) {
  const monthlyMap = useMemo(() => groupByMonth(transactions), [transactions])
  const monthKeys = useMemo(() => Object.keys(monthlyMap).sort().reverse(), [monthlyMap])
  const [selectedMonth, setSelectedMonth] = useState(monthKeys[0] || '')
  const [activeTab, setActiveTab] = useState('overview')

  const txs = useMemo(() => monthlyMap[selectedMonth] || [], [monthlyMap, selectedMonth])
  const byCat = useMemo(() => summarizeByCategory(txs, overrides), [txs, overrides])
  const total = useMemo(() => txs.reduce((s, t) => s + t.amount, 0), [txs])

  const prevKey = monthKeys[monthKeys.indexOf(selectedMonth) + 1]
  const prevTotal = prevKey ? (monthlyMap[prevKey] || []).reduce((s, t) => s + t.amount, 0) : 0
  const diff = total - prevTotal

  const monthlyTotals = useMemo(() =>
    monthKeys.slice().reverse().map(k => ({
      label: k.split('-')[1] + '月',
      total: (monthlyMap[k] || []).reduce((s, t) => s + t.amount, 0)
    })),
  [monthKeys, monthlyMap])

  if (txs.length === 0) return null

  return (
    <div className="space-y-4">
      {/* Month tabs */}
      {monthKeys.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
          {monthKeys.map(k => {
            const [y, m] = k.split('-')
            return (
              <button key={k} onClick={() => setSelectedMonth(k)}
                className={`flex-shrink-0 px-4 py-1.5 rounded-full text-sm border transition-colors
                  ${k === selectedMonth
                    ? 'border-brand text-brand bg-brand-faint font-medium'
                    : 'border-gray-200 dark:border-gray-700 text-ink-secondary bg-white dark:bg-surface-card-dark'}`}>
                {y}年{parseInt(m)}月
              </button>
            )
          })}
        </div>
      )}

      {/* Metrics */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white dark:bg-surface-card-dark rounded-xl p-4">
          <div className="text-xs text-ink-secondary">本月总支出</div>
          <div className="text-2xl font-semibold text-ink dark:text-white mt-1">{fmtMoney(total)}</div>
          {prevTotal > 0 && (
            <div className={`text-xs mt-1 ${diff > 0 ? 'text-red-500' : 'text-green-600'}`}>
              {diff > 0 ? '↑' : '↓'} 比上月{diff > 0 ? '多' : '少'} {fmtMoney(Math.abs(diff))}
            </div>
          )}
        </div>
        <div className="bg-white dark:bg-surface-card-dark rounded-xl p-4">
          <div className="text-xs text-ink-secondary">交易笔数</div>
          <div className="text-2xl font-semibold text-ink dark:text-white mt-1">{txs.length}</div>
          <div className="text-xs text-ink-secondary mt-1">日均 {(txs.length / 30).toFixed(1)} 笔</div>
        </div>
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
          {/* Dimension bar chart */}
          <DimensionBar byCat={byCat} total={total} />

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
        <TransactionList transactions={txs} overrides={overrides} onOverride={onOverride} />
      )}
    </div>
  )
}
