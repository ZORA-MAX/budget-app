import { fmtMoney } from '../lib/csv-parser'

function Notes({ notes }) {
  const lines = Array.isArray(notes) ? notes : notes ? [notes] : []
  const line = (note, index) => <p key={index} className="text-xs text-ink-secondary leading-relaxed mt-1">{String(note)}</p>
  return <>{lines.slice(0, 2).map(line)}{lines.length > 2 && <details className="mt-2 text-xs text-ink-secondary"><summary className="cursor-pointer">查看口径与待核实事项（{lines.length - 2} 条）</summary>{lines.slice(2).map(line)}</details>}</>
}

export default function DebtLedger({ ledger }) {
  if (!ledger?.items?.length) return null
  return <section className="rounded-xl border border-purple-200 bg-purple-50/50 p-4 space-y-3">
    <div><h2 className="font-semibold text-purple-800">贷款与年度偿债记录</h2><p className="text-xs text-purple-700 mt-1">截至 {ledger.asOf || '记录日期未提供'} · 余额、已还记录和未来计划分别展示；不自动计入消费。</p></div>
    <Notes notes={ledger.notes} />
    {ledger.items.map(item => <article key={item.id} className="bg-white dark:bg-surface-card-dark rounded-xl p-4">
      <h3 className="font-medium text-ink dark:text-white">{item.title}</h3>
      <div className="grid grid-cols-2 gap-3 mt-3">
        {[
          ['合同本金', item.originalPrincipal],
          [item.remainingPrincipalLabel || '剩余本金（已核验）', item.remainingPrincipal],
          ['待入账本金', item.unbilledPrincipal],
          ['待入账利息', item.unbilledInterest],
          ['每期还款参考', item.monthlyPayment],
          ['每月年度还款预留', item.annualReserve],
        ].filter(([, value]) => Number.isFinite(value)).map(([label, value]) => <div key={label}><div className="text-xs text-ink-secondary">{label}</div><div className="font-semibold mt-1">{fmtMoney(value)}</div></div>)}
        {Number.isFinite(item.remainingPeriods) && <div><div className="text-xs text-ink-secondary">待入账期数</div><div className="font-semibold mt-1">{item.remainingPeriods} 期</div></div>}
        {Number.isFinite(item.annualRate) && <div><div className="text-xs text-ink-secondary">合同年化利率</div><div className="font-semibold mt-1">{item.annualRate}%</div></div>}
      </div>
      <Notes notes={item.notes} />
      {!!item.payments?.length && <div className="mt-3 border-t pt-3"><div className="text-xs font-medium">有证据的还款记录</div>{item.payments.map((payment, i) => <div className="flex gap-3 justify-between text-xs py-1.5" key={i}><span>{payment.date || '日期待核实'} · {payment.label || '还款'} · {payment.status || '记录'}</span><strong className="whitespace-nowrap">{fmtMoney(payment.amount)}</strong></div>)}</div>}
      {!!item.schedule?.length && <details className="mt-3 text-xs"><summary className="cursor-pointer text-purple-700">查看还款计划与入账记录（{item.schedule.length} 条）</summary><div className="overflow-x-auto"><table className="w-full mt-2 text-left"><thead><tr><th>期次 / 日期</th><th>本金</th><th>利息</th><th>合计</th><th>状态</th></tr></thead><tbody>{item.schedule.map((entry, i) => <tr key={i} className="border-t"><td className="py-2">{entry.period ? `第${entry.period}期 ` : ''}{entry.date || '待核实'}</td><td>{Number.isFinite(entry.principal) ? fmtMoney(entry.principal) : '—'}</td><td>{Number.isFinite(entry.interest) ? fmtMoney(entry.interest) : '—'}</td><td>{Number.isFinite(entry.amount) ? fmtMoney(entry.amount) : '—'}</td><td>{entry.status || '计划，非实付'}</td></tr>)}</tbody></table></div></details>}
    </article>)}
  </section>
}
