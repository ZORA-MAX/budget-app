# Backup version

- Backup date: 2026-08-08
- Web app feature source commit: `5164f69`
- GitHub Pages deployment commit: `69e4108`
- Live URL: <https://zora-max.github.io/budget-app/>
- Web app validation: 35 automated tests passed; portable relative-path production build completed.
- Income editing: the former expense-only detail tab is now a unified `收支明细` editor. Income and refund rows support manual changes to name, counterparty, project, note, and amount; those edits update dashboard totals, the complete cashflow ledger, and exported Excel detail/summary sheets.
- Excel export: added a prominent download button and a fixed six-sheet workbook matching the adjusted May format (`完整流水`, `月度收支汇总`, `支出分类汇总`, `账单原始字段`, `截图识别明细`, `合并原始明细`).
- Excel QA: verified 35-column detail format, 32-column raw-field format, income/refund/expense/net-cashflow totals, PDD item names, screenshot evidence, merged-transaction details, and zero spreadsheet errors.
- History compatibility: restored database schema version 4 plus complete JSON backup/restore to avoid version conflicts with existing browser history.
- Adjusted workbook validation: 214 expense rows, total ¥17,799.73.
- Unadjusted consolidated workbook validation: 252 expense rows, total ¥27,132.22.
- Included Skills: `reconcile-spending-evidence`, `apply-budget-memory`.
- Included Memory: `classification-learning.md`, `project-preferences.md`.
- Reconciliation Skill: now requires complete income/expense/refund retention, strict one-to-one refund pairing, refund-offset fields, net-spending reconciliation, and separate genuine-income totals.
- Classification Memory: learned generalized rules from 31 explicit June browser edits; personal contacts and full transactions remain exact browser memory only.
- Validation: project-local Skills passed structural validation after the 2026-08-08 update.
