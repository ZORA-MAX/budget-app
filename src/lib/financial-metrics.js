import { getTransactionDirection, txKey } from './csv-parser.js'

export function transactionOverride(tx, overrides = {}) {
  return overrides[txKey(tx)] || overrides[`${tx.date.toISOString()}_${tx.amount}_${tx.name}${tx.recordId ? `_${tx.recordId}` : ''}`]
}

export function transactionAmount(tx, override) {
  return Number.isFinite(override?.editedAmount) ? override.editedAmount : Number(tx.amount) || 0
}

export function consumptionAmount(tx, override) {
  if (tx.isEffective === false || getTransactionDirection(tx, override) !== 'expense' || tx.includeInConsumption === false) return 0
  const amount = transactionAmount(tx, override)
  if (Number.isFinite(override?.netConsumption)) return Math.max(0, override.netConsumption)
  // Preserve the verified refund offset if the user later corrects the payment amount.
  if (Number.isFinite(tx.netConsumption)) return Math.max(0, tx.netConsumption + amount - Number(tx.amount))
  return Math.max(0, amount)
}

export function cashflowImpact(tx, override) {
  if (tx.isEffective === false) return 0
  const amount = transactionAmount(tx, override)
  // A direction edit supersedes imported cashflow metadata.
  const directionChanged = override?.editedDirection && override.editedDirection !== (tx.direction || 'expense')
  if (!directionChanged && Number.isFinite(tx.cashflowImpact)) return tx.cashflowImpact + Math.sign(tx.cashflowImpact) * (amount - Number(tx.amount))
  const direction = getTransactionDirection(tx, override)
  return direction === 'expense' ? -amount : direction === 'income' || direction === 'refund' ? amount : 0
}

export function financialMetrics(transactions, overrides = {}) {
  const result = { consumption: 0, grossExpense: 0, income: 0, refund: 0, cashflow: 0, unreviewedCount: 0 }
  for (const tx of transactions) {
    const override = transactionOverride(tx, overrides)
    const direction = getTransactionDirection(tx, override)
    const amount = transactionAmount(tx, override)
    result.consumption += consumptionAmount(tx, override)
    result.cashflow += cashflowImpact(tx, override)
    if (tx.isEffective === false) continue
    if (direction === 'expense') {
      result.grossExpense += amount
      if (tx.includeInConsumption !== false && !Number.isFinite(tx.netConsumption) && !Number.isFinite(override?.netConsumption)) result.unreviewedCount += 1
    }
    if (direction === 'income') result.income += amount
    if (direction === 'refund') result.refund += amount
  }
  for (const key of ['consumption', 'grossExpense', 'income', 'refund', 'cashflow']) result[key] = Math.round((result[key] + Number.EPSILON) * 100) / 100
  return result
}
