import { assertBudgetWritable, emitBudgetChange } from './budget-events.js'

const STORAGE_KEY = 'budget-app-debt-ledger-v1'
const NUMERIC_FIELDS = ['originalPrincipal', 'remainingPrincipal', 'unbilledPrincipal', 'unbilledInterest', 'remainingPeriods', 'annualRate', 'monthlyPayment', 'annualReserve']

export function validateDebtLedger(value) {
  if (!value || value.version !== 1 || !Array.isArray(value.items)) throw new Error('债务台账格式不正确')
  const ids = new Set()
  for (const item of value.items) {
    if (!item?.id || !item.title || ids.has(item.id)) throw new Error('债务台账缺少名称或存在重复记录')
    ids.add(item.id)
    for (const key of NUMERIC_FIELDS) if (item[key] !== undefined && (!Number.isFinite(item[key]) || item[key] < 0)) throw new Error(`债务台账 ${key} 无效`)
    for (const key of ['payments', 'schedule']) {
      if (item[key] !== undefined && !Array.isArray(item[key])) throw new Error(`债务台账 ${key} 必须为列表`)
      for (const entry of item[key] || []) for (const field of ['amount', 'principal', 'interest']) {
        if (entry[field] !== undefined && (!Number.isFinite(entry[field]) || entry[field] < 0)) throw new Error('债务台账金额无效')
      }
    }
  }
  return value
}

export function loadDebtLedger() {
  if (typeof window === 'undefined') return null
  try { const value = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || 'null'); return value ? validateDebtLedger(value) : null } catch { return null }
}

export function saveDebtLedger(value, { source = 'local', silent = false } = {}) {
  if (source === 'local') assertBudgetWritable()
  const validated = validateDebtLedger(value)
  if (typeof window !== 'undefined') window.localStorage.setItem(STORAGE_KEY, JSON.stringify(validated))
  if (!silent) emitBudgetChange('debt', source)
  return validated
}

export function clearDebtLedger({ source = 'local', silent = false } = {}) {
  if (source === 'local') assertBudgetWritable()
  if (typeof window !== 'undefined') window.localStorage.removeItem(STORAGE_KEY)
  if (!silent) emitBudgetChange('debt', source)
}
