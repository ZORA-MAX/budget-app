import { useState, useMemo, useRef } from 'react'
import ReactDOM from 'react-dom'
import { resolveClassification } from '../lib/classifier'
import {
  CATEGORIES,
  getCategoryByKey,
  ALL_TAGS,
  TAG_MAP,
  addCategory,
  renameCategory,
  addSubcategory,
  renameSubcategory,
  addTag,
  renameTag,
} from '../lib/categories'
import { fmtMoney, txKey } from '../lib/csv-parser'
import CatIcon from './CatIcon'

function PencilIcon() {
  return (
    <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M10.8 2.2l3 3L6 13l-3.5.5L3 10z" />
      <path d="M9.7 3.3l3 3" />
    </svg>
  )
}

const TAXONOMY_LABELS = {
  category: '一级分类',
  subcategory: '子分类',
  tag: '消费性质',
}

function TaxonomyEditor({ editor, onSubmit, onClose }) {
  const [value, setValue] = useState(editor.initialValue || '')
  const label = TAXONOMY_LABELS[editor.type]
  const isAdd = editor.mode === 'add'

  return (
    <div className="fixed inset-0 z-[10001] flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-slate-950/25 backdrop-blur-[2px]" />
      <form onSubmit={e => { e.preventDefault(); if (value.trim()) onSubmit(value.trim()) }}
        role="dialog" aria-modal="true" aria-labelledby="taxonomy-editor-title"
        className="relative w-full max-w-sm rounded-2xl bg-white dark:bg-surface-card-dark p-5 shadow-2xl border border-gray-100 dark:border-gray-700"
        onClick={e => e.stopPropagation()}>
        <h3 id="taxonomy-editor-title" className="text-base font-semibold text-ink dark:text-white">
          {isAdd ? `新增${label}` : `修改${label}名称`}
        </h3>
        <p className="text-xs text-ink-tertiary mt-1 mb-4">保存后会保留在当前浏览器中。</p>
        <label className="block">
          <span className="block text-sm text-ink-secondary mb-2">{label}名称</span>
          <input autoFocus value={value} onChange={e => setValue(e.target.value)} maxLength="20"
            placeholder={`输入${label}名称`}
            className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 px-3.5 py-3 text-base text-ink dark:text-white outline-none focus:border-brand focus:ring-2 focus:ring-brand/10" />
        </label>
        <div className="flex justify-end gap-2 mt-5">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl text-sm text-ink-secondary hover:bg-gray-100 dark:hover:bg-gray-800">取消</button>
          <button type="submit" disabled={!value.trim()} className="px-5 py-2 rounded-xl text-sm font-semibold bg-brand text-white disabled:opacity-40">
            {isAdd ? '新增' : '保存名称'}
          </button>
        </div>
      </form>
    </div>
  )
}

