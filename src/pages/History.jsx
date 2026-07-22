import { useState, useEffect, useCallback } from 'react'
import { listMonths, loadMonth, loadOverrides, loadAllOverrides, deleteMonth, loadClassificationMemory, rememberClassification } from '../lib/storage'
import { fmtMoney } from '../lib/csv-parser'
import { summarizeByCategory } from '../lib/classifier'
import Dashboard from '../components/Dashboard'
import { saveOverrides } from '../lib/storage'

export default function History({ refreshKey }) {
  const [months, setMonths] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedMonth, setSelectedMonth] = useState(null)
  const [txs, setTxs] = useState([])
  const [overrides, setOverrides] = useState({})
  const [monthSummaries, setMonthSummaries] = useState({})
  const [memory, setMemory] = useState({})

  // Load all saved months
  useEffect(() => {
    (async () => {
      setLoading(true)
      const [keys, learnedMemory] = await Promise.all([listMonths(), loadClassificationMemory()])
      setMonths(keys)
      setMemory(learnedMemory)

      const summaries = {}
      for (const key of keys) {
        const data = await loadMonth(key)
        if (data) {
          const ov = await loadOverrides(key)
          const total = data.reduce((s, t) => s + t.amount, 0)
          const byCat = summarizeByCategory(data, ov, learnedMemory)
          summaries[key] = { total, count: data.length, topCat: byCat[0]?.cat, byCat }
        }
      }
      setMonthSummaries(summaries)
      setLoading(false)
    })()
  }, [refreshKey])

  // Load selected month with overrides
  useEffect(() => {
    if (!selectedMonth) { setTxs([]); setOverrides({}); return }
    (async () => {
      const data = await loadMonth(selectedMonth)
      const ov = await loadOverrides(selectedMonth)
      setTxs(data || [])
      setOverrides(ov || {})
    })()
  }, [selectedMonth])

  // Handle override changes in history view
  const handleOverride = useCallback((key, classification, txForMemory) => {
    setOverrides(prev => {
      const next = { ...prev, [key]: classification }
      if (selectedMonth) saveOverrides(selectedMonth, next).catch(console.error)
      return next
    })
    if (txForMemory) {
      rememberClassification(txForMemory, classification).then(record => {
        if (record) setMemory(prev => ({ ...prev, [record.key]: record }))
      }).catch(console.error)
    }
  }, [selectedMonth])

  const handleDelete = useCallback((key) => {
    setTxs(prev => prev.filter(tx => `${tx.date.toISOString()}_${tx.amount}_${tx.name}` !== key))
  }, [])

  const handleAdd = useCallback((tx) => {
    setTxs(prev => [...prev, tx].sort((a, b) => b.date - a.date))
  }, [])

  const handleDeleteMonth = async (key) => {
    if (!confirm(`确定删除 ${key} 的全部数据吗？`)) return
    await deleteMonth(key)
    setMonths(m => m.filter(k => k !== key))
    setMonthSummaries(s => { const c = { ...s }; delete c[key]; return c })
    if (selectedMonth === key) setSelectedMonth(null)
  }

  // Export all data as JSON (for AI analysis)
  const exportAllData = async () => {
    const allData = {}
    for (const key of months) {
      const data = await loadMonth(key)
      const ov = await loadOverrides(key)
      const byCat = summarizeByCategory(data || [], ov, memory)
      allData[key] = {
        transactions: (data || []).map(tx => ({
          date: tx.date.toISOString().split('T')[0],
          name: tx.name,
          amount: tx.amount,
          source: tx.source,
        })),
        overrides: ov,
        summary: byCat.map(c => ({
          category: c.cat.label,
          total: Math.round(c.total),
          count: c.count,
          pct: data ? Math.round(c.total / data.reduce((s, t) => s + t.amount, 0) * 100) : 0,
        })),
      }
    }
    const blob = new Blob([JSON.stringify(allData, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `budget-data-${new Date().toISOString().split('T')[0]}.json`
    a.click(); URL.revokeObjectURL(url)
  }

  // Viewing a specific month
  if (selectedMonth && txs.length > 0) {
    return (
      <div>
        <button onClick={() => setSelectedMonth(null)} className="text-brand text-sm mb-4 hover:underline">← 返回历史列表</button>
        <Dashboard transactions={txs} overrides={overrides} memory={memory} onOverride={handleOverride} onDelete={handleDelete} onAdd={handleAdd} />
      </div>
    )
  }

  if (loading) return <div className="text-sm text-ink-secondary text-center py-12">加载中...</div>

  if (months.length === 0) {
    return (
      <div className="text-center py-16">
        <div className="text-4xl mb-3">📭</div>
        <div className="text-sm text-ink-secondary">还没有保存过数据</div>
        <div className="text-xs text-ink-tertiary mt-2">去「导入分析」上传账单，生成报告后会自动保存到这里</div>
      </div>
    )
  }

  // Totals across all months
  const grandTotal = Object.values(monthSummaries).reduce((s, m) => s + m.total, 0)
  const totalTxCount = Object.values(monthSummaries).reduce((s, m) => s + m.count, 0)

  return (
    <div className="space-y-4">
      {/* Summary header */}
      <div className="bg-white dark:bg-surface-card-dark rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="text-xs text-ink-secondary">累计记录</div>
            <div className="text-2xl font-semibold text-ink dark:text-white">{months.length} 个月</div>
          </div>
          <div className="text-right">
            <div className="text-xs text-ink-secondary">累计支出</div>
            <div className="text-2xl font-semibold text-ink dark:text-white">{fmtMoney(grandTotal)}</div>
          </div>
        </div>
        <div className="text-xs text-ink-tertiary">共 {totalTxCount} 笔交易 · 数据保存在浏览器本地</div>
      </div>

      {/* Export button */}
      <button onClick={exportAllData}
        className="w-full py-2.5 rounded-xl text-sm font-medium bg-brand/10 text-brand hover:bg-brand/20 transition-colors">
        📦 导出全部数据（JSON，可用于 AI 分析）
      </button>

      {/* Month list */}
      {months.map(key => {
        const [y, m] = key.split('-')
        const summary = monthSummaries[key]
        return (
          <div key={key} className="bg-white dark:bg-surface-card-dark rounded-xl p-4">
            <div className="flex items-center justify-between">
              <button onClick={() => setSelectedMonth(key)} className="flex-1 text-left">
                <div className="text-sm font-medium text-ink dark:text-white">{y}年{parseInt(m)}月</div>
                {summary && (
                  <div className="flex items-center gap-3 mt-1.5">
                    <span className="text-xs text-ink-secondary">{fmtMoney(summary.total)} · {summary.count}笔</span>
                    {summary.topCat && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded"
                        style={{ backgroundColor: summary.topCat.bg, color: summary.topCat.color }}>
                        {summary.topCat.label}最多
                      </span>
                    )}
                  </div>
                )}
              </button>
              <div className="flex items-center gap-2">
                <button onClick={() => setSelectedMonth(key)}
                  className="text-xs px-3 py-1.5 rounded-lg bg-brand/10 text-brand hover:bg-brand/20">查看</button>
                <button onClick={() => handleDeleteMonth(key)}
                  className="text-xs px-2 py-1.5 rounded-lg text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30">删除</button>
              </div>
            </div>
          </div>
        )
      })}

      {/* Data persistence info */}
      <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-4">
        <p className="text-xs text-ink-tertiary leading-relaxed">
          💾 数据使用浏览器 IndexedDB 存储，刷新页面不会丢失。每次导入账单并生成报告后会自动保存。
          清除浏览器数据或换设备会丢失，建议定期点击上方「导出」备份。
        </p>
      </div>
    </div>
  )
}
