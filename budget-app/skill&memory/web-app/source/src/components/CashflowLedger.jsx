import { fmtMoney, getTransactionDirection, txKey } from '../lib/csv-parser'

const DIRECTION = {
  expense: { label: '支出', className: 'bg-red-50 text-red-600' },
  income: { label: '收入', className: 'bg-emerald-50 text-emerald-700' },
  refund: { label: '退款', className: 'bg-sky-50 text-sky-700' },
  transfer: { label: '资金流转', className: 'bg-gray-100 text-gray-600' },
  other: { label: '其他', className: 'bg-gray-100 text-gray-600' },
}
const PLATFORM_LABELS = { wechat: '微信', alipay: '支付宝', bank: '银行卡', cashbook: '记账本', screenshot: '消费截图' }

function formatDateTime(date) {
  if (!(date instanceof Date)) return '—'
  return `${date.getMonth() + 1}月${date.getDate()}日 ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

export default function CashflowLedger({ transactions, overrides = {} }) {
  return (
    <section className="bg-white dark:bg-surface-card-dark rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800">
        <div className="text-sm font-semibold text-ink dark:text-white">完整收支流水</div>
        <div className="text-[11px] text-ink-tertiary mt-1">商品名优先采用已匹配截图；点击一笔流水可查看账单原始字段。</div>
      </div>
      <div className="divide-y divide-gray-100 dark:divide-gray-800">
        {transactions.slice().sort((a, b) => b.date - a.date).map((originalTx, index) => {
          const override = overrides[txKey(originalTx)]
          const tx = {
            ...originalTx,
            name: override?.editedName ?? originalTx.name,
            merchant: override?.editedMerchant ?? originalTx.merchant,
            productName: override?.editedProductName ?? originalTx.productName,
            details: override?.editedDetails ?? originalTx.details,
            amount: Number.isFinite(override?.editedAmount) ? override.editedAmount : originalTx.amount,
          }
          const direction = getTransactionDirection(originalTx, override)
          const meta = DIRECTION[direction] || DIRECTION.other
          const product = tx.productName || (direction === 'expense' ? '具体商品待截图补全' : tx.name || '—')
          return (
            <details key={`${tx.date?.toISOString?.() || ''}-${tx.amount}-${tx.name}-${index}`} className="group px-4 py-3">
              <summary className="list-none cursor-pointer flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded ${meta.className}`}>{meta.label}</span>
                    <span className="text-[11px] text-ink-tertiary">{formatDateTime(tx.date)}</span>
                    {tx.receiptMatch?.status === 'matched-enriched' ? <span className="text-[10px] text-emerald-600">✓ 截图已匹配</span> : null}
                  </div>
                  <div className={`text-sm mt-1 truncate ${tx.productName ? 'font-semibold text-ink dark:text-white' : 'text-amber-700'}`}>{product}</div>
                  <div className="text-[11px] text-ink-secondary mt-0.5 truncate">
                    {PLATFORM_LABELS[tx.platform] || tx.platform || PLATFORM_LABELS[tx.source] || tx.source || '平台未知'} · {tx.merchant || '交易对象未知'}
                  </div>
                </div>
                <div className={`text-sm font-semibold flex-shrink-0 ${direction === 'income' || direction === 'refund' ? 'text-emerald-600' : direction === 'expense' ? 'text-red-500' : 'text-ink'}`}>
                  {direction === 'income' || direction === 'refund' ? '+' : direction === 'expense' ? '-' : ''}{fmtMoney(tx.amount)}
                </div>
              </summary>
              <div className="mt-3 rounded-lg bg-gray-50 dark:bg-gray-900 p-3 text-[11px] text-ink-secondary grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5">
                <div>状态：{tx.status || '—'}</div>
                <div>支付方式：{tx.paymentMethod || '—'}</div>
                <div>交易号：{tx.transactionId || '—'}</div>
                <div>订单号：{tx.orderId || '—'}</div>
                <div>账户：{tx.account || '—'}</div>
                <div>余额：{Number.isFinite(tx.balance) ? fmtMoney(tx.balance) : '—'}</div>
                <div className="sm:col-span-2">交易详情：{tx.details || '—'}</div>
                <div className="sm:col-span-2">账单原始字段：{Object.entries(tx.rawFields || {}).map(([key, value]) => `${key}=${value}`).join('；') || '—'}</div>
                {tx.screenshotFile ? <div className="sm:col-span-2">截图来源：{tx.screenshotFile}；匹配分数：{tx.receiptMatch?.score ?? '—'}</div> : null}
              </div>
            </details>
          )
        })}
      </div>
    </section>
  )
}
