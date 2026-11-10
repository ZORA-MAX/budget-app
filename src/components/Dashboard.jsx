import { useMemo, useState } from 'react'
import { resolveClassification, summarizeByCategory } from '../lib/classifier'
import { groupByMonth, fmtMoney } from '../lib/csv-parser'
import CategoryChart from './CategoryChart'
import CategoryBreakdown from './CategoryBreakdown'
import TopTransactions from './TopTransactions'
import TrendChart from './TrendChart'
import AISummary from './AISummary'
import { MiniAIInsight } from './AISummary'
import TransactionList from './TransactionList'
import DimensionBar from './DimensionBar'
import CashflowLedger from './CashflowLedger'
import { consumptionAmount, financialMetrics, transactionOverride } from '../lib/financial-metrics'

export default function Dashboard({ transactions, overrides = {}, memory = {}, onOverride, onDelete, onAdd }) {
  const monthlyMap = useMemo(() => groupByMonth(transactions), [transactions])
  const monthKeys = useMemo(() => Object.keys(monthlyMap).sort().reverse(), [monthlyMap])
  const [selectedMonth, setSelectedMonth] = useState(monthKeys[0] || '')
  const [activeTab, setActiveTab] = useState('overview')
  const [exporting, setExporting] = useState(false)

  const txs = useMemo(() => monthlyMap[selectedMonth] || [], [monthlyMap, selectedMonth])
  const metrics = useMemo(() => financialMetrics(txs, overrides), [txs, overrides])
  const expenseTxs = useMemo(() => txs.filter(tx => consumptionAmount(tx, transactionOverride(tx, overrides)) > 0), [txs, overrides])
  const byCat = useMemo(() => summarizeByCategory(expenseTxs, overrides, memory), [expenseTxs, overrides, memory])
  const total = metrics.consumption
  const incomeTotal = metrics.income
  const refundTotal = metrics.refund
  const netCashflow = metrics.cashflow
  const basisNotes = [...new Set(txs.map(tx => tx.consumptionBasis).filter(Boolean))]
  const prevKey = monthKeys[monthKeys.indexOf(selectedMonth) + 1]
  const prevTotal = prevKey ? financialMetrics(monthlyMap[prevKey] || [], overrides).consumption : 0
  const [selectedYear, selectedMonthNumber] = selectedMonth.split('-').map(Number)
  const previousCalendarMonth = new Date(selectedYear, selectedMonthNumber - 2, 1)
  const expectedPreviousKey = `${previousCalendarMonth.getFullYear()}-${String(previousCalendarMonth.getMonth() + 1).padStart(2, '0')}`
  const hasComparison = prevKey === expectedPreviousKey
  const diff = hasComparison ? total - prevTotal : null

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
      const ov = transactionOverride(tx, overrides)
      const effectiveTx = {
        ...tx,
        name: ov?.editedName ?? tx.name,
        amount: consumptionAmount(tx, ov),
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
      total: financialMetrics(monthlyMap[k] || [], overrides).consumption
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
          <div className="text-xs text-ink-secondary">{metrics.unreviewedCount ? '消费额（含未核退款）' : '原单净消费（按总账核验）'}</div>
          <div className="text-2xl font-semibold text-red-500 mt-1">{fmtMoney(total)}</div>
          {hasComparison ? <div className={`text-xs mt-1 ${diff > 0 ? 'text-red-500' : 'text-green-600'}`}>{diff > 0 ? '↑' : '↓'} 比上月{diff > 0 ? '多' : '少'} {fmtMoney(Math.abs(diff))}</div> : null}
        </div>
        <div className="col-span-2 bg-white dark:bg-surface-card-dark rounded-xl p-4">
          <div className="text-xs text-ink-secondary">已记录净现金流</div>
          <div className={`text-3xl font-semibold mt-1 ${netCashflow >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>{fmtMoney(netCashflow)}</div>
          {expenseTxs.length > 0 ? <MiniAIInsight byCat={byCat} total={total} diff={diff} /> : null}
        </div>
      </div>

      <div className="text-xs leading-relaxed text-ink-secondary rounded-xl bg-amber-50 border border-amber-100 p-3">
        消费图表按导入总账的净额及已核验退款记录汇总，不计已标明的转账、还款本金；未匹配退款不自动分摊。原付款和退款仍完整保留在流水中。
        {metrics.unreviewedCount > 0 && <span className="block mt-1">本月 {metrics.unreviewedCount} 笔尚无净额核验，暂沿用原记录金额；历史月份不自动重算。</span>}
        {basisNotes.map((note, index) => <span key={index} className="block mt-1 font-medium">{note}</span>)}
        <span className="block mt-1">原支出 {fmtMoney(metrics.grossExpense)} · 退款流入 {fmtMoney(refundTotal)}。现金流仅覆盖已导入流水，不代表银行账户余额。</span>
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
            <div className="text-xs font-medium text-ink-secondary uppercase tracking-wider mb-3">消费分类</div>
            <CategoryChart byCat={byCat} />
          </div>
          <CategoryBreakdown byCat={byCat} total={total} />
          <TopTransactions transactions={expenseTxs} overrides={overrides} memory={memory} />
          <AISummary byCat={byCat} total={total} diff={diff} prevTotal={prevTotal} month={selectedMonth} unreviewedCount={metrics.unreviewedCount} />
        </>
      ) : activeTab === 'transactions' ? (
        <TransactionList transactions={txs} overrides={overrides} memory={memory} onOverride={onOverride} onDelete={onDelete} onAdd={onAdd} />
      ) : <CashflowLedger transactions={txs} overrides={overrides} />}
    </div>
  )
}
