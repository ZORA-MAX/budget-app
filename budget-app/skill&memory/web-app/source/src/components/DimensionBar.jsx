import { useMemo } from 'react'
import { TAG_MAP } from '../lib/categories'
import { fmtMoney } from '../lib/csv-parser'

export default function DimensionBar({ tagTotals, total }) {
  const sorted = useMemo(() =>
    Object.entries(tagTotals)
      .filter(([k]) => TAG_MAP[k])
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6),
  [tagTotals])

  if (sorted.length === 0 || total === 0) return null
  const maxVal = sorted[0]?.[1] || 1

  return (
    <div className="bg-white dark:bg-surface-card-dark rounded-xl p-4">
      <div className="text-xs font-medium text-ink-secondary uppercase tracking-wider mb-4">消费性质分布</div>
      <div className="space-y-3">
        {sorted.map(([tagKey, val]) => {
          const tag = TAG_MAP[tagKey]
          if (!tag) return null
          const pct = Math.round(val / total * 100)
          const barW = Math.round(val / maxVal * 100)
          return (
            <div key={tagKey}>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-medium px-2 py-0.5 rounded-md" style={{ backgroundColor: tag.bg, color: tag.color }}>{tag.label}</span>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-ink dark:text-white">{fmtMoney(val)}</span>
                  <span className="text-xs text-ink-tertiary w-8 text-right">{pct}%</span>
                </div>
              </div>
              <div className="h-2.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                <div className="h-full rounded-full transition-all duration-500" style={{ width: `${barW}%`, backgroundColor: tag.color }} />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
