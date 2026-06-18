import { useMemo } from 'react'
import { classify } from '../lib/classifier'
import { getCategoryByKey } from '../lib/categories'
import { fmtMoney } from '../lib/csv-parser'
import CatIcon from './CatIcon'

export default function TopTransactions({ transactions, overrides = {} }) {
  const top = useMemo(() =>
    [...transactions].sort((a, b) => b.amount - a.amount).slice(0, 8),
  [transactions])

  return (
    <div className="bg-white dark:bg-surface-card-dark rounded-xl p-4">
      <div className="text-xs font-medium text-ink-secondary uppercase tracking-wider mb-3">最大单笔支出</div>
      <div className="divide-y divide-gray-100 dark:divide-gray-800">
        {top.map((tx, i) => {
          const key = `${tx.date.toISOString()}_${tx.amount}_${tx.name}`
          const override = overrides[key]
          const { catKey } = override || classify(tx.name, tx.originalCategory)
          const cat = getCategoryByKey(catKey)
          return (
            <div key={i} className="flex items-center gap-3 py-2.5">
              <CatIcon iconKey={cat.icon} color={cat.color} bg={cat.bg} size={36} />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-ink dark:text-white truncate">{tx.name || '未知'}</div>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-xs text-ink-tertiary">{tx.date.getMonth()+1}月{tx.date.getDate()}日</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ backgroundColor: cat.bg, color: cat.color }}>
                    {cat.label}
                  </span>
                </div>
              </div>
              <span className="text-sm font-semibold text-red-500 ml-2">-{fmtMoney(tx.amount)}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
