import { useState, useEffect, useCallback, useRef } from 'react'
import {
  createFullBackup,
  deleteMonth,
  listMonths,
  loadClassificationMemory,
  loadMonth,
  loadOverrides,
  rememberClassification,
  restoreFullBackup,
  saveMonth,
  saveOverrides,
} from '../lib/storage'
import { createTaxonomySnapshot, restoreTaxonomySnapshot } from '../lib/categories'
import { fmtMoney, getTransactionDirection, txKey } from '../lib/csv-parser'
import { summarizeByCategory } from '../lib/classifier'
import Dashboard from '../components/Dashboard'

function BackupPanel({ months, memoryCount, status, restoring, onExport, onRestore }) {
  const fileInputRef = useRef(null)

  return (
    <div className="bg-white dark:bg-surface-card-dark rounded-xl p-4 space-y-3">
      <div>
        <div className="text-sm font-medium text-ink dark:text-white">☁️ 数据备份与恢复</div>
        <p className="text-xs text-ink-tertiary mt-1 leading-relaxed">
          完整备份会保存全部账单、人工分类、分类学习记忆和自定义分类。恢复时只替换备份中同月份的数据。
        </p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <button onClick={onExport} disabled={restoring}
          className="py-2.5 rounded-xl text-sm font-medium bg-brand/10 text-brand hover:bg-brand/20 disabled:opacity-50 transition-colors">
          ↓ 导出完整备份
        </button>
        <button onClick={() => fileInputRef.current?.click()} disabled={restoring}
          className="py-2.5 rounded-xl text-sm font-medium border border-brand/30 text-brand hover:bg-brand/5 disabled:opacity-50 transition-colors">
          {restoring ? '恢复中…' : '↑ 导入备份恢复'}
        </button>
      </div>
      <input ref={fileInputRef} type="file" accept="application/json,.json" onChange={onRestore} className="hidden" />
      {status && (
        <div className={`text-xs rounded-lg px-3 py-2 ${status.type === 'error' ? 'bg-red-50 text-red-600 dark:bg-red-950/30' : 'bg-green-50 text-green-700 dark:bg-green-950/30'}`}>
          {status.text}
        </div>
      )}
      <div className="text-[11px] text-ink-tertiary">
        当前本机有 {months.length} 个月数据、{memoryCount} 条分类记忆。建议每次核对完账单后下载一份备份。
      </div>
    </div>
  )
}

