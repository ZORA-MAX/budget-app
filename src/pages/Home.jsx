import { useState, useCallback, useMemo, useEffect } from 'react'
import Dashboard from '../components/Dashboard'
import { parseCSV, parseExcel, groupByMonth, txKey } from '../lib/csv-parser'
import { applyTransactionMergeMemory, DEFAULT_TRANSACTION_MERGE_MEMORIES } from '../lib/transaction-merge-memory'
import {
  importClassificationMemory,
  loadClassificationMemory,
  rememberClassification,
  saveMonth,
  saveOverrides,
} from '../lib/storage'

const BILL_FILE_PATTERN = /\.(csv|xlsx?)$/i

function readTextFile(file, encoding) {
  return new Promise(resolve => {
    const reader = new FileReader()
    reader.onload = event => resolve(event.target.result)
    reader.onerror = () => resolve('')
    reader.readAsText(file, encoding)
  })
}

async function parseBillFile(file) {
  if (!BILL_FILE_PATTERN.test(file.name)) {
    throw new Error('仅支持 CSV、XLS 和 XLSX 格式')
  }

  if (/\.xlsx?$/i.test(file.name)) {
    return parseExcel(await file.arrayBuffer())
  }

  const tryParse = async encoding => {
    try {
      return parseCSV(await readTextFile(file, encoding))
    } catch {
      return []
    }
  }
  let txs = await tryParse('utf-8')
  if (txs.length === 0) txs = await tryParse('gbk')
  return txs
}

