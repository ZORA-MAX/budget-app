import { useEffect, useMemo, useRef, useState } from 'react'
import { parseScreenshotText } from '../lib/screenshot-parser'

const ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/heic', 'image/heif']

function toDateInput(date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000)
  return local.toISOString().slice(0, 10)
}

function RowEditor({ row, onChange, onRemove }) {
  return (
    <div className="grid grid-cols-[1fr_92px] gap-2 rounded-xl border border-gray-100 dark:border-gray-800 p-3">
      <input aria-label="商户或账单描述" value={row.name} onChange={event => onChange({ ...row, name: event.target.value })}
        className="min-w-0 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm outline-none focus:border-brand dark:border-gray-700 dark:bg-gray-900" />
      <input aria-label="金额" type="number" min="0.01" step="0.01" value={row.amount}
        onChange={event => onChange({ ...row, amount: event.target.value })}
        className="rounded-lg border border-gray-200 bg-gray-50 px-2 py-2 text-sm outline-none focus:border-brand dark:border-gray-700 dark:bg-gray-900" />
      <input aria-label="交易日期" type="date" value={toDateInput(row.date)}
        onChange={event => onChange({ ...row, date: new Date(`${event.target.value}T00:00:00`) })}
        className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm outline-none focus:border-brand dark:border-gray-700 dark:bg-gray-900" />
      <button type="button" onClick={onRemove} className="rounded-lg px-2 text-xs text-red-500 hover:bg-red-50">删除</button>
    </div>
  )
}

