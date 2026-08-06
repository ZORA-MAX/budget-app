import { useState, useMemo, useRef, useEffect } from 'react'
import ReactDOM from 'react-dom'
import { classify } from '../lib/classifier'
import { CATEGORIES, getCategoryByKey, ALL_TAGS, TAG_MAP } from '../lib/categories'
import { fmtMoney, txKey } from '../lib/csv-parser'
import CatIcon from './CatIcon'

/* ═══ Edit Modal (centered, flat tabs) ═══ */
function EditModal({ txNames, count, currentCatKey, currentSubKey, currentTags, onSave, onDelete, onClose }) {
  const [catKey, setCatKey] = useState(currentCatKey)
  const [subKey, setSubKey] = useState(currentSubKey)
  const [tags, setTags] = useState(currentTags || getCategoryByKey(currentCatKey).defaultTags || [])
  const [tab, setTab] = useState('category')
  const cat = getCategoryByKey(catKey)
  const toggleTag = k => setTags(p => p.includes(k) ? p.filter(t => t !== k) : [...p, k])

  return ReactDOM.createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" />
      <div className="relative bg-white dark:bg-surface-card-dark rounded-2xl w-full max-w-lg max-h-[80vh] overflow-hidden flex flex-col"
        style={{ boxShadow: '0 24px 80px rgba(0,0,0,.18), 0 8px 24px rgba(0,0,0,.08)' }}
        onClick={e => e.stopPropagation()}>
        <div className="px-5 pt-5 pb-3 border-b border-gray-100 dark:border-gray-800 flex-shrink-0">
          <div className="flex items-center justify-between">
            <span className="text-base font-semibold text-ink dark:text-white">{count > 1 ? `批量编辑 ${count} 笔` : '编辑交易'}</span>
            <button onClick={onClose} className="w-8 h-8 rounded-full hover:bg-gray-100 flex items-center justify-center text-ink-tertiary">✕</button>
          </div>
          <div className="text-sm text-ink-secondary mt-1 truncate">{txNames}</div>
        </div>
        <div className="flex border-b border-gray-100 dark:border-gray-800 flex-shrink-0">
          {['category','tags'].map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`flex-1 py-2.5 text-sm font-medium ${tab === t ? 'text-brand border-b-2 border-brand' : 'text-ink-tertiary'}`}>
              {t === 'category' ? '分类' : '消费性质'}
            </button>
          ))}
        </div>
        <div className="overflow-y-auto flex-1 p-4">
          {tab === 'category' ? (<>
            <p className="text-xs text-ink-tertiary mb-3">选择一级分类</p>
            <div className="grid grid-cols-3 gap-2 mb-4">
              {CATEGORIES.map(c => (
                <button key={c.key} onClick={() => { setCatKey(c.key); setSubKey(c.subs[0]?.key || ''); setTags(c.defaultTags || []) }}
                  className={`flex flex-col items-center gap-1.5 p-2.5 rounded-xl border transition-colors
                    ${catKey === c.key ? 'border-brand bg-brand-faint' : 'border-gray-100 dark:border-gray-800 hover:bg-gray-50'}`}>
                  <CatIcon iconKey={c.icon} color={c.color} bg={c.bg} size={28} />
                  <span className={`text-[11px] ${catKey === c.key ? 'text-brand font-medium' : 'text-ink-secondary'}`}>{c.label}</span>
                </button>
              ))}
            </div>
            <p className="text-xs text-ink-tertiary mb-2">子分类</p>
            <div className="flex flex-wrap gap-1.5">
              {cat.subs.filter(s => s.label).map(s => (
                <button key={s.key} onClick={() => setSubKey(s.key)}
                  className={`text-xs px-3 py-1.5 rounded-lg border ${subKey === s.key ? 'border-brand bg-brand-faint text-brand font-medium' : 'border-gray-200 text-ink-secondary'}`}>
                  {s.label}
                </button>
              ))}
              <button onClick={() => {
                const name = prompt('输入新的子分类名称：')
                if (name && name.trim()) {
                  const newKey = 'custom_' + Date.now()
                  cat.subs.push({ key: newKey, label: name.trim(), keywords: [] })
                  setSubKey(newKey)
                }
              }} className="text-xs px-3 py-1.5 rounded-lg border border-dashed border-gray-300 text-ink-tertiary hover:border-brand hover:text-brand transition-colors">
                + 添加子分类
              </button>
            </div>
          </>) : (<>
            <p className="text-xs text-ink-tertiary mb-3">选择消费性质（可多选）</p>
            <div className="flex flex-wrap gap-2">
              {ALL_TAGS.map(t => (
                <button key={t.key} onClick={() => toggleTag(t.key)}
                  className={`text-xs px-3 py-1.5 rounded-lg border ${tags.includes(t.key) ? 'font-medium border-transparent' : 'border-gray-200 text-ink-tertiary'}`}
                  style={tags.includes(t.key) ? { backgroundColor: t.bg, color: t.color } : {}}>
                  {t.label}{tags.includes(t.key) && ' ✓'}
                </button>
              ))}
            </div>
          </>)}
        </div>
        <div className="px-5 py-3 border-t border-gray-100 flex gap-2 flex-shrink-0">
          {onDelete && <button onClick={onDelete} className="px-4 py-2 rounded-xl text-sm text-red-500 hover:bg-red-50">删除</button>}
          <div className="flex-1" />
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm text-ink-secondary hover:bg-gray-100">取消</button>
          <button onClick={() => onSave(catKey, subKey, tags)} className="px-5 py-2 rounded-xl text-sm font-medium bg-brand text-white">保存</button>
        </div>
      </div>
    </div>,
    document.body
  )
}

