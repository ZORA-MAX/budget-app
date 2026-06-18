import { useState, useRef, useCallback } from 'react'

export default function UploadZone({ label, emoji, accentClass, onFile, loaded, filename, count, onClear }) {
  const [drag, setDrag] = useState(false)
  const inputRef = useRef()

  const handleDrop = useCallback(e => {
    e.preventDefault()
    setDrag(false)
    const file = e.dataTransfer?.files[0]
    if (file) onFile(file)
  }, [onFile])

  if (loaded) {
    return (
      <div className="flex items-center justify-between bg-green-50 dark:bg-green-950/30 rounded-xl px-4 py-3 mb-2">
        <div className="flex items-center gap-3">
          <span className="text-xl">{emoji}</span>
          <div>
            <div className="text-sm font-medium text-ink dark:text-white">{filename}</div>
            <div className="text-xs text-ink-secondary">{count} 笔支出记录</div>
          </div>
        </div>
        <button onClick={onClear}
          className="text-ink-tertiary hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 px-2 py-1 rounded-md text-sm transition-colors">
          ✕
        </button>
      </div>
    )
  }

  return (
    <div
      className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors mb-2
        ${drag ? 'border-brand bg-brand-faint' : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-surface-card-dark'}
        hover:border-brand/50`}
      onDragOver={e => { e.preventDefault(); setDrag(true) }}
      onDragLeave={() => setDrag(false)}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
    >
      <div className="text-2xl mb-2">{emoji}</div>
      <div className="text-sm font-medium text-ink dark:text-white">{label}</div>
      <div className="text-xs text-ink-secondary mt-1">点击选择或拖拽 CSV 文件</div>
      <input ref={inputRef} type="file" accept=".csv" className="hidden" onChange={e => {
        if (e.target.files[0]) onFile(e.target.files[0])
      }} />
    </div>
  )
}
