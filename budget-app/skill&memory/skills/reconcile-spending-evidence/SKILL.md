---
name: reconcile-spending-evidence
description: Identify all income, expense, refund, and transfer transactions plus concrete purchased items from uploaded screenshots, order pages, receipts, bank/payment-platform bills, CSV, XLS, and XLSX files; strictly reconcile and deduplicate evidence; offset uniquely matched refunds without double-counting the original expense; route ambiguity to review; and create a cleaned Excel workbook for the user's budget analysis webpage. Use for Chinese prompts about 消费截图识别、收入支出整合、退货退款冲销、订单页面整理、账单匹配、消费数据清洗、商品明细补全、对账, or producing a webpage-ready complete cashflow workbook.
---

# Reconcile spending evidence

Process evidence inside the current Codex task, without requiring the user's webpage to call a paid OCR API. Preserve uncertainty and provenance; never invent unreadable fields.

## Required references

Read both files completely before extracting or matching data:

- `references/reconciliation-rules.md` for evidence priority, strict matching, deduplication, and product-name rules.
- `references/workbook-schema.md` for the final workbook's sheets, columns, types, and webpage-import contract.

When creating or editing the final `.xlsx`, also use the available spreadsheet-authoring skill and follow its formatting, formula, export, and visual-verification requirements. If that capability is unavailable, report the blocker instead of switching to an unapproved spreadsheet library.

## Workflow

1. **Inventory inputs.** List every screenshot, order page, receipt, bill, CSV, XLS, and XLSX file by stable evidence ID. Record platform and date range when visible. Do not rename or alter source files.
2. **Set privacy boundaries.** Work only with files the user supplied or pages they explicitly asked Codex to inspect. Do not send financial files or screenshots to an additional third-party recognition service. Ignore and avoid copying unrelated card numbers, addresses, phone numbers, or identity data.
3. **Extract screenshot evidence.** Create one provisional record per visible transaction. Capture the exact time precision shown, typed amount and currency, direction, platform, merchant, concrete item/service, item list, quantity, status, payment method, order/transaction IDs, source filename, and field-level uncertainty.
4. **Normalize every cashflow row.** Preserve all income, expense, refund, transfer, failed/closed transactions, full timestamps, original identifiers, source file, sheet name, and source row. Never export an expense-only subset and never collapse different directions into one row.
5. **Reconcile and offset one-to-one.** Apply `reconciliation-rules.md`. Enrich a bill row only when strict automatic-match requirements pass and the best candidate is unique. Pair refunds with their original expenses only when the link is unique; retain both source rows and calculate the expense's net included amount after the refund offset. A matched screenshot enriches the bill row; it does not create a second transaction.
6. **Ask for targeted review.** Present only unresolved or conflicting rows in a compact table. State exactly which field is missing or conflicting. Do not ask the user to review already exact matches.
7. **Create the workbook.** Put confirmed, deduplicated transactions in `网页导入流水`; put ambiguous records in `待复核`; keep evidence provenance in `证据索引`. Use typed dates and numbers, not display strings.
8. **Verify before handoff.** Reconcile gross income, gross expense, refunds, refund offsets, net spending, transfers, and net cashflow by source and month. Scan formula errors, inspect key ranges, render every sheet, and fix clipping or unreadable fields. Confirm that no exact screenshot match or fully refunded expense is double-counted.
9. **Deliver one workbook.** Explain confirmed count, review count, unmatched count, and any fields that remain unknowable. Tell the user to import the `网页导入流水` workbook into the budget webpage.

## Guardrails

- Treat `拼多多先用后付`, `微信支付`, `支付宝`, `平台商户`, `订单`, and similar payment labels as platform/payment metadata, never as purchased products.
- Keep `0` and blank distinct. Blank means unknown; zero is a known value.
- Keep identifiers as text to preserve leading zeros.
- Never auto-match solely because amounts are equal.
- Never auto-match when multiple bill rows satisfy the same strongest evidence.
- Do not put uncertain records into the webpage-import sheet until the user confirms them or the strict rules pass.
- Preserve every valid income row. Do not relabel refunds, reimbursements, transfers, reversals, or cash withdrawals as ordinary income.
- For refunds, preserve a separate refund transaction and link it to the original expense when strict evidence passes; do not overwrite or delete either source row.
- Equal amount alone never proves a refund pair. If the same amount has multiple possible expenses, keep the refund unpaired and send it to `待复核`.
- For a uniquely matched full refund, keep the gross expense and refund visible, set the expense's `净计入金额` to `0`, and exclude it from net consumption. For a partial refund, subtract only the linked refund amount.
- Stop and ask before inspecting a logged-in order page that the user did not explicitly authorize.

## Intake response when files are not attached

Ask the user to provide, preferably by month or platform:

- Payment/bank bills (`CSV`, `XLS`, or `XLSX`)
- Order-detail or receipt screenshots that show concrete items
- Any screenshot batches whose filenames or dates should be kept together

Explain that bills establish the cash transaction, screenshots establish what was purchased, and uncertain matches will remain in `待复核` rather than being guessed.
