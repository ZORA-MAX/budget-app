import { useState } from 'react'
import { fmtMoney } from '../lib/csv-parser'

const PREVIEW_LIMIT = 20

function formatDate(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '—'
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-') + ` ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

const DIRECTION_LABELS = { expense: '支出', income: '收入', refund: '退款', transfer: '资金流转', other: '其他' }
const PLATFORM_LABELS = { wechat: '微信', alipay: '支付宝', bank: '银行卡', cashbook: '记账本', screenshot: '消费截图' }

export default function ImportDataInspector({ files }) {
  const [open, setOpen] = useState(false)

  if (files.length === 0) return null

  const total = files.reduce((sum, file) => sum + file.txs.length, 0)
  const allTransactions = files.flatMap(file => file.txs)
  const expenseCount = allTransactions.filter(tx => (tx.direction || 'expense') === 'expense').length
  const incomeCount = allTransactions.filter(tx => tx.direction === 'income').length
  const refundCount = allTransactions.filter(tx => tx.direction === 'refund').length

  return (
    <section className="rounded-xl border border-sky-100 bg-sky-50/70 mb-2 overflow-hidden">
      <button type="button" onClick={() => setOpen(value => !value)} aria-expanded={open}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-sky-50 transition-colors">
        <div>
          <div className="text-sm font-medium text-sky-800">🔎 网页实际读到的数据</div>
          <div className="text-xs text-sky-700/70 mt-0.5">{files.length} 个文件 · {total} 笔流水（支出 {expenseCount} · 收入 {incomeCount} · 退款 {refundCount}）</div>
        </div>
        <span className="text-xs font-medium text-sky-700">{open ? '收起' : '查看字段与明细'}</span>
      </button>

      {open ? (
        <div className="border-t border-sky-100 px-4 py-3 space-y-4">
          <div className="rounded-lg bg-white/80 px-3 py-2 text-[11px] leading-relaxed text-sky-800">
            标准字段包含：完整时间、收支类型、金额、平台、交易对象、具体商品、状态、支付方式、账号、余额、交易号和订单号。
            同时保留每一行账单的全部原始列；Excel 会读取所有工作表，关闭或失败交易也会保留但不计入有效收支。
          </div>

          {files.map(file => (
            <div key={file.key}>
              <div className="flex items-center justify-between gap-3 mb-2">
                <div className="text-xs font-medium text-ink dark:text-white truncate">{file.filename}</div>
                <div className="text-[11px] text-ink-secondary flex-shrink-0">{file.sourceLabel} · {file.txs.length} 笔</div>
              </div>
              <div className="text-[10px] text-ink-tertiary mb-2 leading-relaxed">
                原始列：{[...new Set(file.txs.flatMap(tx => Object.keys(tx.rawFields || {})))].join('、') || '无'}
              </div>
              <div className="overflow-x-auto rounded-lg border border-sky-100 bg-white">
                <table className="min-w-[1100px] w-full text-[11px] text-left">
                  <thead className="bg-sky-50 text-sky-800">
                    <tr>
                      {['完整时间', '类型', '平台', '具体商品', '交易对象', '金额', '状态', '支付方式', '来源/工作表'].map(label => (
                        <th key={label} className="px-2.5 py-2 font-medium whitespace-nowrap">{label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 text-ink-secondary">
                    {file.txs.slice(0, PREVIEW_LIMIT).map((tx, index) => (
                      <tr key={`${tx.date?.toISOString?.() || ''}-${tx.amount}-${tx.name}-${index}`}>
                        <td className="px-2.5 py-2 whitespace-nowrap">{formatDate(tx.date)}</td>
                        <td className="px-2.5 py-2 whitespace-nowrap">{DIRECTION_LABELS[tx.direction || 'expense'] || tx.direction}</td>
                        <td className="px-2.5 py-2 max-w-28 truncate" title={tx.platform || ''}>{PLATFORM_LABELS[tx.platform] || tx.platform || PLATFORM_LABELS[tx.source] || tx.source || '—'}</td>
                        <td className="px-2.5 py-2 max-w-56 truncate font-medium text-ink" title={tx.productName || ''}>{tx.productName || '待截图补全'}</td>
                        <td className="px-2.5 py-2 max-w-40 truncate" title={tx.merchant || ''}>{tx.merchant || '—'}</td>
                        <td className={`px-2.5 py-2 whitespace-nowrap font-medium ${tx.direction === 'income' || tx.direction === 'refund' ? 'text-emerald-600' : 'text-ink'}`}>{fmtMoney(tx.amount)}</td>
                        <td className="px-2.5 py-2 max-w-28 truncate" title={tx.status || ''}>{tx.status || '—'}</td>
                        <td className="px-2.5 py-2 max-w-36 truncate" title={tx.paymentMethod || ''}>{tx.paymentMethod || '—'}</td>
                        <td className="px-2.5 py-2 whitespace-nowrap">{PLATFORM_LABELS[tx.source] || tx.source || '—'}{tx.sheetName ? ` / ${tx.sheetName}` : ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {file.txs.length > PREVIEW_LIMIT ? (
                <div className="text-[11px] text-ink-tertiary mt-1.5">这里只预览前 {PREVIEW_LIMIT} 笔；导出 Excel 会包含全部 {file.txs.length} 笔。</div>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
    </section>
  )
}
