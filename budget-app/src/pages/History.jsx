import { useState, useEffect } from 'react'
import { listMonths, loadMonth, deleteMonth } from '../lib/storage'
import { fmtMoney } from '../lib/csv-parser'
import { summarizeByCategory } from '../lib/classifier'
import Dashboard from '../components/Dashboard'

export default function History({ refreshKey }) {
  const [months, setMonths] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedMonth, setSelectedMonth] = useState(null)
  const [txs, setTxs] = useState([])
  const [monthSummaries, setMonthSummaries] = useState({})

  // Load month list
  useEffect(() => {
    (async () => {
      setLoading(true)
      const keys = await listMonths()
      setMonths(keys)

      // Load summaries for each month
      const summaries = {}
      for (const key of keys) {
        const data = await loadMonth(key)
        if (data) {
          const total = data.reduce((s, t) => s + t.amount, 0)
          const byCat = summarizeByCategory(data)
          summaries[key] = { total, count: data.length, topCat: byCat[0]?.cat }
        }
      }
      setMonthSummaries(summaries)
      setLoading(false)
    })()
  }, [refreshKey])

  // Load selected month
  useEffect(() => {
    if (!selectedMonth) { setTxs([]); return }
    (async () => {
      const data = await loadMonth(selectedMonth)
      setTxs(data || [])
    })()
  }, [selectedMonth])

  const handleDelete = async (key) => {
    if (!confirm(`确定删除 ${key} 的数据吗？`)) return
    await deleteMonth(key)
    setMonths(m => m.filter(k => k !== key))
    setMonthSummaries(s => { const copy = { ...s }; delete copy[key]; return copy })
    if (selectedMonth === key) setSelectedMonth(null)
  }

  if (selectedMonth && txs.length > 0) {
    return (
      <div>
        <button
          onClick={() => setSelectedMonth(null)}
          className="text-brand text-sm mb-4 hover:underline"
        >
          ← 返回列表
        </button>
        <Dashboard transactions={txs} />
      </div>
    )
  }

  if (loading) {
    return <div className="text-sm text-ink-secondary text-center py-12">加载中...</div>
  }

  if (months.length === 0) {
    return (
      <div className="text-center py-16">
        <div className="text-4xl mb-3">📭</div>
        <div className="text-sm text-ink-secondary">
          还没有保存过数据，先去「导入分析」上传账单吧
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="text-xs text-ink-secondary mb-2">已保存 {months.length} 个月的数据</div>
      {months.map(key => {
        const [y, m] = key.split('-')
        const summary = monthSummaries[key]
        return (
          <div key={key}
            className="bg-white dark:bg-surface-card-dark rounded-xl p-4 flex items-center justify-between">
            <button onClick={() => setSelectedMonth(key)} className="flex-1 text-left">
              <div className="text-sm font-medium text-ink dark:text-white">
                {y}年{parseInt(m)}月
              </div>
              {summary && (
                <div className="flex items-center gap-3 mt-1">
                  <span className="text-xs text-ink-secondary">
                    {fmtMoney(summary.total)} · {summary.count}笔
                  </span>
                  {summary.topCat && (
                    <span className="text-xs px-1.5 py-0.5 rounded"
                      style={{ backgroundColor: summary.topCat.bg, color: summary.topCat.color }}>
                      {summary.topCat.emoji} {summary.topCat.label}最多
                    </span>
                  )}
                </div>
              )}
            </button>
            <button
              onClick={() => handleDelete(key)}
              className="text-ink-tertiary hover:text-red-500 text-xs px-2 py-1 rounded hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
            >
              删除
            </button>
          </div>
        )
      })}
    </div>
  )
}
