import { useMemo, useState } from 'react'
import { resolveClassification, summarizeByCategory } from '../lib/classifier'
import { groupByMonth, fmtMoney, getTransactionDirection, txKey } from '../lib/csv-parser'
import CategoryChart from './CategoryChart'
import CategoryBreakdown from './CategoryBreakdown'
import TopTransactions from './TopTransactions'
import TrendChart from './TrendChart'
import AISummary from './AISummary'
import { MiniAIInsight } from './AISummary'
import TransactionList from './TransactionList'
import DimensionBar from './DimensionBar'
import CashflowLedger from './CashflowLedger'

export default function Dashboard({ transactions, overrides = {}, memory = {}, onOverride, onDelete, onAdd }) {
  const monthlyMap = useMemo(() => groupByMonth(transactions), [transactions])
  const monthKeys = useMemo(() => Object.keys(monthlyMap).sort().reverse(), [monthlyMap])
  const [selectedMonth, setSelectedMonth] = useState(monthKeys[0] || '')
  const [activeTab, setActiveTab] = useState('overview')
  const [exporting, setExporting] = useState(false)

  const txs = useMemo(() => monthlyMap[selectedMonth] || [], [monthlyMap, selectedMonth])
  const expenseTxs = useMemo(() => txs.filter(tx => getTransactionDirection(tx, overrides[txKey(tx)]) === 'expense' && tx.isEffective !== false), [txs, overrides])
  const byCat = useMemo(() => summarizeByCategory(expenseTxs, overrides, memory), [expenseTxs, overrides, memory])
  const total = useMemo(() => expenseTxs.reduce((sum, tx) => {
    const override = overrides[txKey(tx)]
    return sum + (Number.isFinite(override?.editedAmount) ? override.editedAmount : tx.amount)
  }, 0), [expenseTxs, overrides])
  const incomeTotal = useMemo(() => txs.filter(tx => getTransactionDirection(tx, overrides[txKey(tx)]) === 'income' && tx.isEffective !== false).reduce((sum, tx) => {
    const override = overrides[txKey(tx)]
    return sum + (Number.isFinite(override?.editedAmount) ? override.editedAmount : tx.amount)
  }, 0), [txs, overrides])
  const refundTotal = useMemo(() => txs.filter(tx => getTransactionDirection(tx, overrides[txKey(tx)]) === 'refund' && tx.isEffective !== false).reduce((sum, tx) => {
    const override = overrides[txKey(tx)]
    return sum + (Number.isFinite(override?.editedAmount) ? override.editedAmount : tx.amount)
  }, 0), [txs, overrides])
  const netCashflow = incomeTotal + refundTotal - total

  const prevKey = monthKeys[monthKeys.indexOf(selectedMonth) + 1]
  const prevTotal = prevKey ? (monthlyMap[prevKey] || []).filter(tx => getTransactionDirection(tx, overrides[txKey(tx)]) === 'expense' && tx.isEffective !== false).reduce((sum, tx) => {
    const override = overrides[txKey(tx)]
    return sum + (Number.isFinite(override?.editedAmount) ? override.editedAmount : tx.amount)
  }, 0) : 0
  const diff = total - prevTotal

  const handleExcelExport = async () => {
    setExporting(true)
    try {
      const { exportTransactionsToExcel } = await import('../lib/export-transactions')
      exportTransactionsToExcel(transactions, overrides, memory)
    } catch (error) {
      console.error('Excel export failed:', error)
      window.alert('导出失败，请刷新页面后重试')
    } finally {
      setExporting(false)
    }
  }

  // Per-transaction tag totals
  const tagTotals = useMemo(() => {
    const map = {}
    for (const tx of expenseTxs) {
      const key = txKey(tx)
      const ov = overrides[key]
      const effectiveTx = {
        ...tx,
        name: ov?.editedName ?? tx.name,
        amount: Number.isFinite(ov?.editedAmount) ? ov.editedAmount : tx.amount,
      }
      const { tags } = resolveClassification(effectiveTx, ov, memory)
      const share = effectiveTx.amount / (tags.length || 1)
      for (const t of tags) {
        if (!map[t]) map[t] = 0
        map[t] += share
      }
    }
    return map
  }, [expenseTxs, overrides, memory])

  const monthlyTotals = useMemo(() =>
    monthKeys.slice().reverse().map(k => ({
      label: k.split('-')[1] + '月',
      total: (monthlyMap[k] || []).filter(tx => getTransactionDirection(tx, overrides[txKey(tx)]) === 'expense' && tx.isEffective !== false).reduce((sum, tx) => {
        const override = overrides[txKey(tx)]
        return sum + (Number.isFinite(override?.editedAmount) ? override.editedAmount : tx.amount)
      }, 0)
    })),
  [monthKeys, monthlyMap, overrides])

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

      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
        <button type="button" onClick={handleExcelExport} disabled={exporting}
          className="w-full rounded-lg bg-emerald-600 px-4 py-3 text-sm font-semibold text-white hover:bg-emerald-700 transition-colors disabled:cursor-wait disabled:opacity-70">
          {exporting ? '正在生成 Excel…' : `📥 下载完整收支 Excel（${transactions.length} 笔）`}
        </button>
        <div className="mt-2 text-[11px] leading-relaxed text-emerald-800/80">
          与五月调整版保持同一结构：完整流水、月度收支汇总、支出分类汇总、账单原始字段、截图识别明细、合并原始明细。
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white dark:bg-surface-card-dark rounded-xl p-4">
          <div className="text-xs text-ink-secondary">本月收入</div>
          <div className="text-2xl font-semibold text-emerald-600 mt-1">{fmtMoney(incomeTotal)}</div>
          {refundTotal > 0 ? <div className="text-xs text-sky-600 mt-1">另有退款 {fmtMoney(refundTotal)}</div> : null}
        </div>
        <div className="bg-white dark:bg-surface-card-dark rounded-xl p-4">
          <div className="text-xs text-ink-secondary">本月支出</div>
          <div className="text-2xl font-semibold text-red-500 mt-1">{fmtMoney(total)}</div>
          {prevTotal > 0 ? <div className={`text-xs mt-1 ${diff > 0 ? 'text-red-500' : 'text-green-600'}`}>{diff > 0 ? '↑' : '↓'} 比上月{diff > 0 ? '多' : '少'} {fmtMoney(Math.abs(diff))}</div> : null}
        </div>
        <div className="col-span-2 bg-white dark:bg-surface-card-dark rounded-xl p-4">
          <div className="text-xs text-ink-secondary">本月净现金流</div>
          <div className={`text-3xl font-semibold mt-1 ${netCashflow >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>{fmtMoney(netCashflow)}</div>
          {expenseTxs.length > 0 ? <MiniAIInsight byCat={byCat} total={total} diff={diff} /> : null}
        </div>
      </div>

      {/* Tab switch */}
      <div className="grid grid-cols-3 gap-2">
        <button onClick={() => setActiveTab('overview')}
          className={`flex-1 py-2 rounded-xl text-sm font-medium transition-colors
            ${activeTab === 'overview' ? 'bg-brand text-white' : 'bg-white dark:bg-surface-card-dark text-ink-secondary border border-gray-200 dark:border-gray-700'}`}>
          📊 总览
        </button>
        <button onClick={() => setActiveTab('transactions')}
          className={`flex-1 py-2 rounded-xl text-sm font-medium transition-colors
            ${activeTab === 'transactions' ? 'bg-brand text-white' : 'bg-white dark:bg-surface-card-dark text-ink-secondary border border-gray-200 dark:border-gray-700'}`}>
          📋 收支明细
        </button>
        <button onClick={() => setActiveTab('ledger')}
          className={`py-2 rounded-xl text-sm font-medium transition-colors ${activeTab === 'ledger' ? 'bg-brand text-white' : 'bg-white dark:bg-surface-card-dark text-ink-secondary border border-gray-200 dark:border-gray-700'}`}>
          💳 全部流水
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
          <TopTransactions transactions={expenseTxs} overrides={overrides} memory={memory} />
          <AISummary byCat={byCat} total={total} diff={diff} prevTotal={prevTotal} month={selectedMonth} />
        </>
      ) : activeTab === 'transactions' ? (
        <TransactionList transactions={txs} overrides={overrides} memory={memory} onOverride={onOverride} onDelete={onDelete} onAdd={onAdd} />
      ) : <CashflowLedger transactions={txs} overrides={overrides} />}
    </div>
  )
}