export default function History({ refreshKey }) {
  const [months, setMonths] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedMonth, setSelectedMonth] = useState(null)
  const [txs, setTxs] = useState([])
  const [overrides, setOverrides] = useState({})
  const [memory, setMemory] = useState({})
  const [monthSummaries, setMonthSummaries] = useState({})
  const [dataVersion, setDataVersion] = useState(0)
  const [backupStatus, setBackupStatus] = useState(null)
  const [restoring, setRestoring] = useState(false)
  const txsRef = useRef([])
  const overridesRef = useRef({})
  const saveQueueRef = useRef(Promise.resolve())

  useEffect(() => {
    let active = true
    setLoading(true)
    ;(async () => {
      const [keys, learnedMemory] = await Promise.all([listMonths(), loadClassificationMemory()])
      const entries = await Promise.all(keys.map(async key => {
        const [data, ov] = await Promise.all([loadMonth(key), loadOverrides(key)])
        if (!data) return [key, null]
        const total = data.reduce((sum, tx) => {
          const override = ov[txKey(tx)]
          if (getTransactionDirection(tx, override) !== 'expense' || tx.isEffective === false) return sum
          return sum + (Number.isFinite(override?.editedAmount) ? override.editedAmount : tx.amount)
        }, 0)
        const expenseTransactions = data.filter(tx => getTransactionDirection(tx, ov[txKey(tx)]) === 'expense' && tx.isEffective !== false)
        const byCat = summarizeByCategory(expenseTransactions, ov, learnedMemory)
        return [key, { total, count: data.length, topCat: byCat[0]?.cat, byCat }]
      }))
      if (!active) return
      setMonths(keys)
      setMemory(learnedMemory)
      setMonthSummaries(Object.fromEntries(entries.filter(([, summary]) => summary)))
      setLoading(false)
    })().catch(error => {
      if (!active) return
      setLoading(false)
      setBackupStatus({ type: 'error', text: `读取历史数据失败：${error.message}` })
    })
    return () => { active = false }
  }, [refreshKey, dataVersion])

  useEffect(() => {
    let active = true
    if (!selectedMonth) {
      txsRef.current = []
      overridesRef.current = {}
      setTxs([])
      setOverrides({})
      return () => { active = false }
    }
    ;(async () => {
      const [data, ov] = await Promise.all([loadMonth(selectedMonth), loadOverrides(selectedMonth)])
      if (!active) return
      txsRef.current = data || []
      overridesRef.current = ov || {}
      setTxs(data || [])
      setOverrides(ov || {})
    })().catch(error => {
      if (active) setBackupStatus({ type: 'error', text: `读取月份失败：${error.message}` })
    })
    return () => { active = false }
  }, [selectedMonth])

  const queueSave = useCallback(task => {
    saveQueueRef.current = saveQueueRef.current
      .then(task)
      .then(() => setDataVersion(version => version + 1))
      .catch(error => setBackupStatus({ type: 'error', text: `保存失败：${error.message}` }))
  }, [])

  const handleOverride = useCallback((key, classification, txForMemory) => {
    if (!selectedMonth) return
    const next = { ...overridesRef.current, [key]: classification }
    overridesRef.current = next
    setOverrides(next)
    queueSave(() => saveOverrides(selectedMonth, next))
    if (txForMemory) {
      rememberClassification(txForMemory, classification).then(record => {
        if (record) setMemory(current => ({ ...current, [record.key]: record }))
      }).catch(error => setBackupStatus({ type: 'error', text: `分类学习失败：${error.message}` }))
    }
  }, [queueSave, selectedMonth])

  const handleDelete = useCallback(key => {
    if (!selectedMonth) return
    const next = txsRef.current.filter(tx => txKey(tx) !== key)
    const nextOverrides = { ...overridesRef.current }
    delete nextOverrides[key]
    txsRef.current = next
    overridesRef.current = nextOverrides
    setTxs(next)
    setOverrides(nextOverrides)
    if (next.length === 0) setSelectedMonth(null)
    queueSave(() => Promise.all([
      saveMonth(selectedMonth, next),
      saveOverrides(selectedMonth, nextOverrides),
    ]))
  }, [queueSave, selectedMonth])

  const handleAdd = useCallback(tx => {
    if (!selectedMonth) return
    const next = [...txsRef.current, tx].sort((a, b) => b.date - a.date)
    txsRef.current = next
    setTxs(next)
    queueSave(() => saveMonth(selectedMonth, next))
  }, [queueSave, selectedMonth])

  const handleDeleteMonth = async key => {
    if (!confirm(`确定删除 ${key} 的全部数据吗？删除前建议先导出备份。`)) return
    await deleteMonth(key)
    if (selectedMonth === key) setSelectedMonth(null)
    setDataVersion(version => version + 1)
  }

  const exportAllData = async () => {
    try {
      await saveQueueRef.current
      const backup = await createFullBackup()
      backup.taxonomy = createTaxonomySnapshot()
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `budget-full-backup-${new Date().toISOString().slice(0, 10)}.json`
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
      const count = backup.data.months.reduce((sum, record) => sum + record.transactions.length, 0)
      setBackupStatus({ type: 'success', text: `完整备份已下载：${backup.data.months.length} 个月、${count} 笔账单、${backup.data.classificationMemory.length} 条分类记忆。` })
    } catch (error) {
      setBackupStatus({ type: 'error', text: `导出失败：${error.message}` })
    }
  }

  const restoreBackup = async event => {
    const file = event.target.files?.[0]
    if (!file) return
    setRestoring(true)
    try {
      const payload = JSON.parse(await file.text())
      if (!confirm('确定导入这份备份吗？备份中同月份的数据会替换本机现有数据。')) return
      const result = await restoreFullBackup(payload)
      if (payload.taxonomy) restoreTaxonomySnapshot(payload.taxonomy)
      setSelectedMonth(null)
      setDataVersion(version => version + 1)
      setBackupStatus({ type: 'success', text: `恢复完成：${result.monthCount} 个月、${result.transactionCount} 笔账单、${result.memoryCount} 条分类记忆。` })
    } catch (error) {
      const message = error instanceof SyntaxError ? '文件不是有效的 JSON 备份' : error.message
      setBackupStatus({ type: 'error', text: `恢复失败：${message}` })
    } finally {
      event.target.value = ''
      setRestoring(false)
    }
  }

  if (selectedMonth && txs.length > 0) {
    return (
      <div>
        <button onClick={() => setSelectedMonth(null)} className="text-brand text-sm mb-4 hover:underline">← 返回历史列表</button>
        <Dashboard transactions={txs} overrides={overrides} memory={memory} onOverride={handleOverride} onDelete={handleDelete} onAdd={handleAdd} />
      </div>
    )
  }

  const grandTotal = Object.values(monthSummaries).reduce((sum, month) => sum + month.total, 0)
  const totalTxCount = Object.values(monthSummaries).reduce((sum, month) => sum + month.count, 0)

  return (
    <div className="space-y-4">
      <BackupPanel months={months} memoryCount={Object.keys(memory).length} status={backupStatus} restoring={restoring} onExport={exportAllData} onRestore={restoreBackup} />

      {loading ? (
        <div className="text-sm text-ink-secondary text-center py-12">加载中...</div>
      ) : months.length === 0 ? (
        <div className="text-center py-12">
          <div className="text-4xl mb-3">📭</div>
          <div className="text-sm text-ink-secondary">还没有保存过数据</div>
          <div className="text-xs text-ink-tertiary mt-2">可以去「导入分析」上传账单，或从上方恢复以前的完整备份。</div>
        </div>
      ) : (
        <>
          <div className="bg-white dark:bg-surface-card-dark rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <div><div className="text-xs text-ink-secondary">累计记录</div><div className="text-2xl font-semibold text-ink dark:text-white">{months.length} 个月</div></div>
              <div className="text-right"><div className="text-xs text-ink-secondary">累计支出</div><div className="text-2xl font-semibold text-ink dark:text-white">{fmtMoney(grandTotal)}</div></div>
            </div>
            <div className="text-xs text-ink-tertiary">共 {totalTxCount} 笔交易 · 数据保存在当前浏览器</div>
          </div>

          {months.map(key => {
            const [year, month] = key.split('-')
            const summary = monthSummaries[key]
            return (
              <div key={key} className="bg-white dark:bg-surface-card-dark rounded-xl p-4">
                <div className="flex items-center justify-between">
                  <button onClick={() => setSelectedMonth(key)} className="flex-1 text-left">
                    <div className="text-sm font-medium text-ink dark:text-white">{year}年{parseInt(month)}月</div>
                    {summary && (
                      <div className="flex items-center gap-3 mt-1.5">
                        <span className="text-xs text-ink-secondary">{fmtMoney(summary.total)} · {summary.count}笔</span>
                        {summary.topCat && <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ backgroundColor: summary.topCat.bg, color: summary.topCat.color }}>{summary.topCat.label}最多</span>}
                      </div>
                    )}
                  </button>
                  <div className="flex items-center gap-2">
                    <button onClick={() => setSelectedMonth(key)} className="text-xs px-3 py-1.5 rounded-lg bg-brand/10 text-brand hover:bg-brand/20">查看</button>
                    <button onClick={() => handleDeleteMonth(key)} className="text-xs px-2 py-1.5 rounded-lg text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30">删除</button>
                  </div>
                </div>
              </div>
            )
          })}

          <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-4">
            <p className="text-xs text-ink-tertiary leading-relaxed">💾 刷新页面不会丢失本机数据；清除浏览器数据或换设备仍会丢失。请定期导出完整备份，并将 JSON 文件保存到 iCloud、百度网盘或其他可靠位置。</p>
          </div>
        </>
      )}
    </div>
  )
}