/* ═══ Edit Modal (desktop: all fields visible in three columns) ═══ */
function EditModal({ txName, currentAmount, count, mergeMemory, currentCatKey, currentSubKey, currentTags, onSave, onDelete, onClose }) {
  const [catKey, setCatKey] = useState(currentCatKey)
  const [subKey, setSubKey] = useState(currentSubKey)
  const [tags, setTags] = useState(currentTags || getCategoryByKey(currentCatKey).defaultTags || [])
  const [name, setName] = useState(txName || '')
  const [amount, setAmount] = useState(currentAmount == null ? '' : String(currentAmount))
  const [taxonomyEditor, setTaxonomyEditor] = useState(null)
  const [, refreshTaxonomy] = useState(0)
  const cat = getCategoryByKey(catKey)
  const isBatch = count > 1
  const parsedAmount = Number.parseFloat(amount)
  const canSave = isBatch || (name.trim() && Number.isFinite(parsedAmount) && parsedAmount > 0)
  const toggleTag = k => setTags(p => p.includes(k) ? p.filter(t => t !== k) : [...p, k])
  const openTaxonomyEditor = (type, mode, item = null) => {
    setTaxonomyEditor({ type, mode, key: item?.key, initialValue: item?.label || '' })
  }
  const handleTaxonomySubmit = label => {
    if (!taxonomyEditor) return
    if (taxonomyEditor.type === 'category') {
      if (taxonomyEditor.mode === 'add') {
        const category = addCategory(label)
        setCatKey(category.key)
        setSubKey(category.subs[0]?.key || '')
        setTags(category.defaultTags || [])
      } else {
        renameCategory(taxonomyEditor.key, label)
      }
    }
    if (taxonomyEditor.type === 'subcategory') {
      if (taxonomyEditor.mode === 'add') {
        const sub = addSubcategory(catKey, label)
        if (sub) setSubKey(sub.key)
      } else {
        renameSubcategory(catKey, taxonomyEditor.key, label)
      }
    }
    if (taxonomyEditor.type === 'tag') {
      if (taxonomyEditor.mode === 'add') {
        const tag = addTag(label)
        setTags(previous => [...previous, tag.key])
      } else {
        renameTag(taxonomyEditor.key, label)
      }
    }
    refreshTaxonomy(version => version + 1)
    setTaxonomyEditor(null)
  }
  const handleSave = () => {
    if (!canSave) return
    onSave({
      catKey,
      subKey,
      tags,
      ...(isBatch ? {} : { editedName: name.trim(), editedAmount: parsedAmount }),
    })
  }

  return ReactDOM.createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-slate-950/35 backdrop-blur-sm" />
      <div role="dialog" aria-modal="true" aria-labelledby="edit-transaction-title" data-testid="edit-transaction-dialog"
        className="relative bg-white dark:bg-surface-card-dark rounded-2xl w-full lg:w-[min(1480px,calc(100vw-32px))] max-h-[calc(100vh-24px)] lg:max-h-[calc(100vh-32px)] overflow-hidden flex flex-col"
        style={{ boxShadow: '0 28px 90px rgba(15,23,42,.22), 0 10px 28px rgba(15,23,42,.10)' }}
        onClick={e => e.stopPropagation()}>
        <div className="px-5 lg:px-7 py-4 border-b border-gray-100 dark:border-gray-800 flex-shrink-0">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <h2 id="edit-transaction-title" className="text-lg font-semibold text-ink dark:text-white">{isBatch ? `批量编辑 ${count} 笔交易` : '编辑交易'}</h2>
              <p className="text-sm text-ink-secondary mt-0.5 truncate">{isBatch ? '为已选交易统一设置分类和消费性质' : '名称、金额、分类与消费性质可在同一页完成修改'}</p>
            </div>
            <button onClick={onClose} aria-label="关闭编辑窗口" className="w-9 h-9 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 flex items-center justify-center text-ink-tertiary flex-shrink-0">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </div>
        </div>

        <div className="overflow-y-auto min-[580px]:overflow-visible flex-1 min-h-0 p-4 min-[580px]:p-3 lg:p-6">
          <div className="grid grid-cols-1 min-[580px]:grid-cols-[100px_minmax(0,1fr)_160px] md:grid-cols-[180px_minmax(0,1fr)_180px] lg:grid-cols-[240px_minmax(0,1fr)_250px] gap-4 min-[580px]:gap-2 lg:gap-5 min-[580px]:h-full">
            <section className="rounded-2xl bg-gray-50/80 dark:bg-gray-900/30 border border-gray-100 dark:border-gray-800 p-4 min-[580px]:p-2.5 lg:p-5">
              <div className="flex items-center gap-2 mb-4">
                <span className="w-6 h-6 rounded-full bg-brand text-white text-xs font-semibold flex items-center justify-center">1</span>
                <h3 className="text-base font-semibold text-ink dark:text-white">消费内容与金额</h3>
              </div>
              {isBatch ? (
                <div className="rounded-xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 p-4">
                  <div className="text-2xl font-semibold text-brand">{count}</div>
                  <div className="text-sm text-ink-secondary mt-1">笔交易已选中</div>
                  <p className="text-xs text-ink-tertiary leading-relaxed mt-4">批量编辑不会修改每笔交易原有的名称与金额。</p>
                </div>
              ) : (
                <div className="space-y-4">
                  <label className="block">
                    <span className="block text-sm font-medium text-ink-secondary mb-2">消费名称</span>
                    <textarea value={name} onChange={e => setName(e.target.value)} rows="4" placeholder="输入商家或消费内容"
                      className="w-full resize-none rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3.5 py-3 text-base leading-relaxed text-ink dark:text-white outline-none focus:border-brand focus:ring-2 focus:ring-brand/10" />
                  </label>
                  <label className="block">
                    <span className="block text-sm font-medium text-ink-secondary mb-2">消费金额</span>
                    <div className="relative">
                      <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-base font-medium text-ink-secondary">¥</span>
                      <input type="number" min="0.01" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00"
                        className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 pl-8 pr-3.5 py-3 text-xl font-semibold tabular-nums text-ink dark:text-white outline-none focus:border-brand focus:ring-2 focus:ring-brand/10" />
                    </div>
                  </label>
                  {mergeMemory?.details?.length > 0 && (
                    <div className="rounded-xl border border-purple-100 bg-purple-50/70 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-purple-700">🧠 自动合并明细</span>
                        <span className="text-[11px] text-purple-500">共 {mergeMemory.count} 笔</span>
                      </div>
                      <p className="text-[11px] text-purple-600/80 mt-1">{mergeMemory.label}</p>
                      <div className="mt-2 max-h-40 overflow-y-auto divide-y divide-purple-100">
                        {mergeMemory.details.map((detail, index) => (
                          <div key={`${detail.date}-${detail.amount}-${index}`} className="flex items-center justify-between gap-3 py-1.5 text-xs">
                            <span className="text-ink-secondary">{detail.date}</span>
                            <span className="font-medium tabular-nums text-ink">{fmtMoney(detail.amount)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {!canSave && <p className="text-xs text-red-500">请填写消费名称，并输入大于 0 的金额。</p>}
                </div>
              )}
            </section>

            <section className="rounded-2xl bg-white dark:bg-surface-card-dark border border-gray-200/80 dark:border-gray-700 p-4 min-[580px]:p-2.5 lg:p-5 min-w-0">
              <div className="flex items-center gap-2 mb-4">
                <span className="w-6 h-6 rounded-full bg-brand text-white text-xs font-semibold flex items-center justify-center">2</span>
                <div>
                  <h3 className="text-base font-semibold text-ink dark:text-white">消费分类</h3>
                  <p className="text-xs text-ink-tertiary mt-0.5">先选一级分类，再选择对应子分类</p>
                </div>
              </div>
              <div className="flex items-center justify-between gap-3 mb-3">
                <p className="text-sm font-medium text-ink-secondary">一级分类</p>
                <button type="button" data-testid="add-primary-category" onClick={() => openTaxonomyEditor('category', 'add')}
                  className="text-xs font-medium text-brand hover:bg-brand-faint px-2 py-1 rounded-lg">
                  + 新增
                </button>
              </div>
              <div data-testid="primary-category-grid" className="grid grid-cols-2 min-[580px]:grid-cols-5 gap-2 min-[580px]:gap-1.5 lg:gap-3 mb-5">
              {CATEGORIES.map(c => (
                <div key={c.key} className="relative group min-w-0">
                  <button onClick={() => { setCatKey(c.key); setSubKey(c.subs[0]?.key || ''); setTags(c.defaultTags || []) }}
                    aria-pressed={catKey === c.key}
                    className={`w-full min-h-16 flex flex-col items-center justify-center gap-1.5 px-1.5 py-2.5 rounded-xl border transition-colors
                      ${catKey === c.key ? 'border-brand bg-brand-faint shadow-sm' : 'border-gray-200 dark:border-gray-700 hover:border-brand/40 hover:bg-gray-50 dark:hover:bg-gray-800'}`}>
                    <CatIcon iconKey={c.icon} color={c.color} bg={c.bg} size={22} />
                    <span className={`text-xs lg:text-sm leading-tight whitespace-nowrap ${catKey === c.key ? 'text-brand font-semibold' : 'text-ink-secondary dark:text-gray-300 font-medium'}`}>{c.label}</span>
                  </button>
                  <button type="button" onClick={e => { e.stopPropagation(); openTaxonomyEditor('category', 'edit', c) }}
                    aria-label={`修改一级分类 ${c.label}`}
                    className="absolute top-1 right-1 w-5 h-5 rounded-md bg-white/90 dark:bg-gray-800 text-ink-tertiary hover:text-brand hover:bg-brand-faint flex items-center justify-center border border-gray-200/80 dark:border-gray-700">
                    <PencilIcon />
                  </button>
                </div>
              ))}
              </div>
              <div className="flex items-center justify-between gap-3 mb-2.5">
                <p className="text-sm font-medium text-ink-secondary">{cat.label} · 子分类</p>
                <span className="text-xs text-ink-tertiary">单选</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-2">
              {cat.subs.filter(s => s.label).map(s => (
                <div key={s.key} className="relative min-w-0">
                  <button onClick={() => setSubKey(s.key)} aria-pressed={subKey === s.key}
                    className={`w-full min-h-10 text-sm pl-3 pr-8 py-2 rounded-xl border truncate ${subKey === s.key ? 'border-brand bg-brand-faint text-brand font-semibold' : 'border-gray-200 dark:border-gray-700 text-ink-secondary dark:text-gray-300 hover:border-brand/40'}`}>
                    {s.label}
                  </button>
                  <button type="button" onClick={() => openTaxonomyEditor('subcategory', 'edit', s)}
                    aria-label={`修改子分类 ${s.label}`}
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 w-6 h-6 rounded-md text-ink-tertiary hover:text-brand hover:bg-brand-faint flex items-center justify-center">
                    <PencilIcon />
                  </button>
                </div>
              ))}
              <button type="button" data-testid="add-subcategory" onClick={() => openTaxonomyEditor('subcategory', 'add')}
                className="min-h-10 text-sm px-3 py-2 rounded-xl border border-dashed border-gray-300 text-ink-tertiary hover:border-brand hover:text-brand transition-colors">
                + 添加子分类
              </button>
              </div>
            </section>

            <section className="rounded-2xl bg-gray-50/80 dark:bg-gray-900/30 border border-gray-100 dark:border-gray-800 p-4 min-[580px]:p-2.5 lg:p-5">
              <div className="flex items-start justify-between gap-2 mb-4">
                <div className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-brand text-white text-xs font-semibold flex items-center justify-center">3</span>
                  <div>
                    <h3 className="text-base font-semibold text-ink dark:text-white">消费性质</h3>
                    <p className="text-xs text-ink-tertiary mt-0.5">可多选</p>
                  </div>
                </div>
                <button type="button" data-testid="add-spending-trait" onClick={() => openTaxonomyEditor('tag', 'add')}
                  className="text-[11px] lg:text-xs font-medium text-brand hover:bg-brand-faint px-1.5 lg:px-2 py-1 rounded-lg flex-shrink-0">+ 新增</button>
              </div>
              <div className="grid grid-cols-2 gap-2">
              {ALL_TAGS.map(t => (
                <div key={t.key} className="relative min-w-0">
                  <button onClick={() => toggleTag(t.key)} aria-pressed={tags.includes(t.key)}
                    className={`w-full min-h-9 text-sm min-[580px]:text-[11px] lg:text-sm pl-2 min-[580px]:pl-1.5 lg:pl-2.5 pr-7 py-1.5 rounded-lg border text-left truncate ${tags.includes(t.key) ? 'font-semibold border-transparent' : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-ink-secondary dark:text-gray-300 hover:border-brand/40'}`}
                    style={tags.includes(t.key) ? { backgroundColor: t.bg, color: t.color } : {}}>
                    {t.label}
                  </button>
                  <button type="button" onClick={() => openTaxonomyEditor('tag', 'edit', t)}
                    aria-label={`修改消费性质 ${t.label}`}
                    className="absolute right-1 top-1/2 -translate-y-1/2 w-5 h-5 rounded-md bg-white/70 dark:bg-gray-800/80 text-ink-tertiary hover:text-brand hover:bg-brand-faint flex items-center justify-center">
                    <PencilIcon />
                  </button>
                </div>
              ))}
              </div>
            </section>
          </div>
        </div>

        <div className="px-5 lg:px-7 py-3.5 border-t border-gray-100 dark:border-gray-800 flex items-center gap-2 flex-shrink-0 bg-white dark:bg-surface-card-dark">
          {onDelete && <button onClick={onDelete} className="px-4 py-2.5 rounded-xl text-sm font-medium text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30">删除</button>}
          <div className="flex-1" />
          <button onClick={onClose} className="px-4 py-2.5 rounded-xl text-sm font-medium text-ink-secondary hover:bg-gray-100 dark:hover:bg-gray-800">取消</button>
          <button onClick={handleSave} disabled={!canSave}
            className="px-6 py-2.5 rounded-xl text-sm font-semibold bg-brand text-white hover:bg-brand-light disabled:opacity-40 disabled:cursor-not-allowed">
            保存修改
          </button>
        </div>
        {taxonomyEditor && (
          <TaxonomyEditor key={`${taxonomyEditor.type}-${taxonomyEditor.mode}-${taxonomyEditor.key || 'new'}`}
            editor={taxonomyEditor} onSubmit={handleTaxonomySubmit} onClose={() => setTaxonomyEditor(null)} />
        )}
      </div>
    </div>,
    document.body
  )
}

/* ═══ Add Modal ═══ */
function AddModal({ onAdd, onClose }) {
  const [name, setName] = useState('')
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
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
export default function TransactionList({ transactions, overrides, memory = {}, onOverride, onDelete, onAdd }) {
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
      const effectiveTx = {
        ...tx,
        name: ov?.editedName ?? tx.name,
        amount: Number.isFinite(ov?.editedAmount) ? ov.editedAmount : tx.amount,
      }
      const resolved = resolveClassification(effectiveTx, ov, memory)
      const { catKey, subKey, tags, source } = resolved
      const cat = getCategoryByKey(catKey)
      const sub = cat.subs?.find(s => s.key === subKey)
      return { ...effectiveTx, idx: i, catKey, subKey, tags, cat, sub, classificationSource: source, isOverridden: !!ov, txKey: key }
    }),
  [transactions, overrides, memory])

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

  const handleSaveSingle = payload => {
    if (editingIdx === null || !editingTx) return
    const originalTx = transactions[editingIdx]
    const key = txKey(originalTx)
    onOverride(key, { ...overrides[key], ...payload }, {
      ...originalTx,
      name: payload.editedName,
      amount: payload.editedAmount,
    })
    setEditingIdx(null)
  }
  const handleDeleteSingle = () => { if (editingIdx === null) return; onDelete(txKey(transactions[editingIdx])); setEditingIdx(null) }
  const handleSaveBatch = payload => {
    for (const i of selected) {
      const tx = transactions[i]
      const key = txKey(tx)
      onOverride(key, { ...overrides[key], ...payload }, tx)
    }
    setBatchEdit(false)
    clearSelect()
  }
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
                      {!tx.isOverridden && tx.classificationSource === 'memory' && <span className="text-[9px] px-1 py-0.5 rounded bg-purple-50 text-purple-600">记忆</span>}
                      {tx.mergeMemory && <span className="text-[9px] px-1 py-0.5 rounded bg-purple-50 text-purple-600">🧠 合并 {tx.mergeMemory.count} 笔</span>}
                    </div>
                    {tx.mergeMemory?.details?.length > 0 && (
                      <div className="text-[10px] text-ink-tertiary mt-1 truncate">
                        明细：{tx.mergeMemory.details.map(detail => `${detail.date.slice(5)} ${fmtMoney(detail.amount)}`).join(' · ')}
                      </div>
                    )}
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
        <EditModal txName={editingTx.name} currentAmount={editingTx.amount} count={1} mergeMemory={editingTx.mergeMemory} currentCatKey={editingTx.catKey} currentSubKey={editingTx.subKey}
          currentTags={editingTx.tags} onSave={handleSaveSingle} onDelete={handleDeleteSingle} onClose={() => setEditingIdx(null)} />
      )}
      {batchEdit && (
        <EditModal count={selected.size}
          currentCatKey={CATEGORIES[0].key} currentSubKey={CATEGORIES[0].subs[0]?.key}
          currentTags={CATEGORIES[0].defaultTags} onSave={handleSaveBatch} onDelete={handleDeleteBatch} onClose={() => setBatchEdit(false)} />
      )}
      {showAdd && <AddModal onAdd={onAdd} onClose={() => setShowAdd(false)} />}
    </div>
  )
}
