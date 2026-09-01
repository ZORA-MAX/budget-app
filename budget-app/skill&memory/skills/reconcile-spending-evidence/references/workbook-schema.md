# Webpage-ready workbook contract

Create one `.xlsx` workbook. The user's budget webpage must prefer the exact sheet name `网页导入流水` and ignore other sheets for transaction ingestion.

## Sheet: 网页导入流水

One row per confirmed transaction after deduplication. Keep this sheet free of subtotals and blank separator rows.

| Column | Type | Rule |
|---|---|---|
| 完整时间 | Excel datetime | Preserve visible precision; required |
| 类型 | text | `支出` / `收入` / `退款` / `资金流转` / `其他` |
| 金额 | number | Positive magnitude; required |
| 币种 | text | Default `CNY` only when the source clearly uses RMB |
| 交易对象 | text | Merchant or counterparty, separate from platform |
| 具体商品或服务 | text | Concrete item/service; never a vague payment label |
| 商品清单 | text | Multiple items separated by `、`; retain variants/quantities |
| 平台 | text | WeChat, Alipay, Taobao, Pinduoduo, bank, etc. |
| 来源 | text | Bill source used to establish the cash transaction |
| 状态 | text | Original status wording |
| 是否计入收支 | text | `是` or `否` |
| 支付方式 | text | Card/account/wallet label with sensitive digits masked |
| 账户 | text | Masked account name; no full card number |
| 余额 | number or blank | Blank when unknown |
| 交易号 | text | Preserve leading zeros |
| 订单号 | text | Preserve leading zeros |
| 一级分类 | text | Blank if not yet classified |
| 二级分类 | text | Blank if not yet classified |
| 消费性质 | text | Optional multiple labels joined with `、` |
| 截图文件 | text | Source screenshot filename(s) |
| 匹配状态 | text | `精确匹配`, `用户确认`, or `无截图` |
| 匹配依据 | text | Concise human-readable evidence, not an opaque score alone |
| 识别置信度 | number or blank | `0` to `1`; blank when not applicable |
| 来源文件 | text | Bill filename |
| 来源工作表 | text | Original sheet name |
| 原始行号 | integer or blank | Source row for audit |
| 证据ID | text | Stable evidence ID(s) |
| 备注 | text | Only useful transaction context |
| 退款关联ID | text | Linked original expense/refund evidence ID; blank when unpaired |
| 原始支出金额 | number or blank | Source amount for expense rows |
| 退款冲销金额 | number | Sum of uniquely linked refunds applied to this expense; otherwise `0` |
| 净计入金额 | number | Expense amount after refund offset; genuine income amount for income rows; `0` for refund/transfer rows in consumption analysis |
| 是否计入消费 | text | `是` or `否`; independent from cashflow validity |

Formatting:

- Datetime format: `yyyy-mm-dd hh:mm:ss`
- Amount/balance: numeric `¥#,##0.00;[Red]-¥#,##0.00` for CNY
- Confidence: `0%`
- Refund/original/net amounts: numeric `¥#,##0.00;[Red]-¥#,##0.00` for CNY
- Freeze the header row and enable filters.
- Wrap long product, evidence, and notes columns; cap widths so the sheet remains usable.

## Sheet: 待复核

Keep uncertain records out of webpage ingestion. Include:

`evidence_id`, screenshot filename, proposed bill row, visible time, visible amount, platform, merchant, extracted item/service, conflict or missing field, candidate count, suggested action, user decision.

Do not calculate confirmed cashflow totals from this sheet.

## Sheet: 证据索引

One row per source artifact:

`evidence_id`, filename, evidence type, platform, visible date range, number of visible transactions, extraction status, related confirmed row IDs, related review row IDs, privacy note.

Do not embed the user's screenshots unless explicitly requested; filenames and evidence IDs are enough for auditability.

## Sheet: 处理汇总

Show source counts, confirmed transactions, exact matches, user-confirmed matches, pending review, unmatched screenshots, gross genuine income, gross expense, refunds, matched refund offsets, net spending, transfers, and net cashflow. Use formulas referencing `'网页导入流水'!…` and `'待复核'!…` with quoted sheet names.

Use these definitions consistently:

- `总收入`: valid rows whose type is `收入`; exclude refunds and transfers.
- `总支出`: valid source expense amount before refund offset.
- `退款流入`: valid rows whose type is `退款`.
- `退款冲销`: only refunds uniquely linked to an original expense.
- `净消费支出`: sum of expense-row `净计入金额`.
- `净现金流`: `总收入 + 退款流入 - 总支出`; internal transfers remain separate.

## Workbook validation

- Confirm `网页导入流水` contains only confirmed deduplicated rows.
- Confirm all valid income and expense rows from every supplied source remain present.
- Confirm each paired refund links to exactly one expense and does not reduce net spending more than once.
- Confirm typed dates, numbers, and identifiers survive export/reopen.
- Scan formula errors and reconcile source totals.
- Render all sheets and fix clipped headers or unreadable evidence text.
- Save one final `.xlsx` in the spreadsheet skill's required output directory.
