export default function ReceiptUploadPanel({ extracting, progress, receipts, matchedCount, onFiles, onClear }) {
  return (
    <section className="rounded-xl border border-amber-200 bg-amber-50/70 p-4 mb-2">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-medium text-amber-900">🧾 消费截图识别与账单匹配</div>
          <p className="text-xs text-amber-800/75 mt-1 leading-relaxed">
            提取平台、消费时间、金额、商家及具体商品；仅在金额、时间和平台/商家同时吻合时自动补全账单。
          </p>
        </div>
        {receipts.length > 0 ? (
          <button type="button" onClick={onClear} className="text-xs text-amber-700 hover:text-red-500 flex-shrink-0">清空截图结果</button>
        ) : null}
      </div>

      <button type="button" disabled={extracting} onClick={() => document.getElementById('receipt-input').click()}
        className="w-full mt-3 rounded-lg border border-amber-300 bg-white px-3 py-2.5 text-sm font-medium text-amber-800 hover:bg-amber-100 disabled:opacity-60">
        {extracting ? `正在识别 ${progress.current}/${progress.total}：${progress.filename || ''}` : '上传消费截图（可多选）'}
      </button>
      <input id="receipt-input" type="file" accept="image/png,image/jpeg,image/webp" multiple className="hidden"
        onChange={event => { if (event.target.files?.length) onFiles(event.target.files); event.target.value = '' }} />

      <div className="text-[10px] text-amber-700/70 mt-2 leading-relaxed">
        截图会压缩后发送到已配置的 AI 识别服务；建议先遮盖与交易无关的卡号、地址和联系方式。
      </div>

      {receipts.length > 0 ? (
        <div className="mt-3 rounded-lg bg-white/80 px-3 py-2">
          <div className="text-xs font-medium text-amber-900">已提取 {receipts.length} 笔 · 已与账单匹配 {matchedCount} 笔</div>
          <div className="mt-2 space-y-1.5">
            {receipts.slice(0, 6).map(receipt => (
              <div key={receipt.id} className="flex items-start justify-between gap-3 text-[11px]">
                <div className="min-w-0">
                  <div className="font-medium text-ink truncate">{receipt.productName || '商品待确认'}</div>
                  <div className="text-ink-tertiary truncate">{receipt.platform || '平台未知'} · {receipt.merchant || '商家未知'} · {receipt.screenshotFile}</div>
                </div>
                <div className="font-medium text-amber-800 flex-shrink-0">¥{receipt.amount.toFixed(2)}</div>
              </div>
            ))}
          </div>
          {receipts.length > 6 ? <div className="text-[10px] text-ink-tertiary mt-1.5">另有 {receipts.length - 6} 笔将在完整流水和 Excel 中显示</div> : null}
        </div>
      ) : null}
    </section>
  )
}
