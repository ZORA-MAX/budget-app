import { useState, useMemo } from 'react'
import ReactDOM from 'react-dom'
import { classify } from '../lib/classifier'
import { CATEGORIES, getCategoryByKey, ALL_TAGS, TAG_MAP } from '../lib/categories'
import { fmtMoney } from '../lib/csv-parser'
import CatIcon from './CatIcon'

/* ─── Centered modal with shadow ─── */
function CategoryPicker({ tx, currentCatKey, currentSubKey, onSelect, onClose }) {
  const [openCat, setOpenCat] = useState(currentCatKey)

  return ReactDOM.createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" />
      <div
        className="relative bg-white dark:bg-surface-card-dark rounded-2xl w-full max-w-md max-h-[70vh] overflow-hidden"
        style={{ boxShadow: '0 24px 80px rgba(0,0,0,0.18), 0 8px 24px rgba(0,0,0,0.08)' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 bg-white dark:bg-surface-card-dark z-10 px-5 pt-5 pb-3 border-b border-gray-100 dark:border-gray-800">
          <div className="flex items-center justify-between">
            <span className="text-base font-semibold text-ink dark:text-white">修改分类</span>
            <button onClick={onClose} className="w-8 h-8 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 flex items-center justify-center text-ink-tertiary text-lg">✕</button>
          </div>
          <div className="text-sm text-ink-secondary mt-1 truncate">{tx?.name || '未知'}</div>
          <div className="flex items-center gap-2 mt-1.5">
            <span className="text-xs text-ink-tertiary">当前：</span>
            <span className="text-xs px-2 py-0.5 rounded-md" style={{ backgroundColor: getCategoryByKey(currentCatKey).bg, color: getCategoryByKey(currentCatKey).color }}>
              {getCategoryByKey(currentCatKey).label}
            </span>
          </div>
        </div>

        {/* List */}
        <div className="overflow-y-auto max-h-[50vh] p-3">
          {CATEGORIES.map(cat => (
            <div key={cat.key} className="mb-0.5">
              <button
                onClick={() => setOpenCat(openCat === cat.key ? null : cat.key)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-colors
                  ${openCat === cat.key ? 'bg-gray-50 dark:bg-gray-800/60' : 'hover:bg-gray-50 dark:hover:bg-gray-800/30'}`}
              >
                <CatIcon iconKey={cat.icon} color={cat.color} bg={cat.bg} size={36} />
                <span className="text-sm font-medium text-ink dark:text-white flex-1">{cat.label}</span>
                <span className="text-ink-tertiary text-xs">{openCat === cat.key ? '▾' : '▸'}</span>
              </button>

              {openCat === cat.key && (
                <div className="ml-12 mt-1 mb-2 space-y-0.5">
                  {cat.subs.map(sub => (
                    <button key={sub.key}
                      onClick={() => onSelect(cat.key, sub.key)}
                      className={`w-full text-left px-4 py-2.5 rounded-lg text-sm transition-colors
                        ${currentSubKey === sub.key && currentCatKey === cat.key
                          ? 'bg-brand-faint text-brand font-medium dark:bg-brand/20'
                          : 'text-ink-secondary hover:bg-gray-100 dark:hover:bg-gray-800/40 dark:text-gray-400'}`}
                    >
                      {sub.label}
                      {currentSubKey === sub.key && currentCatKey === cat.key && ' ✓'}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>,
    document.body
  )
}

/* ─── Main list, grouped by category ─── */
export default function TransactionList({ transactions, overrides, onOverride }) {
  const [editingIdx, setEditingIdx] = useState(null)
  const [viewMode, setViewMode] = useState('grouped') // 'grouped' | 'timeline'
  const [searchTerm, setSearchTerm] = useState('')

  // Classify all
  const classified = useMemo(() =>
    transactions.map((tx, i) => {
      const key = txKey(tx)
      const override = overrides[key]
      const { catKey, subKey } = override || classify(tx.name)
      const cat = getCategoryByKey(catKey)
      const sub = cat.subs?.find(s => s.key === subKey)
      return { ...tx, idx: i, catKey, subKey, cat, sub, isOverridden: !!override }
    }),
  [transactions, overrides])

  // Filter by search
  const filtered = useMemo(() => {
    if (!searchTerm.trim()) return classified
    const term = searchTerm.toLowerCase()
    return classified.filter(t => t.name.toLowerCase().includes(term))
  }, [classified, searchTerm])

  // Group by category
  const grouped = useMemo(() => {
    const map = {}
    for (const tx of filtered) {
      if (!map[tx.catKey]) map[tx.catKey] = { cat: tx.cat, txs: [], total: 0 }
      map[tx.catKey].txs.push(tx)
      map[tx.catKey].total += tx.amount
    }
    return Object.values(map).sort((a, b) => b.total - a.total)
  }, [filtered])

  const handleSelect = (catKey, subKey) => {
    if (editingIdx === null) return
    const tx = transactions[editingIdx]
    onOverride(txKey(tx), { catKey, subKey })
    setEditingIdx(null)
  }

  const editingTx = editingIdx !== null ? classified.find(t => t.idx === editingIdx) : null

  return (
    <div className="space-y-3">
      {/* Header + search */}
      <div className="bg-white dark:bg-surface-card-dark rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="text-xs font-medium text-ink-secondary uppercase tracking-wider">全部交易</div>
          <div className="flex gap-1.5">
            <button onClick={() => setViewMode('grouped')}
              className={`text-xs px-2.5 py-1 rounded-md transition-colors ${viewMode === 'grouped' ? 'bg-brand text-white' : 'text-ink-tertiary hover:bg-gray-100 dark:hover:bg-gray-800'}`}>
              按分类
            </button>
            <button onClick={() => setViewMode('timeline')}
              className={`text-xs px-2.5 py-1 rounded-md transition-colors ${viewMode === 'timeline' ? 'bg-brand text-white' : 'text-ink-tertiary hover:bg-gray-100 dark:hover:bg-gray-800'}`}>
              按时间
            </button>
          </div>
        </div>
        <input type="text" placeholder="搜索商家名称..." value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 text-sm text-ink dark:text-white placeholder:text-ink-tertiary outline-none focus:border-brand" />
      </div>

      {viewMode === 'grouped' ? (
        /* ─── Grouped view ─── */
        grouped.map(group => (
          <div key={group.cat.key} className="bg-white dark:bg-surface-card-dark rounded-xl overflow-hidden">
            {/* Category header */}
            <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100 dark:border-gray-800">
              <CatIcon iconKey={group.cat.icon} color={group.cat.color} bg={group.cat.bg} size={36} />
              <div className="flex-1">
                <div className="text-sm font-medium text-ink dark:text-white">{group.cat.label}</div>
                <div className="text-xs text-ink-tertiary">{group.txs.length} 笔</div>
              </div>
              <span className="text-sm font-semibold text-ink dark:text-white">{fmtMoney(group.total)}</span>
            </div>

            {/* Transactions in this category */}
            <div className="divide-y divide-gray-50 dark:divide-gray-800/50">
              {group.txs.map(tx => (
                <button key={`${tx.idx}`}
                  onClick={() => setEditingIdx(tx.idx)}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors"
                >
                  <div className="w-1 h-8 rounded-full flex-shrink-0" style={{ backgroundColor: group.cat.color + '40' }} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-ink dark:text-white truncate">{tx.name || '未知'}</div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs text-ink-tertiary">{tx.date.getMonth()+1}/{tx.date.getDate()}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ backgroundColor: group.cat.bg, color: group.cat.color }}>
                        {tx.sub?.label || '未分类'}
                      </span>
                      {tx.isOverridden && <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-600 dark:bg-amber-950/30">手动</span>}
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <span className="text-sm font-medium text-red-500">-{fmtMoney(tx.amount)}</span>
                    <div className="text-[10px] text-ink-tertiary">修改 ▸</div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        ))
      ) : (
        /* ─── Timeline view ─── */
        <div className="bg-white dark:bg-surface-card-dark rounded-xl p-4">
          <div className="divide-y divide-gray-100 dark:divide-gray-800">
            {filtered.map(tx => (
              <button key={`${tx.idx}`}
                onClick={() => setEditingIdx(tx.idx)}
                className="w-full flex items-center gap-3 py-2.5 text-left hover:bg-gray-50 dark:hover:bg-gray-800/30 -mx-1 px-1 rounded-lg transition-colors"
              >
                <CatIcon iconKey={tx.cat.icon} color={tx.cat.color} bg={tx.cat.bg} size={36} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-ink dark:text-white truncate">{tx.name || '未知'}</div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs text-ink-tertiary">{tx.date.getMonth()+1}/{tx.date.getDate()}</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ backgroundColor: tx.cat.bg, color: tx.cat.color }}>
                      {tx.sub?.label || tx.cat.label}
                    </span>
                    {tx.isOverridden && <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-600">手动</span>}
                  </div>
                </div>
                <span className="text-sm font-medium text-red-500 flex-shrink-0">-{fmtMoney(tx.amount)}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {filtered.length === 0 && (
        <div className="text-center py-12 text-sm text-ink-tertiary">没有匹配的交易</div>
      )}

      {editingTx && (
        <CategoryPicker tx={editingTx} currentCatKey={editingTx.catKey} currentSubKey={editingTx.subKey}
          onSelect={handleSelect} onClose={() => setEditingIdx(null)} />
      )}
    </div>
  )
}

function txKey(tx) {
  return `${tx.date.toISOString()}_${tx.amount}_${tx.name}`
}