/* ═══ Add Modal ═══ */
function AddModal({ onAdd, onClose, defaultMonth }) {
  const [name, setName] = useState('')
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(defaultMonth ? `${defaultMonth}-01` : new Date().toISOString().split('T')[0])
  const handleAdd = () => { const a = parseFloat(amount); if (!name.trim() || !a) return; onAdd({ name: name.trim(), amount: a, date: new Date(date), source: 'manual' }); onClose() }

  return ReactDOM.createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" />
      <div className="relative bg-white dark:bg-surface-card-dark rounded-2xl w-full max-w-sm"
        style={{ boxShadow: '0 24px 80px rgba(0,0,0,.18)' }} onClick={e => e.stopPropagation()}>
        <div className="px-5 pt-5 pb-3">
          <div className="text-base font-semibold text-ink dark:text-white mb-4">添加交易</div>
          <div className="space-y-3">
            <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="商家/描述"
              className="w-full px-3 py-2.5 rounded-lg border border-gray-200 bg-gray-50 text-sm outline-none focus:border-brand" />
            <input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="金额" step="0.01"
              className="w-full px-3 py-2.5 rounded-lg border border-gray-200 bg-gray-50 text-sm outline-none focus:border-brand" />
            <input type="date" value={date} onChange={e => setDate(e.target.value)}
              className="w-full px-3 py-2.5 rounded-lg border border-gray-200 bg-gray-50 text-sm outline-none focus:border-brand" />
          </div>
        </div>
        <div className="px-5 py-3 border-t border-gray-100 flex gap-2 justify-end">
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm text-ink-secondary">取消</button>
          <button onClick={handleAdd} className="px-5 py-2 rounded-xl text-sm font-medium bg-brand text-white">添加</button>
        </div>
      </div>
    </div>,
    document.body
  )
}