export default function ScreenshotImporter({ onImport }) {
  const inputRef = useRef(null)
  const [files, setFiles] = useState([])
  const [previewUrl, setPreviewUrl] = useState('')
  const [progress, setProgress] = useState(0)
  const [status, setStatus] = useState('idle')
  const [error, setError] = useState('')
  const [rows, setRows] = useState([])
  const [rawText, setRawText] = useState('')

  useEffect(() => {
    if (files.length === 0) return undefined
    const url = URL.createObjectURL(files[0])
    setPreviewUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [files])

  const validRows = useMemo(() => rows.filter(row => row.name.trim() && Number(row.amount) > 0 && !Number.isNaN(row.date.getTime())), [rows])

  const selectFiles = selectedFiles => {
    setError('')
    setRows([])
    setRawText('')
    setProgress(0)
    if (selectedFiles.length === 0) return
    if (selectedFiles.some(file => !ACCEPTED_TYPES.includes(file.type))) {
      setError('请选择 PNG、JPG、WebP 或 HEIC 格式的账单截图。')
      return
    }
    setFiles(selectedFiles)
    setStatus('ready')
  }

  const recognize = async () => {
    if (files.length === 0) return
    setStatus('recognizing')
    setError('')
    setProgress(0)
    try {
      const { recognize } = await import('tesseract.js')
      const allRows = []
      const allText = []
      for (let index = 0; index < files.length; index += 1) {
        const result = await recognize(files[index], 'chi_sim', {
          logger: message => {
            if (message.status !== 'recognizing text') return
            const fileProgress = message.progress || 0
            setProgress(Math.round(((index + fileProgress) / files.length) * 100))
          },
        })
        const text = result.data.text || ''
        allText.push(`【${files[index].name}】\n${text}`)
        allRows.push(...parseScreenshotText(text))
      }
      const deduped = allRows.filter((row, index) => allRows.findIndex(candidate =>
        candidate.date.getTime() === row.date.getTime() && candidate.amount === row.amount && candidate.name === row.name
      ) === index)
      setRawText(allText.join('\n\n'))
      setRows(deduped)
      setStatus('review')
      if (deduped.length === 0) setError('没有自动识别出明细。你可以手动添加一行，或换一张更清晰的截图。')
    } catch (recognitionError) {
      console.error(recognitionError)
      setStatus('ready')
      setError('截图识别失败，请检查网络后重试，或使用下方的手动新增账单。')
    }
  }

  const addBlankRow = () => setRows(current => [...current, {
    fingerprint: `manual_${Date.now()}`,
    date: new Date(),
    name: '银行卡消费',
    amount: '',
    source: 'bank-screenshot',
  }])

  const confirmImport = () => {
    onImport(validRows.map(({ fingerprint: _fingerprint, ...row }) => ({ ...row, amount: Number(row.amount) })))
    setFiles([])
    setPreviewUrl('')
    setRows([])
    setRawText('')
    setStatus('idle')
  }

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-surface-card-dark">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-medium text-ink dark:text-white">📷 银行卡截图识别</h2>
          <p className="mt-1 text-xs leading-relaxed text-ink-secondary">适合没有 Excel 的银行卡扣款记录。图片只在你的浏览器中识别，保存前可以逐笔修改。</p>
        </div>
        <button type="button" onClick={() => inputRef.current?.click()}
          className="flex-shrink-0 rounded-lg bg-brand-faint px-3 py-2 text-xs font-medium text-brand hover:bg-brand/20">
          选择截图
        </button>
        <input ref={inputRef} type="file" accept="image/png,image/jpeg,image/webp,image/heic,image/heif" multiple className="hidden"
          onChange={event => { selectFiles(Array.from(event.target.files || [])); event.target.value = '' }} />
      </div>

      {error ? <div className="mt-3 rounded-lg bg-red-50 p-3 text-xs text-red-600 dark:bg-red-950/30">{error}</div> : null}

      {files.length > 0 ? (
        <div className="mt-4 space-y-3">
          <div className="flex items-center gap-3 rounded-xl bg-gray-50 p-3 dark:bg-gray-900/60">
            {previewUrl ? <img src={previewUrl} alt="待识别的账单截图" className="h-16 w-16 rounded-lg object-cover" /> : null}
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium text-ink dark:text-white">{files.length === 1 ? files[0].name : `${files.length} 张账单截图`}</div>
              <div className="mt-1 text-xs text-ink-secondary">共 {(files.reduce((sum, file) => sum + file.size, 0) / 1024 / 1024).toFixed(1)} MB</div>
            </div>
            {status !== 'recognizing' ? (
              <button type="button" onClick={recognize} className="rounded-lg bg-brand px-3 py-2 text-xs font-medium text-white">开始识别</button>
            ) : null}
          </div>

          {status === 'recognizing' ? (
            <div>
              <div className="mb-1 flex justify-between text-xs text-ink-secondary"><span>正在识别文字，首次使用会下载中文识别模型…</span><span>{progress}%</span></div>
              <div className="h-2 overflow-hidden rounded-full bg-gray-100"><div className="h-full bg-brand transition-all" style={{ width: `${progress}%` }} /></div>
            </div>
          ) : null}

          {status === 'review' ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="text-xs font-medium text-ink-secondary">请核对识别结果（{validRows.length} 笔有效）</div>
                <button type="button" onClick={addBlankRow} className="text-xs font-medium text-brand hover:underline">+ 手动添加一行</button>
              </div>
              {rows.map((row, index) => (
                <RowEditor key={row.fingerprint} row={row}
                  onChange={next => setRows(current => current.map((item, itemIndex) => itemIndex === index ? next : item))}
                  onRemove={() => setRows(current => current.filter((_, itemIndex) => itemIndex !== index))} />
              ))}
              {rawText ? <details className="text-xs text-ink-tertiary"><summary className="cursor-pointer">查看识别原文</summary><pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap rounded-lg bg-gray-50 p-3 dark:bg-gray-900">{rawText}</pre></details> : null}
              <button type="button" disabled={validRows.length === 0} onClick={confirmImport}
                className="w-full rounded-xl bg-brand py-3 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-40">
                确认加入 {validRows.length} 笔账单
              </button>
            </div>
          ) : null}
        </div>
      ) : (
        <button type="button" onClick={addBlankRow} className="mt-3 text-xs text-brand hover:underline">没有截图？仍可在分析报告的“逐笔明细”中手动添加</button>
      )}
    </section>
  )
}
