# Evidence extraction and reconciliation rules

## Evidence priority

Use the most specific visible source for each field:

1. Exact order/transaction ID on an order detail or payment detail page
2. Itemized product/service list on an order detail or receipt
3. Platform bill row with exact timestamp and amount
4. Bank row with merchant and exact amount/time
5. Free-form memo or category label

Do not let a lower-priority vague label overwrite higher-priority item evidence.

## Normalize without losing source text

- Amount: decimal number in the source currency; preserve the visible currency separately when not CNY.
- Time: preserve the exact visible precision. Do not manufacture hours or seconds when only a date is shown.
- Direction: one of `支出`, `收入`, `退款`, `资金流转`, `其他`.
- Status: preserve the source wording. Mark failed, closed, cancelled, or reversed rows as not included in cashflow.
- Platform and merchant: store separately. A payment platform is not necessarily the merchant.
- IDs: trim surrounding spaces only; otherwise preserve exactly as text.

## Concrete product/service names

Use this priority:

1. Visible item names, joined without dropping variants or quantities
2. Order title that clearly states the purchased item/service
3. Specific service description, such as `苏州地铁乘车码充值` or `网约车行程`
4. Merchant name only when the screenshot genuinely contains no more specific item evidence

Reject as product names: payment methods, platforms, `先用后付`, `月付`, `免密支付`, `扣款`, `订单`, `平台商户`, `收款方`, and generic `商品`/`服务` labels.

If only a vague label is visible, leave the product blank and send the record to review.

## Automatic matching

Match within the same currency and compatible direction. Amount difference must be no more than `0.01`.

An automatic match requires a unique best candidate and one of:

- Exact non-empty order ID or transaction ID plus matching amount; or
- Matching amount, timestamps no more than 15 minutes apart, and aligned platform plus merchant/payment counterparty.

Platform/merchant alignment means normalized meaningful text overlaps; generic words such as `支付`, `订单`, `商户`, and `转账` do not count.

If one side has only a calendar date, automatic matching still requires an exact order/transaction ID. Otherwise mark it `待复核` even when amount and platform match.

## Never auto-match

- Equal amount only
- Same platform and day only
- Multiple bill rows tied for the strongest candidate
- Conflicting direction, currency, status, order ID, or merchant
- A screenshot montage where transaction boundaries are unclear

## Deduplication

- Exact source transaction ID is the primary bill-row key.
- Otherwise use source + timestamp + direction + amount + merchant, retaining both rows if any component materially differs.
- Duplicate screenshots of one order share one evidence group and must not add another transaction.
- A matched screenshot only enriches `具体商品或服务`, item list, and evidence fields on the bill row.
- An unmatched screenshot becomes a confirmed standalone transaction only when the user confirms it is absent from all supplied bills and amount/date are legible.

## Income completeness

- Preserve every successful `收入` row from supplied WeChat, Alipay, bank, cashbook, and other account sources.
- Keep genuine income separate from `退款`, `报销`, `转入`, `借款`, `押金退还`, `冲正`, and internal account transfers.
- Deduplicate income with the same strict identifiers used for expenses. Never drop income merely because an equal outgoing amount exists.
- Report income count and amount by month and source, plus a separate genuine-income total.

## Refund pairing and offset

Retain both the original expense and refund rows. Pair them one-to-one only when currency and direction are compatible, the refund amount does not exceed the remaining refundable amount, and the best candidate is unique.

Use this priority:

1. Exact original order ID or transaction ID carried by the refund, with compatible merchant/platform.
2. Explicit refund reference plus exact amount and unique original expense.
3. Same platform, normalized merchant or concrete item, exact amount, and refund date on or after the expense within 90 days, with exactly one candidate.
4. User confirmation.

Never pair on equal amount alone. If multiple expenses share the same amount, or merchant/item evidence conflicts, mark the refund `待复核`.

For each confirmed expense calculate:

- `原始支出金额`: source expense amount.
- `退款冲销金额`: sum of uniquely linked refunds, capped at the source expense amount.
- `净计入金额`: `MAX(原始支出金额-退款冲销金额, 0)`.
- `是否计入消费`: `是` only when `净计入金额>0` and the expense is otherwise valid.

For a full refund, keep both rows visible but count neither as net consumption. For cashflow, continue to report the original outflow and refund inflow separately so the net remains auditable.

## Review statuses

- `精确匹配`: strict automatic rules pass and the candidate is unique.
- `用户确认`: the user explicitly resolves a proposed match or standalone transaction.
- `待复核`: plausible but strict rules do not pass, or a required field conflicts.
- `未匹配`: no plausible bill row exists.
- `识别不完整`: screenshot does not reveal enough transaction data.

Only `精确匹配` and `用户确认` records may enrich confirmed webpage-import rows.

## Quality reconciliation

Before export:

- Compare source totals by month, platform, direction, and currency.
- Confirm `净支出 = 有效支出 - 已配对退款冲销` to the cent, without subtracting an unmatched refund twice.
- Confirm genuine income excludes refunds and internal transfers.
- Explain differences caused by failed/closed rows, transfers, refunds, or missing evidence.
- Confirm matched screenshot count equals enriched row count.
- Confirm each evidence ID appears once in the evidence index.
- Confirm every review row has a human-readable reason.
