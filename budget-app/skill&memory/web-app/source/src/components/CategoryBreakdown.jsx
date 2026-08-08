import { useState } from 'react'
import { fmtMoney } from '../lib/csv-parser'
import CatIcon from './CatIcon'

export default function CategoryBreakdown({ byCat, total }) {
  const [expanded, setExpanded] = useState(null)

  return (
    <div className="bg-white dark:bg-surface-card-dark rounded-xl p-4 space-y-1">
      <div className="text-xs font-medium text-ink-secondary uppercase tracking-wider mb-3">分类明细</div>
      {byCat.map(item => {
        const pct = Math.round(item.total / total * 100)
        const isOpen = expanded === item.cat.key

        return (
          <div key={item.cat.key}>
            <button
              onClick={() => setExpanded(isOpen ? null : item.cat.key)}
              className="w-full flex items-center gap-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-800/50 rounded-lg px-2 transition-colors"
            >
              <CatIcon iconKey={item.cat.icon} color={item.cat.color} bg={item.cat.bg} size={40} />
              <div className="flex-1 min-w-0">
                <div className="flex justify-between items-baseline">
                  <span className="text-sm font-medium text-ink dark:text-white">{item.cat.label}</span>
                  <span className="text-sm font-semibold text-ink dark:text-white">{fmtMoney(item.total)}</span>
                </div>
                <div className="h-1 bg-gray-100 dark:bg-gray-700 rounded-full mt-1.5">
                  <div
                    className="h-1 rounded-full transition-all duration-500"
                    style={{ width: `${pct}%`, backgroundColor: item.cat.color }}
                  />
                </div>
              </div>
              <span className="text-xs text-ink-tertiary w-8 text-right">{pct}%</span>
              <span className="text-ink-tertiary text-xs">{isOpen ? '▾' : '▸'}</span>
            </button>

            {/* Subcategories */}
            {isOpen && item.subs.length > 0 && (
              <div className="ml-14 mb-2 space-y-1">
                {item.subs.map(s => (
                  <div key={s.sub.key} className="flex justify-between items-center py-1 text-sm">
                    <span className="text-ink-secondary">{s.sub.label}</span>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-ink-tertiary">{s.count}笔</span>
                      <span className="font-medium text-ink dark:text-white">{fmtMoney(s.total)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
