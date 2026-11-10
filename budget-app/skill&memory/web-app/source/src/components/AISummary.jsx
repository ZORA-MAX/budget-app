import { useState } from 'react'
import { localFinancialSummary, localFinancialInsight } from '../lib/financial-summary'


export default function AISummary({ byCat, total, diff, month, unreviewedCount = 0 }) {
  const [loading, setLoading] = useState(false)
  const [aiText, setAiText] = useState('')
  const localSummary = localFinancialSummary(byCat, total, month, unreviewedCount)
  const isStaticBackupSite = window.location.hostname.endsWith('github.io')

  const fetchAI = async () => {
    if (isStaticBackupSite) {
      setAiText('当前是稳定备用入口，月度小结和全部账单功能可正常使用；AI 深度分析需要后端服务，暂不在此入口提供。')
      return
    }
    setLoading(true)
    try {
      const payload = {
        month, total: Math.round(total), diff: Number.isFinite(diff) ? Math.round(diff) : null, accountingBasis: '原单净消费，未匹配退款不分摊',
        categories: byCat.map(c => ({ label: c.cat.label, total: Math.round(c.total), count: c.count, pct: Math.round(c.total / total * 100) })),
      }
      const res = await fetch('/api/ai-summary', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (res.ok) { const d = await res.json(); setAiText(d.summary) }
      else setAiText('AI 分析暂不可用，请在 Vercel 中配置 CLAUDE_API_KEY。')
    } catch { setAiText('AI 分析暂不可用，部署到 Vercel 后可用。') }
    setLoading(false)
  }

  return (
    <div className="space-y-3">
      <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-4">
        <div className="text-sm font-medium text-ink dark:text-white mb-2">📊 月末小结</div>
        <p className="text-sm text-ink-secondary leading-relaxed">{localSummary}</p>
      </div>
      {!aiText ? (
        <button onClick={fetchAI} disabled={loading}
          className="w-full py-3 rounded-xl text-sm font-medium bg-brand/10 text-brand hover:bg-brand/20 disabled:opacity-50 transition-colors">
          {loading ? '正在分析...' : isStaticBackupSite ? '✨ 查看备用入口说明' : '✨ 生成 AI 深度消费分析'}
        </button>
      ) : (
        <div className="bg-brand-faint dark:bg-brand/10 rounded-xl p-4 border border-brand/20">
          <div className="text-sm font-medium text-brand mb-2">✨ AI 消费分析</div>
          <p className="text-sm text-ink-secondary dark:text-gray-300 leading-relaxed whitespace-pre-line">{aiText}</p>
        </div>
      )}
    </div>
  )
}

// Small inline AI insight for below the total
export function MiniAIInsight({ byCat, total }) {
  if (byCat.length === 0 || total === 0) return null
  const insight = localFinancialInsight(byCat, total)

  return (
    <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-800">
      <div className="flex items-start gap-2">
        <span className="text-xs">💡</span>
        <p className="text-xs text-ink-secondary leading-relaxed">{insight}</p>
      </div>
    </div>
  )
}
