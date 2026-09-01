---
name: apply-budget-memory
description: Apply and progressively update Maxine's project-local income/expense classification, refund-offset, name-normalization, and monthly grouping memory for budget workbooks or budget-app full-backup JSON files. Use when reviewing an adjusted bill or browser backup, classifying new transactions, learning user overrides, grouping repeated transport or coffee/tea spending, preserving all income and expenses, or preventing matched refunds from double-counting consumption.
---

# Apply Budget Memory

Use confirmed workbook edits as training evidence, then apply only reusable rules to later bills.

## Required context

1. Read `references/classification-rules.md` completely.
2. Find the current `budget-app/skill&memory/` bundle and read `memory/classification-learning.md` inside it. If the bundle is not in the current workspace, ask the user for its new-device location instead of assuming an old absolute path.
3. Follow `skill&memory/AGENTS.md` and any project-level `AGENTS.md` for paths, privacy, versioning, and evidence handling.
4. Use the Spreadsheets skill for workbook inspection or edits.

## Apply rules

1. Preserve raw transaction fields and user-confirmed classifications.
2. Normalize text only for matching; never replace auditable source text.
3. Classify by this precedence:
   - explicit user adjustment;
   - known high-confidence alias;
   - required multi-field signal;
   - uncertain candidate left for review.
4. Deduplicate confirmed duplicate sources before category grouping.
5. Preserve all valid income, expense, and refund rows. Pair and offset refunds only under the reconciliation Skill's strict rules; never treat equal amount alone as a match.
6. Apply the merge dimensions defined in the reference. Never merge across months, currencies, or transaction types.
7. Keep an audit link from each aggregate to its source rows, with amount and count reconciliation.

## Learn from a new adjusted workbook or browser backup

1. Accept either an adjusted workbook or a `budget-app-backup` JSON. For JSON, read `data.overrides` and `data.classificationMemory`; treat entries with explicit edited fields as the strongest learning evidence.
2. Compare the adjusted classification, normalized name, and merge fields with prior rules.
3. Promote a rule only when the adjustment is explicit and the matching signal is specific enough to reuse.
4. Treat generic payment-platform names, masked payees, personal contacts, and context-free transfers as row-level decisions unless concrete item or context fields disambiguate them.
5. Add or revise only generalized aliases and merge behavior in `references/classification-rules.md` and the project memory file. Do not store amounts, dates, contacts, account identifiers, order IDs, or full personal transactions.
6. Record only the source filename and learning date in project memory for traceability; never copy the raw backup into `skill&memory/`.
7. Validate totals and representative rows after applying changed rules.

## Output behavior

- For read-only review requests, do not edit or export the workbook.
- For requested workbook edits, create a new version in the workspace's appropriate `历史账单` month folder (or another folder explicitly chosen by the user); never overwrite the source.
- Surface ambiguous mappings separately. Do not silently generalize them.
