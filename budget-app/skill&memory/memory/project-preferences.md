# Budget App Project Memory

Updated: 2026-08-08

- Portable project root: the directory that contains `skill&memory/` on the current device.
- Bill workbook output root: `<project-root>/历史账单/` when present, or a location explicitly chosen by the user.
- Project memory backup: `<project-root>/skill&memory/memory/`.
- Project-local skill backup: `<project-root>/skill&memory/skills/`.
- Web app backup: `<project-root>/skill&memory/web-app/`.
- Original Mac project root (historical reference only): `/Users/maxinezhang/Documents/budget-app/`.
- Latest adjustment source: `历史账单/6月/budget-full-backup-2026-08-08 (1).json` (browser full backup; raw file stays outside `skill&memory/`).
- Current merge state: 29 PDD records (28 expenses and 1 refund) and 71 bank-card expense records were appended. The 24 bank screenshot records that were not expenses were not appended.
- Item-name rule: every appended PDD record must retain the concrete product name visible in the screenshot. Keep a visible ellipsis when the screenshot truncates the name; do not invent the missing text.
- Deduplication state: possible duplicates were intentionally retained for the user's later review. Candidate references remain in `待复核` and in each appended row's matching notes.
- Classification-learning skill: `skills/apply-budget-memory/`.
- Classification memory: `memory/classification-learning.md`.
- Required bill completeness: future consolidated workbooks must retain all valid income, expense, refund, and transfer rows from every supplied source.
- Refund rule: preserve both source rows, uniquely link the refund, and use `净计入金额` to remove full or partial refund overlap from net spending. Equal amount alone is never enough to pair.
- Summary rule: show genuine income, gross expense, refund inflow, matched refund offset, net spending, transfers, and net cashflow separately.
- Next workflow step: apply the learned May/June rules to later bills, then append newly confirmed user adjustments to the project memory.
- Privacy rule: keep real financial records in `历史账单`; keep only generalized rules and scripts in skills.