/* ═══ Main: Sidebar + List Layout ═══ */
export default function TransactionList({ transactions, overrides, onOverride, onDelete, onAdd, defaultMonth }) {
  const [editingIdx, setEditingIdx] = useState(null)
  const [showAdd, setShowAdd] = useState(false)
  const [batchMode, setBatchMode] = useState(false)
  const [selected, setSelected] = useState(new Set())
  const [batchEdit, setBatchEdit] = useState(false)
  const [activeCat, setActiveCat] = useState('all')
  const [tagFilter, setTagFilter] = useState(null)
  const [searchTerm, setSearchTerm] = useState('')
  const contentRef = useRef(null)

  const classified = useMemo(() =>
    transactions.map((tx, i) => {
      const key = txKey(tx)
      const ov = overrides[key]
      const { catKey, subKey } = ov || classify(tx.name, tx.originalCategory)
      const tags = ov?.tags || getCategoryByKey(catKey).defaultTags || []
      const cat = getCategoryByKey(catKey)
      const sub = cat.subs?.find(s => s.key === subKey)
      return { ...tx, idx: i, catKey, subKey, tags, cat, sub, isOverridden: !!ov, txKey: key }
    }),
  [transactions, overrides])

  // Category counts
  const catCounts = useMemo(() => {
    const m = {}
    for (const t of classified) m[t.catKey] = (m[t.catKey] || 0) + 1
    return m
  }, [classified])

  // Filter
  const filtered = useMemo(() => {
    let list = classified
    if (activeCat !== 'all') list = list.filter(t => t.catKey === activeCat)
    if (tagFilter) list = list.filter(t => t.tags.includes(tagFilter))
    if (searchTerm.trim()) { const s = searchTerm.toLowerCase(); list = list.filter(t => t.name.toLowerCase().includes(s)) }
    return list
  }, [classified, activeCat, tagFilter, searchTerm])

  // Grouped
  const grouped = useMemo(() => {
    const m = {}
    for (const tx of filtered) {
      if (!m[tx.catKey]) m[tx.catKey] = { cat: tx.cat, txs: [], total: 0 }
      m[tx.catKey].txs.push(tx)
      m[tx.catKey].total += tx.amount
    }
    return Object.values(m).sort((a, b) => b.total - a.total)
  }, [filtered])

  const toggleSelect = idx => setSelected(p => { const s = new Set(p); s.has(idx) ? s.delete(idx) : s.add(idx); return s })
  const clearSelect = () => { setSelected(new Set()); setBatchMode(false) }

  const handleSaveSingle = (c, s, t) => { if (editingIdx === null) return; onOverride(txKey(transactions[editingIdx]), { catKey: c, subKey: s, tags: t }); setEditingIdx(null) }
  const handleDeleteSingle = () => { if (editingIdx === null) return; onDelete(txKey(transactions[editingIdx])); setEditingIdx(null) }
  const handleSaveBatch = (c, s, t) => { for (const i of selected) onOverride(txKey(transactions[i]), { catKey: c, subKey: s, tags: t }); setBatchEdit(false); clearSelect() }
  const handleDeleteBatch = () => { for (const i of selected) onDelete(txKey(transactions[i])); setBatchEdit(false); clearSelect() }

  const editingTx = editingIdx !== null ? classified.find(t => t.idx === editingIdx) : null

  return (
    <div className="flex gap-3" style={{ minHeight: '60vh' }}>
      {/* ─── Left Sidebar ─── */}
      <div className="w-20 flex-shrink-0 sticky top-0 self-start">
        <div className="bg-white dark:bg-surface-card-dark rounded-xl overflow-hidden" style={{ boxShadow: '0 1px 4px rgba(0,0,0,.06)' }}>
          <button onClick={() => setActiveCat('all')}
            className={`w-full py-2.5 px-1 text-center text-[11px] border-b border-gray-50 transition-colors
              ${activeCat === 'all' ? 'bg-brand text-white font-medium' : 'text-ink-secondary hover:bg-gray-50'}`}>
            全部<br/><span className="text-[10px] opacity-70">{classified.length}</span>
          </button>
          {CATEGORIES.filter(c => catCounts[c.key]).map(c => (
            <button key={c.key} onClick={() => setActiveCat(activeCat === c.key ? 'all' : c.key)}
              className={`w-full py-2 px-1 text-center border-b border-gray-50 transition-colors
                ${activeCat === c.key ? 'bg-brand-faint border-l-2 border-l-brand' : 'hover:bg-gray-50'}`}>
              <div className="text-base mb-0.5">{c.icon === 'housing' ? '🏠' : c.icon === 'food' ? '🍜' : c.icon === 'transport' ? '🚌' : c.icon === 'daily' ? '🧴' : c.icon === 'fashion' ? '👗' : c.icon === 'digital' ? '💻' : c.icon === 'career' ? '💼' : c.icon === 'education' ? '📚' : c.icon === 'health' ? '💊' : c.icon === 'sport' ? '🏃' : c.icon === 'entertain' ? '🎮' : c.icon === 'travel' ? '✈️' : c.icon === 'social' ? '🧧' : c.icon === 'transfer' ? '🔄' : '📦'}</div>
              <div className={`text-[10px] leading-tight ${activeCat === c.key ? 'text-brand font-medium' : 'text-ink-secondary'}`}>{c.label}</div>
              <div className="text-[9px] text-ink-tertiary">{catCounts[c.key]}</div>
            </button>
          ))}
        </div>
      </div>

      {/* ─── Right Content ─── */}
      <div className="flex-1 min-w-0 space-y-3" ref={contentRef}>
        {/* Sticky toolbar */}
        <div className="bg-white dark:bg-surface-card-dark rounded-xl p-3 sticky top-0 z-30" style={{ boxShadow: '0 2px 8px rgba(0,0,0,.05)' }}>
          <div className="flex items-center gap-1.5 mb-2">
            <input type="text" placeholder="搜索..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
              className="flex-1 px-2.5 py-1.5 rounded-lg border border-gray-200 bg-gray-50 text-xs outline-none focus:border-brand min-w-0" />
            <button onClick={() => setShowAdd(true)} className="text-[11px] px-2 py-1.5 rounded-md bg-brand text-white flex-shrink-0">+添加</button>
            <button onClick={() => batchMode ? clearSelect() : setBatchMode(true)}
              className={`text-[11px] px-2 py-1.5 rounded-md flex-shrink-0 ${batchMode ? 'bg-amber-500 text-white' : 'border border-gray-200 text-ink-tertiary'}`}>
              {batchMode ? '取消' : '多选'}
            </button>
          </div>
          {/* Tag filter chips */}
          <div className="flex gap-1 overflow-x-auto scrollbar-hide">
            <button onClick={() => setTagFilter(null)}
              className={`text-[10px] px-2 py-1 rounded-md flex-shrink-0 ${!tagFilter ? 'bg-brand text-white' : 'bg-gray-100 text-ink-tertiary'}`}>全部性质</button>
            {['rigid','elastic','emotion','social','efficiency','growth','reward','non_expense'].map(k => {
              const t = TAG_MAP[k]; if (!t) return null
              return <button key={k} onClick={() => setTagFilter(tagFilter === k ? null : k)}
                className={`text-[10px] px-2 py-1 rounded-md flex-shrink-0 ${tagFilter === k ? 'font-medium' : 'bg-gray-100 text-ink-tertiary'}`}
                style={tagFilter === k ? { backgroundColor: t.bg, color: t.color } : {}}>{t.label}</button>
            })}
          </div>
          {batchMode && selected.size > 0 && (
            <div className="flex items-center gap-2 mt-2 pt-2 border-t border-gray-100">
              <span className="text-[11px] text-ink-secondary flex-1">已选 {selected.size} 笔</span>
              <button onClick={() => setBatchEdit(true)} className="text-[11px] px-2.5 py-1 rounded-md bg-brand text-white">批量改</button>
              <button onClick={handleDeleteBatch} className="text-[11px] px-2.5 py-1 rounded-md text-red-500 hover:bg-red-50">批量删</button>
            </div>
          )}
        </div>

        {/* Transaction groups */}
        {grouped.map(group => (
          <div key={group.cat.key} className="bg-white dark:bg-surface-card-dark rounded-xl overflow-hidden">
            <div className="flex items-center gap-2.5 px-3 py-2.5 border-b border-gray-100 bg-gray-50/50">
              <CatIcon iconKey={group.cat.icon} color={group.cat.color} bg={group.cat.bg} size={30} />
              <div className="flex-1">
                <span className="text-sm font-medium text-ink dark:text-white">{group.cat.label}</span>
                <span className="text-[11px] text-ink-tertiary ml-2">{group.txs.length}笔</span>
              </div>
              <span className="text-sm font-semibold">{fmtMoney(group.total)}</span>
            </div>
            {group.txs.map(tx => (
              <div key={tx.idx} className="flex items-center gap-2 px-3 py-2 border-b border-gray-50 last:border-0 hover:bg-gray-50/50 transition-colors">
                {batchMode && (
                  <input type="checkbox" checked={selected.has(tx.idx)} onChange={() => toggleSelect(tx.idx)}
                    className="w-3.5 h-3.5 rounded flex-shrink-0" style={{ accentColor: '#534ab7' }} />
                )}
                <button onClick={() => batchMode ? toggleSelect(tx.idx) : setEditingIdx(tx.idx)} className="flex-1 flex items-center gap-2 text-left min-w-0">
                  <div className="w-0.5 h-6 rounded-full flex-shrink-0" style={{ backgroundColor: group.cat.color + '50' }} />
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] text-ink dark:text-white truncate">{tx.name || '未知'}</div>
                    <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                      <span className="text-[10px] text-ink-tertiary">{tx.date.getMonth()+1}/{tx.date.getDate()}</span>
                      <span className="text-[9px] px-1.5 py-0.5 rounded" style={{ backgroundColor: group.cat.bg, color: group.cat.color }}>{tx.sub?.label || '未分类'}</span>
                      {tx.tags?.slice(0,2).map(t => { const tag = TAG_MAP[t]; return tag ? <span key={t} className="text-[9px] px-1 py-0.5 rounded" style={{ backgroundColor: tag.bg, color: tag.color }}>{tag.label}</span> : null })}
                      {tx.isOverridden && <span className="text-[9px] px-1 py-0.5 rounded bg-amber-50 text-amber-600">手动</span>}
                    </div>
                  </div>
                  <span className="text-[13px] font-medium text-red-500 flex-shrink-0">-{fmtMoney(tx.amount)}</span>
                </button>
              </div>
            ))}
          </div>
        ))}

        {filtered.length === 0 && <div className="text-center py-12 text-sm text-ink-tertiary">没有匹配的交易</div>}
      </div>

      {/* Modals */}
      {editingTx && !batchEdit && (
        <EditModal txNames={editingTx.name} count={1} currentCatKey={editingTx.catKey} currentSubKey={editingTx.subKey}
          currentTags={editingTx.tags} onSave={handleSaveSingle} onDelete={handleDeleteSingle} onClose={() => setEditingIdx(null)} />
      )}
      {batchEdit && (
        <EditModal txNames={`${selected.size} 笔交易`} count={selected.size}
          currentCatKey={CATEGORIES[0].key} currentSubKey={CATEGORIES[0].subs[0]?.key}
          currentTags={CATEGORIES[0].defaultTags} onSave={handleSaveBatch} onDelete={handleDeleteBatch} onClose={() => setBatchEdit(false)} />
      )}
      {showAdd && <AddModal onAdd={onAdd} onClose={() => setShowAdd(false)} defaultMonth={defaultMonth} />}
    </div>
  )
}
