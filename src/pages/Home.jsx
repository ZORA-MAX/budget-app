import { useState, useCallback, useMemo, useEffect } from 'react'
import Dashboard from '../components/Dashboard'
import ScreenshotImporter from '../components/ScreenshotImporter'
import { parseCSV, parseExcel, groupByMonth, txKey } from '../lib/csv-parser'
import { saveMonth, saveOverrides } from '../lib/storage'

export default function Home({ onDataSaved }) {
  const [files, setFiles] = useState([])
  const [error, setError] = useState('')
  const [analyzed, setAnalyzed] = useState(false)
  const [saving, setSaving] = useState(false)
  const [overrides, setOverrides] = useState({})
  const [deletedKeys, setDeletedKeys] = useState(new Set())
  const [manualTxs, setManualTxs] = useState([])

  const handleFile = useCallback((file) => {
    setError('')
    const isExcel = /\.xlsx?$/i.test(file.name)
    if (isExcel) {
      const reader = new FileReader()
      reader.onload = e => {
        try {
          const txs = parseExcel(e.target.result)
          if (txs.length === 0) { setError(`无法解析 "${file.name}"。`); return }
          addFileData(file.name, txs)
        } catch (err) { setError('Excel 解析出错：' + err.message) }
      }
      reader.readAsArrayBuffer(file)
    } else {
      const tryParse = enc => new Promise(resolve => {
        const reader = new FileReader()
        reader.onload = e => { try { resolve(parseCSV(e.target.result)) } catch { resolve([]) } }
        reader.onerror = () => resolve([])
        reader.readAsText(file, enc)
      })
      tryParse('utf-8').then(txs => txs.length > 0 ? txs : tryParse('gbk')).then(txs => {
        if (txs.length === 0) { setError(`无法解析 "${file.name}"。支持 CSV 和 Excel 格式。`); return }
        addFileData(file.name, txs)
      })
    }
  }, [])

  const addFileData = (filename, txs) => {
    const source = txs[0]?.source || 'cashbook'
    const sourceLabel = source === 'wechat' ? '微信' : source === 'alipay' ? '支付宝' : '记账本'
    setFiles(prev => [...prev.filter(f => f.source !== source), { key: Date.now(), filename, txs, source, sourceLabel }])
    setAnalyzed(false)
  }

  const allTxs = useMemo(() => {
    const imported = files.flatMap(f => f.txs)
    const all = [...imported, ...manualTxs].filter(tx => !deletedKeys.has(txKey(tx)))
    all.sort((x, y) => y.date - x.date)
    return all
  }, [files, manualTxs, deletedKeys])

  const removeFile = source => { setFiles(prev => prev.filter(f => f.source !== source)); setAnalyzed(false) }

  // Override: save immediately
  const handleOverride = useCallback((key, classification) => {
    setOverrides(prev => {
      const next = { ...prev, [key]: classification }
      // Save overrides for all affected months
      for (const f of files) {
        for (const tx of f.txs) {
          if (txKey(tx) === key) {
            const mk = `${tx.date.getFullYear()}-${String(tx.date.getMonth()+1).padStart(2,'0')}`
            saveOverrides(mk, next).catch(console.error)
          }
        }
      }
      return next
    })
  }, [files])

  // Delete: save immediately
  const handleDelete = useCallback(key => {
    setDeletedKeys(prev => new Set([...prev, key]))
  }, [])

  const handleAdd = useCallback(tx => {
    setManualTxs(prev => [...prev, tx])
  }, [])

  const handleScreenshotImport = useCallback(txs => {
    setManualTxs(prev => [...prev, ...txs])
    setAnalyzed(false)
  }, [])

  const handleAnalyze = async () => {
    setAnalyzed(true); setSaving(true)
    try {
      const monthly = groupByMonth(allTxs)
      for (const [key, txs] of Object.entries(monthly)) await saveMonth(key, txs)
      onDataSaved?.()
    } catch (err) { console.error('Save failed:', err) }
    setSaving(false)
  }

  // Auto-save whenever transactions change (delete/add) while in analyzed mode
  useEffect(() => {
    if (!analyzed || allTxs.length === 0) return
    const monthly = groupByMonth(allTxs)
    for (const [key, txs] of Object.entries(monthly)) {
      saveMonth(key, txs).catch(console.error)
    }
    onDataSaved?.()
  }, [analyzed, deletedKeys, manualTxs])

  if (analyzed) {
    return (
      <div>
        <button onClick={() => setAnalyzed(false)} className="text-brand text-sm mb-4 hover:underline">← 重新上传</button>
        {saving && <div className="text-xs text-ink-secondary mb-3">正在保存...</div>}
        <div className="flex gap-2 flex-wrap mb-4">
          {files.map(f => (
            <span key={f.source} className={`text-xs px-2.5 py-1 rounded-full ${
              f.source === 'wechat' ? 'bg-green-50 text-green-600' : f.source === 'alipay' ? 'bg-blue-50 text-blue-600' : 'bg-purple-50 text-purple-600'}`}>
              {f.source === 'wechat' ? '💬' : f.source === 'alipay' ? '🔵' : '📒'} {f.sourceLabel} {f.txs.length}笔
            </span>
          ))}
          {manualTxs.length > 0 && <span className="text-xs px-2.5 py-1 rounded-full bg-amber-50 text-amber-600">✏️ 手动 {manualTxs.length}笔</span>}
          {deletedKeys.size > 0 && <span className="text-xs px-2.5 py-1 rounded-full bg-red-50 text-red-500">已删 {deletedKeys.size}笔</span>}
          <span className="text-xs px-2.5 py-1 rounded-full bg-green-50 text-green-600">💾 自动保存中</span>
        </div>
        <Dashboard transactions={allTxs} overrides={overrides} onOverride={handleOverride} onDelete={handleDelete} onAdd={handleAdd} />
      </div>
    )
  }

  return (
    <div>
      {error && <div className="bg-red-50 dark:bg-red-950/30 text-red-600 rounded-xl p-3 text-sm mb-3">{error}</div>}
      {files.map(f => (
        <div key={f.source} className="flex items-center justify-between bg-green-50 dark:bg-green-950/30 rounded-xl px-4 py-3 mb-2">
          <div className="flex items-center gap-3">
            <span className="text-xl">{f.source === 'wechat' ? '💬' : f.source === 'alipay' ? '🔵' : '📒'}</span>
            <div>
              <div className="text-sm font-medium text-ink dark:text-white">{f.filename}</div>
              <div className="text-xs text-ink-secondary">{f.sourceLabel} · {f.txs.length} 笔</div>
            </div>
          </div>
          <button onClick={() => removeFile(f.source)} className="text-ink-tertiary hover:text-red-500 px-2 py-1 rounded-md text-sm">✕</button>
        </div>
      ))}

      <div className="border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors mb-2
        border-gray-200 dark:border-gray-700 bg-white dark:bg-surface-card-dark hover:border-brand/50"
        onClick={() => document.getElementById('file-input').click()}
        onDragOver={e => { e.preventDefault(); e.currentTarget.classList.add('border-brand','bg-brand-faint') }}
        onDragLeave={e => e.currentTarget.classList.remove('border-brand','bg-brand-faint')}
        onDrop={e => { e.preventDefault(); e.currentTarget.classList.remove('border-brand','bg-brand-faint'); Array.from(e.dataTransfer.files).forEach(f => handleFile(f)) }}>
        <div className="text-2xl mb-2">📂</div>
        <div className="text-sm font-medium text-ink dark:text-white">导入账单文件</div>
        <div className="text-xs text-ink-secondary mt-1">支持 CSV 和 Excel，可同时选择多个文件</div>
        <div className="flex justify-center gap-2 mt-3">
          <span className="text-xs px-2 py-0.5 rounded-full bg-green-50 text-green-600">💬 微信</span>
          <span className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-600">🔵 支付宝</span>
          <span className="text-xs px-2 py-0.5 rounded-full bg-purple-50 text-purple-600">📒 记账本</span>
          <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">📊 Excel</span>
        </div>
        <input id="file-input" type="file" accept=".csv,.xlsx,.xls" multiple className="hidden"
          onChange={e => { Array.from(e.target.files).forEach(f => handleFile(f)); e.target.value = '' }} />
      </div>

      <div className="mt-3">
        <ScreenshotImporter onImport={handleScreenshotImport} />
      </div>

      {manualTxs.length > 0 && (
        <div className="mt-3 flex items-center justify-between rounded-xl bg-amber-50 px-4 py-3 dark:bg-amber-950/30">
          <div><div className="text-sm font-medium text-ink dark:text-white">📷 银行卡截图账单</div><div className="mt-0.5 text-xs text-ink-secondary">已加入 {manualTxs.length} 笔，生成报告后可继续修改</div></div>
          <button onClick={() => setManualTxs([])} className="rounded-md px-2 py-1 text-sm text-ink-tertiary hover:text-red-500">✕</button>
        </div>
      )}

      {files.length > 0 || manualTxs.length > 0 ? (
        <button onClick={handleAnalyze} className="w-full mt-4 py-3 bg-brand text-white rounded-xl text-sm font-medium hover:bg-brand-light transition-colors">
          生成分析报告 →
        </button>
      ) : (
        <div className="bg-white dark:bg-surface-card-dark rounded-xl p-4 mt-4">
          <div className="text-xs font-medium text-ink-secondary uppercase tracking-wider mb-3">如何导出账单</div>
          <div className="space-y-4">
            {[['1','微信账单','微信 → 我 → 支付 → 钱包 → 账单 → 下载账单 → CSV'],
              ['2','支付宝账单','支付宝 → 搜索"账单" → 所有交易 → 导出 → CSV'],
              ['3','银行卡截图','打开银行 App 的账单或交易明细，截图后在上方识别并核对'],
              ['4','记账本 / Excel','支持大部分记账软件导出的 CSV 和 Excel 格式']
            ].map(([n,t,d]) => (
              <div key={n} className="flex gap-3">
                <div className="w-6 h-6 rounded-full bg-brand text-white text-xs font-semibold flex items-center justify-center flex-shrink-0 mt-0.5">{n}</div>
                <div><div className="text-sm font-medium text-ink dark:text-white">{t}</div><div className="text-xs text-ink-secondary leading-relaxed mt-1">{d}</div></div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
