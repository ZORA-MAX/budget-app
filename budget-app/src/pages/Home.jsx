import { useState, useCallback, useMemo } from 'react'
import Dashboard from '../components/Dashboard'
import { parseCSV, groupByMonth } from '../lib/csv-parser'
import { saveMonth, saveOverrides } from '../lib/storage'

export default function Home({ onDataSaved }) {
  const [files, setFiles] = useState([])
  const [error, setError] = useState('')
  const [analyzed, setAnalyzed] = useState(false)
  const [saving, setSaving] = useState(false)
  const [overrides, setOverrides] = useState({})

  const handleFile = useCallback((file) => {
    setError('')

    const tryParse = (encoding) => {
      return new Promise((resolve) => {
        const reader = new FileReader()
        reader.onload = e => {
          try {
            const txs = parseCSV(e.target.result)
            resolve(txs)
          } catch {
            resolve([])
          }
        }
        reader.onerror = () => resolve([])
        reader.readAsText(file, encoding)
      })
    }

    tryParse('utf-8').then(txs => {
      if (txs.length > 0) return txs
      return tryParse('gbk')
    }).then(txs => {
      if (txs.length === 0) {
        setError(`无法解析 "${file.name}"。支持微信、支付宝和记账本导出的 CSV 文件。`)
        return
      }
      const source = txs[0].source || 'cashbook'
      const sourceLabel = source === 'wechat' ? '微信' : source === 'alipay' ? '支付宝' : '记账本'

      setFiles(prev => {
        const filtered = prev.filter(f => f.source !== source)
        return [...filtered, { key: Date.now(), filename: file.name, txs, source, sourceLabel }]
      })
      setAnalyzed(false)
    })
  }, [])

  const allTxs = useMemo(() => {
    const a = files.flatMap(f => f.txs)
    a.sort((x, y) => y.date - x.date)
    return a
  }, [files])

  const removeFile = (source) => {
    setFiles(prev => prev.filter(f => f.source !== source))
    setAnalyzed(false)
  }

  // Handle category override from TransactionList
  const handleOverride = useCallback((txKey, classification) => {
    setOverrides(prev => {
      const next = { ...prev, [txKey]: classification }
      // Auto-save overrides (fire and forget)
      const months = new Set()
      for (const f of files) {
        for (const tx of f.txs) {
          const k = `${tx.date.toISOString()}_${tx.amount}_${tx.name}`
          if (k === txKey) {
            const monthKey = `${tx.date.getFullYear()}-${String(tx.date.getMonth() + 1).padStart(2, '0')}`
            months.add(monthKey)
          }
        }
      }
      for (const m of months) {
        saveOverrides(m, next).catch(console.error)
      }
      return next
    })
  }, [files])

  const handleAnalyze = async () => {
    setAnalyzed(true)
    setSaving(true)
    try {
      const monthly = groupByMonth(allTxs)
      for (const [key, txs] of Object.entries(monthly)) {
        await saveMonth(key, txs)
      }
      onDataSaved?.()
    } catch (err) {
      console.error('Save failed:', err)
    }
    setSaving(false)
  }

  if (analyzed) {
    return (
      <div>
        <button onClick={() => setAnalyzed(false)}
          className="text-brand text-sm mb-4 hover:underline">
          ← 重新上传
        </button>
        {saving && (
          <div className="text-xs text-ink-secondary mb-3">正在保存到本地...</div>
        )}
        <div className="flex gap-2 flex-wrap mb-4">
          {files.map(f => (
            <span key={f.source} className={`text-xs px-2.5 py-1 rounded-full ${
              f.source === 'wechat' ? 'bg-green-50 text-green-600 dark:bg-green-950/30' :
              f.source === 'alipay' ? 'bg-blue-50 text-blue-600 dark:bg-blue-950/30' :
              'bg-purple-50 text-purple-600 dark:bg-purple-950/30'
            }`}>
              {f.source === 'wechat' ? '💬' : f.source === 'alipay' ? '🔵' : '📒'} {f.sourceLabel} {f.txs.length}笔
            </span>
          ))}
          <span className="text-xs px-2.5 py-1 rounded-full bg-brand-faint text-brand">
            已合并 · 已保存
          </span>
        </div>
        <Dashboard transactions={allTxs} overrides={overrides} onOverride={handleOverride} />
      </div>
    )
  }

  return (
    <div>
      {error && (
        <div className="bg-red-50 dark:bg-red-950/30 text-red-600 rounded-xl p-3 text-sm mb-3">
          {error}
        </div>
      )}

      {/* Loaded files */}
      {files.map(f => (
        <div key={f.source} className="flex items-center justify-between bg-green-50 dark:bg-green-950/30 rounded-xl px-4 py-3 mb-2">
          <div className="flex items-center gap-3">
            <span className="text-xl">{f.source === 'wechat' ? '💬' : f.source === 'alipay' ? '🔵' : '📒'}</span>
            <div>
              <div className="text-sm font-medium text-ink dark:text-white">{f.filename}</div>
              <div className="text-xs text-ink-secondary">{f.sourceLabel} · {f.txs.length} 笔支出记录</div>
            </div>
          </div>
          <button onClick={() => removeFile(f.source)}
            className="text-ink-tertiary hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 px-2 py-1 rounded-md text-sm transition-colors">
            ✕
          </button>
        </div>
      ))}

      {/* Upload zone */}
      <div
        className="border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors mb-2
          border-gray-200 dark:border-gray-700 bg-white dark:bg-surface-card-dark hover:border-brand/50"
        onClick={() => document.getElementById('csv-input').click()}
        onDragOver={e => { e.preventDefault(); e.currentTarget.classList.add('border-brand', 'bg-brand-faint') }}
        onDragLeave={e => { e.currentTarget.classList.remove('border-brand', 'bg-brand-faint') }}
        onDrop={e => { e.preventDefault(); e.currentTarget.classList.remove('border-brand', 'bg-brand-faint'); if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]) }}
      >
        <div className="text-2xl mb-2">📂</div>
        <div className="text-sm font-medium text-ink dark:text-white">导入 CSV 账单</div>
        <div className="text-xs text-ink-secondary mt-1">支持微信、支付宝、记账本等格式，自动识别</div>
        <div className="flex justify-center gap-2 mt-3">
          <span className="text-xs px-2 py-0.5 rounded-full bg-green-50 text-green-600 dark:bg-green-950/30">💬 微信</span>
          <span className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 dark:bg-blue-950/30">🔵 支付宝</span>
          <span className="text-xs px-2 py-0.5 rounded-full bg-purple-50 text-purple-600 dark:bg-purple-950/30">📒 记账本</span>
        </div>
        <input id="csv-input" type="file" accept=".csv" className="hidden"
          onChange={e => { if (e.target.files[0]) handleFile(e.target.files[0]); e.target.value = '' }} />
      </div>

      {files.length > 0 ? (
        <button onClick={handleAnalyze}
          className="w-full mt-4 py-3 bg-brand text-white rounded-xl text-sm font-medium hover:bg-brand-light transition-colors">
          生成分析报告 →
        </button>
      ) : (
        <div className="bg-white dark:bg-surface-card-dark rounded-xl p-4 mt-4">
          <div className="text-xs font-medium text-ink-secondary uppercase tracking-wider mb-3">如何导出账单</div>
          <div className="space-y-4">
            <div className="flex gap-3">
              <div className="w-6 h-6 rounded-full bg-brand text-white text-xs font-semibold flex items-center justify-center flex-shrink-0 mt-0.5">1</div>
              <div>
                <div className="text-sm font-medium text-ink dark:text-white">微信账单</div>
                <div className="text-xs text-ink-secondary leading-relaxed mt-1">
                  微信 → 我 → 支付 → 钱包 → 账单 → 右上角菜单 → 下载账单 → 选月份 → 导出 CSV
                </div>
              </div>
            </div>
            <div className="flex gap-3">
              <div className="w-6 h-6 rounded-full bg-brand text-white text-xs font-semibold flex items-center justify-center flex-shrink-0 mt-0.5">2</div>
              <div>
                <div className="text-sm font-medium text-ink dark:text-white">支付宝账单</div>
                <div className="text-xs text-ink-secondary leading-relaxed mt-1">
                  支付宝 → 搜索"账单" → 所有交易 → 右上角导出 → 选月份 → CSV 格式
                </div>
              </div>
            </div>
            <div className="flex gap-3">
              <div className="w-6 h-6 rounded-full bg-brand text-white text-xs font-semibold flex items-center justify-center flex-shrink-0 mt-0.5">3</div>
              <div>
                <div className="text-sm font-medium text-ink dark:text-white">记账本 App</div>
                <div className="text-xs text-ink-secondary leading-relaxed mt-1">
                  记账本 → 导出账单 → 选择 CSV 格式。支持大部分主流记账软件导出。
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
