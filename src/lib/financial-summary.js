import { fmtMoney } from './csv-parser.js'

export function localFinancialSummary(byCat, total, month, unreviewedCount = 0) {
  if (!byCat.length || total <= 0) return '暂无可计入消费的数据。'
  const monthLabel = month ? `${Number(month.split('-')[1])}月` : '本月'
  const count = byCat.reduce((sum, category) => sum + category.count, 0)
  const label = unreviewedCount ? '消费额（含未核退款）' : '原单净消费（按总账核验）'
  const top = byCat[0]
  const topPct = Math.round(top.total / total * 100)
  const lines = [`${monthLabel}${label} ${fmtMoney(total)}，共 ${count} 笔计入消费的记录。`, `${top.cat.label}金额最多：${fmtMoney(top.total)}，占 ${topPct}%。`]
  const unknown = byCat.flatMap(category => category.subs || []).filter(sub => sub.sub?.key === 'unknown').reduce((sum, sub) => sum + sub.total, 0)
  if (unknown > 0) lines.push(`其中 ${fmtMoney(unknown)} 待分类，不能据此判断消费用途。`)
  return lines.join('')
}

export function localFinancialInsight(byCat, total) {
  if (!byCat.length || total <= 0) return ''
  return `原单消费分类：${byCat.slice(0, 3).map(category => `${category.cat.label} ${fmtMoney(category.total)}（${Math.round(category.total / total * 100)}%）`).join('；')}。`
}
