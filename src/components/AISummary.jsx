import { useState } from 'react'
import { fmtMoney } from '../lib/csv-parser'

function generateLocalSummary(byCat, total, diff, prevTotal, month) {
  if (byCat.length === 0) return '暂无数据'
  const [y, m] = month.split('-')
  const lines = []
  lines.push(`${parseInt(m)}月总支出 ${fmtMoney(total)}，共 ${byCat.reduce((s, c) => s + c.count, 0)} 笔交易。`)
  const top = byCat[0]
  const topPct = Math.round(top.total / total * 100)
  lines.push(`${top.cat.label}支出最多（${fmtMoney(top.total)}，${topPct}%）。`)
  if (prevTotal > 0) {
    lines.push(diff > 0 ? `比上月多花 ${fmtMoney(Math.abs(diff))}，注意控制。` : diff < 0 ? `比上月少花 ${fmtMoney(Math.abs(diff))}，不错！` : '与上月持平。')
  }
  if (topPct > 40) lines.push(`⚠️ ${top.cat.label}占比超 40%，建议关注。`)
  const freq = byCat.filter(c => c.count > 15)
  if (freq.length) lines.push(`💡 ${freq.map(c => c.cat.label).join('、')}交易频次高，注意零散消费。`)
  return lines.join('')
}

export default function AISummary({ byCat, total, diff, prevTotal, month }) {
  const [loading, setLoading] = useState(false)
  const [aiText, setAiText] = useState('')
  const localSummary = generateLocalSummary(byCat, total, diff, prevTotal, month)
  const isStaticBackupSite = window.location.hostname.endsWith('github.io')

  const fetchAI = async () => {
    if (isStaticBackupSite) {
      setAiText('当前是稳定备用入口，月度小结和全部账单功能可正常使用；AI 深度分析需要后端服务，暂不在此入口提供。')
      return
    }
    setLoading(true)
    try {
      const payload = {
        month, total: Math.round(total), diff: Math.round(diff),
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
export function MiniAIInsight({ byCat, total, diff }) {
  if (byCat.length === 0 || total === 0) return null
  const top = byCat[0]
  const topPct = Math.round(top.total / total * 100)
  
  let insight = `${top.cat.label}占比最高（${topPct}%）`
  if (diff > 0) insight += `，本月整体支出上升`
  else if (diff < 0) insight += `，本月控制得不错`
  
  if (topPct > 40) insight += `。建议关注${top.cat.label}支出`
  else if (byCat.length >= 3) {
    const top3 = byCat.slice(0, 3).map(c => c.cat.label).join('、')
    insight += `。前三：${top3}`
  }

  return (
    <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-800">
      <div className="flex items-start gap-2">
        <span className="text-xs">💡</span>
        <p className="text-xs text-ink-secondary leading-relaxed">{insight}</p>
      </div>
    </div>
  )
}
