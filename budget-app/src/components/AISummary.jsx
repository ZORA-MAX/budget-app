import { useState } from 'react'
import { fmtMoney } from '../lib/csv-parser'

/**
 * Generate a local rule-based summary.
 * This will be upgraded to Claude API in the next phase.
 */
function generateLocalSummary(byCat, total, diff, prevTotal, month) {
  if (byCat.length === 0) return '暂无数据'

  const [y, m] = month.split('-')
  const lines = []

  lines.push(`${parseInt(m)}月总支出 ${fmtMoney(total)}，共 ${byCat.reduce((s, c) => s + c.count, 0)} 笔交易。`)

  // Top category
  const top = byCat[0]
  const topPct = Math.round(top.total / total * 100)
  lines.push(`${top.cat.label}支出最多，占总支出 ${topPct}%（${fmtMoney(top.total)}）。`)

  // Month-over-month
  if (prevTotal > 0) {
    if (diff > 0) {
      lines.push(`比上月多花了 ${fmtMoney(Math.abs(diff))}，注意控制一下。`)
    } else if (diff < 0) {
      lines.push(`比上月少花了 ${fmtMoney(Math.abs(diff))}，控制得不错！`)
    } else {
      lines.push('与上月支出持平。')
    }
  }

  // High spending alert
  if (topPct > 40) {
    lines.push(`⚠️ ${top.cat.label}占比超过 40%，建议关注一下这部分支出。`)
  }

  // Small frequent spending
  const smallTxCats = byCat.filter(c => c.count > 15)
  if (smallTxCats.length > 0) {
    lines.push(`💡 ${smallTxCats.map(c => c.cat.label).join('、')}类交易频次较高，注意零散消费积少成多。`)
  }

  return lines.join('')
}

export default function AISummary({ byCat, total, diff, prevTotal, month }) {
  const [loading, setLoading] = useState(false)
  const [aiText, setAiText] = useState('')

  const localSummary = generateLocalSummary(byCat, total, diff, prevTotal, month)

  // AI summary via backend (Phase 2)
  const fetchAISummary = async () => {
    setLoading(true)
    try {
      const payload = {
        month,
        total,
        diff,
        categories: byCat.map(c => ({
          label: c.cat.label,
          total: Math.round(c.total),
          count: c.count,
          pct: Math.round(c.total / total * 100),
        })),
      }

      const res = await fetch('/api/ai-summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (res.ok) {
        const data = await res.json()
        setAiText(data.summary)
      } else {
        setAiText('AI 分析暂时不可用，请稍后再试。')
      }
    } catch {
      setAiText('AI 分析暂时不可用，请检查网络连接。')
    }
    setLoading(false)
  }

  return (
    <div className="space-y-3">
      {/* Local summary (always shown) */}
      <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-4">
        <div className="text-sm font-medium text-ink dark:text-white mb-2">📊 月末小结</div>
        <p className="text-sm text-ink-secondary leading-relaxed">{localSummary}</p>
      </div>

      {/* AI summary (click to load) */}
      {!aiText && (
        <button
          onClick={fetchAISummary}
          disabled={loading}
          className="w-full py-3 rounded-xl text-sm font-medium transition-colors
            bg-brand/10 text-brand hover:bg-brand/20 disabled:opacity-50"
        >
          {loading ? '正在分析...' : '✨ 生成 AI 深度分析'}
        </button>
      )}

      {aiText && (
        <div className="bg-brand-faint dark:bg-brand/10 rounded-xl p-4 border border-brand/20">
          <div className="text-sm font-medium text-brand mb-2">✨ AI 消费分析</div>
          <p className="text-sm text-ink-secondary dark:text-gray-300 leading-relaxed whitespace-pre-line">{aiText}</p>
        </div>
      )}
    </div>
  )
}