export default function Home({ onDataSaved }) {
  const [files, setFiles] = useState([])
  const [error, setError] = useState('')
  const [analyzed, setAnalyzed] = useState(false)
  const [saving, setSaving] = useState(false)
  const [overrides, setOverrides] = useState({})
  const [deletedKeys, setDeletedKeys] = useState(new Set())
  const [manualTxs, setManualTxs] = useState([])
  const [classificationMemory, setClassificationMemory] = useState({})
  const [memoryNotice, setMemoryNotice] = useState('')
  const [importingCount, setImportingCount] = useState(0)

  useEffect(() => {
    loadClassificationMemory().then(setClassificationMemory).catch(console.error)
  }, [])

  const handleFiles = useCallback(async selectedFiles => {
    const batch = Array.from(selectedFiles || [])
    if (batch.length === 0) return

    setError('')
    setImportingCount(batch.length)
    setAnalyzed(false)

    const results = await Promise.allSettled(batch.map(async file => {
      const txs = await parseBillFile(file)
      if (txs.length === 0) throw new Error('没有识别到支出记录')
      const source = txs[0]?.source || 'cashbook'
      const sourceLabel = source === 'wechat' ? '微信' : source === 'alipay' ? '支付宝' : '记账本'
      return {
        key: `${file.name}-${file.size}-${file.lastModified}-${crypto.randomUUID()}`,
        filename: file.name,
        txs,
        source,
        sourceLabel,
      }
    }))

    const imported = []
    const failed = []
    results.forEach((result, index) => {
      if (result.status === 'fulfilled') imported.push(result.value)
      else failed.push(`${batch[index].name}：${result.reason?.message || '解析失败'}`)
    })

    if (imported.length > 0) setFiles(prev => [...prev, ...imported])
    if (failed.length > 0) setError(`有 ${failed.length} 个文件未导入：${failed.join('；')}`)
    setImportingCount(0)
  }, [])

  const handleMemoryFile = useCallback(async file => {
    setError('')
    setMemoryNotice('')
    try {
      const analysis = JSON.parse(await file.text())
      if (!Array.isArray(analysis?.transactions)) throw new Error('缺少 transactions 明细')
      const memory = await importClassificationMemory(analysis)
      setClassificationMemory(memory)
      setMemoryNotice(`已导入历史操作，当前记忆 ${Object.keys(memory).length} 条`)
    } catch (err) {
      setError(`分类记忆导入失败：${err.message}`)
    }
  }, [])

  const allTxs = useMemo(() => {
    const uniqueImported = [...new Map(
      files.flatMap(file => file.txs).map(tx => [txKey(tx), tx])
    ).values()]
    const merged = applyTransactionMergeMemory([...uniqueImported, ...manualTxs])
    return merged.filter(tx => !deletedKeys.has(txKey(tx)))
  }, [files, manualTxs, deletedKeys])

  const removeFile = key => { setFiles(prev => prev.filter(f => f.key !== key)); setAnalyzed(false) }

  // Override: save immediately
  const handleOverride = useCallback((key, classification, txForMemory) => {
    setOverrides(prev => {
      const next = { ...prev, [key]: classification }
      // Keep the imported transaction immutable and persist edits as a stable local override.
      if (txForMemory?.date) {
        const date = txForMemory.date
        const mk = `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}`
        saveOverrides(mk, next).catch(console.error)
      }
      return next
    })
    if (txForMemory) {
      rememberClassification(txForMemory, classification).then(record => {
        if (!record) return
        setClassificationMemory(prev => ({ ...prev, [record.key]: record }))
        setMemoryNotice('已记住这次分类，下次会自动复用')
      }).catch(console.error)
    }
  }, [])

  // Delete: save immediately
  const handleDelete = useCallback(key => {
    setDeletedKeys(prev => new Set([...prev, key]))
  }, [])

  const handleAdd = useCallback(tx => {
    setManualTxs(prev => [...prev, tx])
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
            <span key={f.key} className={`text-xs px-2.5 py-1 rounded-full ${
              f.source === 'wechat' ? 'bg-green-50 text-green-600' : f.source === 'alipay' ? 'bg-blue-50 text-blue-600' : 'bg-purple-50 text-purple-600'}`}>
              {f.source === 'wechat' ? '💬' : f.source === 'alipay' ? '🔵' : '📒'} {f.sourceLabel} {f.txs.length}笔
            </span>
          ))}
          {manualTxs.length > 0 && <span className="text-xs px-2.5 py-1 rounded-full bg-amber-50 text-amber-600">✏️ 手动 {manualTxs.length}笔</span>}
          {deletedKeys.size > 0 && <span className="text-xs px-2.5 py-1 rounded-full bg-red-50 text-red-500">已删 {deletedKeys.size}笔</span>}
          {Object.keys(classificationMemory).length > 0 && <span className="text-xs px-2.5 py-1 rounded-full bg-purple-50 text-purple-600">记忆 {Object.keys(classificationMemory).length}条</span>}
          <span className="text-xs px-2.5 py-1 rounded-full bg-green-50 text-green-600">💾 自动保存中</span>
        </div>
        {memoryNotice && <div className="text-xs text-purple-600 bg-purple-50 rounded-lg px-3 py-2 mb-3">{memoryNotice}</div>}
        <button onClick={() => document.getElementById('memory-input').click()}
          className="text-xs px-3 py-2 rounded-lg bg-white border border-purple-200 text-purple-600 hover:bg-purple-50 mb-4">
          导入历史分类记忆
        </button>
        <input id="memory-input" type="file" accept=".json,application/json" className="hidden"
          onChange={e => { if (e.target.files[0]) handleMemoryFile(e.target.files[0]); e.target.value = '' }} />
        <Dashboard transactions={allTxs} overrides={overrides} memory={classificationMemory} onOverride={handleOverride} onDelete={handleDelete} onAdd={handleAdd} />
      </div>
    )
  }

  return (
    <div>
      {error && <div className="bg-red-50 dark:bg-red-950/30 text-red-600 rounded-xl p-3 text-sm mb-3">{error}</div>}
      {memoryNotice && <div className="text-xs text-purple-600 bg-purple-50 rounded-lg px-3 py-2 mb-3">{memoryNotice}</div>}
      {files.length > 0 && (
        <div className="flex items-center justify-between rounded-xl bg-brand-faint px-4 py-3 mb-2">
          <div>
            <div className="text-sm font-medium text-brand">已选择 {files.length} 个账单文件</div>
            <div className="text-xs text-ink-secondary mt-0.5">共识别 {files.reduce((sum, file) => sum + file.txs.length, 0)} 笔支出记录</div>
          </div>
          <button type="button" onClick={() => { setFiles([]); setAnalyzed(false) }}
            className="text-xs text-ink-secondary hover:text-red-500 transition-colors">
            清空全部
          </button>
        </div>
      )}
      {files.map(f => (
        <div key={f.key} className="flex items-center justify-between bg-green-50 dark:bg-green-950/30 rounded-xl px-4 py-3 mb-2">
          <div className="flex items-center gap-3">
            <span className="text-xl">{f.source === 'wechat' ? '💬' : f.source === 'alipay' ? '🔵' : '📒'}</span>
            <div>
              <div className="text-sm font-medium text-ink dark:text-white">{f.filename}</div>
              <div className="text-xs text-ink-secondary">{f.sourceLabel} · {f.txs.length} 笔</div>
            </div>
          </div>
          <button type="button" aria-label={`移除 ${f.filename}`} onClick={() => removeFile(f.key)} className="text-ink-tertiary hover:text-red-500 px-2 py-1 rounded-md text-sm">✕</button>
        </div>
      ))}

      <div className="border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors mb-2
        border-gray-200 dark:border-gray-700 bg-white dark:bg-surface-card-dark hover:border-brand/50"
        onClick={() => document.getElementById('file-input').click()}
        onDragOver={e => { e.preventDefault(); e.currentTarget.classList.add('border-brand','bg-brand-faint') }}
        onDragLeave={e => e.currentTarget.classList.remove('border-brand','bg-brand-faint')}
        onDrop={e => { e.preventDefault(); e.currentTarget.classList.remove('border-brand','bg-brand-faint'); handleFiles(e.dataTransfer.files) }}>
        <div className="text-2xl mb-2">📂</div>
        <div className="text-sm font-medium text-ink dark:text-white">{importingCount > 0 ? `正在导入 ${importingCount} 个文件…` : '批量导入账单文件'}</div>
        <div className="text-xs text-ink-secondary mt-1">一次可多选多个 CSV、XLS 或 XLSX 文件，也支持批量拖入</div>
        <div className="flex justify-center gap-2 mt-3">
          <span className="text-xs px-2 py-0.5 rounded-full bg-green-50 text-green-600">💬 微信</span>
          <span className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-600">🔵 支付宝</span>
          <span className="text-xs px-2 py-0.5 rounded-full bg-purple-50 text-purple-600">📒 记账本</span>
          <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">📊 Excel</span>
        </div>
        <input id="file-input" type="file" accept=".csv,.xlsx,.xls" multiple className="hidden"
          onChange={e => { handleFiles(e.target.files); e.target.value = '' }} />
      </div>

      <div className="rounded-xl border border-purple-100 bg-purple-50/70 px-4 py-3 mb-2">
        <div className="flex items-start gap-2.5">
          <span className="mt-0.5" aria-hidden="true">🧠</span>
          <div>
            <div className="text-sm font-medium text-purple-700">合并记忆已启用</div>
            <div className="text-xs text-purple-600/80 mt-1 leading-relaxed">
              {DEFAULT_TRANSACTION_MERGE_MEMORIES[0].description}会按月自动合并为“交通”，详情保留每一笔日期与金额。
            </div>
          </div>
        </div>
      </div>

      <button onClick={() => document.getElementById('memory-input').click()}
        className="w-full mt-2 py-3 bg-white dark:bg-surface-card-dark text-purple-600 rounded-xl text-sm font-medium border border-purple-200 hover:bg-purple-50 transition-colors">
        导入历史分类记忆 JSON{Object.keys(classificationMemory).length > 0 ? `（已有 ${Object.keys(classificationMemory).length} 条）` : ''}
      </button>
      <input id="memory-input" type="file" accept=".json,application/json" className="hidden"
        onChange={e => { if (e.target.files[0]) handleMemoryFile(e.target.files[0]); e.target.value = '' }} />

      {files.length > 0 ? (
        <button onClick={handleAnalyze} disabled={importingCount > 0}
          className="w-full mt-4 py-3 bg-brand text-white rounded-xl text-sm font-medium hover:bg-brand-light transition-colors disabled:opacity-50 disabled:cursor-wait">
          {importingCount > 0 ? '正在读取文件…' : `生成分析报告（${files.length} 个文件）→`}
        </button>
      ) : (
        <div className="bg-white dark:bg-surface-card-dark rounded-xl p-4 mt-4">
          <div className="text-xs font-medium text-ink-secondary uppercase tracking-wider mb-3">如何导出账单</div>
          <div className="space-y-4">
            {[['1','微信账单','微信 → 我 → 支付 → 钱包 → 账单 → 下载账单 → CSV'],
              ['2','支付宝账单','支付宝 → 搜索"账单" → 所有交易 → 导出 → CSV'],
              ['3','记账本 / Excel','支持大部分记账软件导出的 CSV 和 Excel 格式']
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
