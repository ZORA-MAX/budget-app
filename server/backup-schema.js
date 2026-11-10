import { createHash } from 'node:crypto'
import { HttpError } from './http.js'

export const PART_LIMIT = 4 * 1024 * 1024
const forbidden = new Set(['__proto__', 'constructor', 'prototype'])
const monthPattern = /^\d{4}-(0[1-9]|1[0-2])$/
const invalid = message => { throw new HttpError(400, 'INVALID_BACKUP', message) }
const object = value => value && typeof value === 'object' && !Array.isArray(value)

export function validateJSON(value, depth = 0) {
  if (depth > 30) invalid('账本数据层级过深')
  if (typeof value === 'number' && !Number.isFinite(value)) invalid('账本包含无效数字')
  if (Array.isArray(value)) { for (const item of value) validateJSON(item, depth + 1) }
  else if (object(value)) {
    for (const [key, item] of Object.entries(value)) { if (forbidden.has(key)) invalid('账本包含不受支持的字段'); validateJSON(item, depth + 1) }
  } else if (!['string', 'number', 'boolean'].includes(typeof value) && value !== null) invalid('账本包含不支持的数据类型')
  return value
}

export function canonicalJSON(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJSON).join(',')}]`
  if (object(value)) return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalJSON(value[key])}`).join(',')}}`
  return JSON.stringify(value)
}
export function hashJSON(value) { return createHash('sha256').update(canonicalJSON(value)).digest('hex') }

function unique(records, key, message) {
  const seen = new Set()
  for (const item of records) { if (seen.has(item[key])) invalid(message); seen.add(item[key]) }
}

export function validateMonth(record) {
  if (!object(record) || !monthPattern.test(record.monthKey || '') || !Array.isArray(record.transactions) || record.transactions.length > 50000) invalid('月份账本格式不正确')
  const stable = new Set()
  for (const tx of record.transactions) {
    if (!object(tx) || typeof tx.name !== 'string' || !tx.name.trim() || typeof tx.date !== 'string' || !Number.isFinite(Date.parse(tx.date)) || !Number.isFinite(tx.amount) || tx.amount < 0) invalid('交易名称、日期或金额无效')
    if (tx.direction !== undefined && !['expense', 'income', 'refund', 'transfer', 'other'].includes(tx.direction)) invalid('交易方向无效')
    if (tx.netConsumption !== undefined && (!Number.isFinite(tx.netConsumption) || tx.netConsumption < 0)) invalid('净消费金额无效')
    if (tx.cashflowImpact !== undefined && !Number.isFinite(tx.cashflowImpact)) invalid('现金流金额无效')
    for (const key of ['isEffective', 'includeInConsumption']) if (tx[key] !== undefined && typeof tx[key] !== 'boolean') invalid('交易纳入标记无效')
    if (tx.stableKey !== undefined) {
      if (typeof tx.stableKey !== 'string' || !tx.stableKey || stable.has(tx.stableKey)) invalid('交易稳定标识为空或重复')
      stable.add(tx.stableKey)
    }
  }
  return record
}

export function validateOverride(record) {
  if (!object(record) || !monthPattern.test(record.monthKey || '') || !object(record.overrides)) invalid('分类覆盖记录格式无效')
  for (const override of Object.values(record.overrides)) {
    if (!object(override)) invalid('分类覆盖值无效')
    if (override.editedAmount !== undefined && (!Number.isFinite(override.editedAmount) || override.editedAmount < 0)) invalid('修改金额无效')
    if (override.editedDirection !== undefined && !['expense', 'income', 'refund', 'transfer', 'other'].includes(override.editedDirection)) invalid('修改方向无效')
  }
  return record
}

export function validateBackup(snapshot) {
  validateJSON(snapshot)
  if (!object(snapshot) || snapshot.format !== 'budget-app-backup' || ![1, 2].includes(snapshot.schemaVersion) || !object(snapshot.data)) invalid('不支持的账本备份格式')
  const { months, overrides, classificationMemory = [] } = snapshot.data
  if (!Array.isArray(months) || months.length > 1200 || !Array.isArray(overrides) || !Array.isArray(classificationMemory)) invalid('备份缺少完整数据列表')
  months.forEach(validateMonth); overrides.forEach(validateOverride)
  unique(months, 'monthKey', '备份包含重复月份'); unique(overrides, 'monthKey', '备份包含重复分类月份')
  for (const record of classificationMemory) if (!object(record) || typeof record.key !== 'string' || !record.key || !record.catKey || !record.subKey || (record.tags !== undefined && !Array.isArray(record.tags))) invalid('分类记忆格式无效')
  unique(classificationMemory, 'key', '分类记忆包含重复标识')
  if (snapshot.taxonomy !== undefined && (!object(snapshot.taxonomy) || !Array.isArray(snapshot.taxonomy.categories) || !Array.isArray(snapshot.taxonomy.tags))) invalid('自定义分类格式无效')
  if (snapshot.debtLedger !== undefined && snapshot.debtLedger !== null) {
    const ledger = snapshot.debtLedger
    if (!object(ledger) || ledger.version !== 1 || !Array.isArray(ledger.items)) invalid('债务台账格式无效')
    unique(ledger.items, 'id', '债务台账包含重复记录')
    for (const item of ledger.items) {
      if (!object(item) || !item.id || !item.title) invalid('债务记录缺少名称或标识')
      for (const key of ['originalPrincipal', 'remainingPrincipal', 'unbilledPrincipal', 'unbilledInterest', 'remainingPeriods', 'annualRate', 'monthlyPayment', 'annualReserve']) if (item[key] !== undefined && (!Number.isFinite(item[key]) || item[key] < 0)) invalid('债务金额或期数无效')
      for (const key of ['payments', 'schedule']) {
        if (item[key] !== undefined && !Array.isArray(item[key])) invalid('债务记录或计划必须为列表')
        for (const entry of item[key] || []) {
          if (!object(entry)) invalid('债务记录或计划无效')
          for (const field of ['amount', 'principal', 'interest']) if (entry[field] !== undefined && (!Number.isFinite(entry[field]) || entry[field] < 0)) invalid('债务记录金额无效')
        }
      }
    }
  }
  return snapshot
}

export function validatePart(kind, monthKey, payload) {
  validateJSON(payload)
  if (Buffer.byteLength(canonicalJSON(payload)) > PART_LIMIT) throw new HttpError(413, 'PAYLOAD_TOO_LARGE', '单个月份数据超过云端分片上限，本机账单仍保留')
  if (kind === 'month') {
    if (!object(payload) || !monthPattern.test(monthKey || '')) invalid('月份分片格式无效')
    validateMonth(payload.month)
    if (payload.month.monthKey !== monthKey) invalid('月份分片与交易月份不一致')
    if (payload.overrides !== null && payload.overrides !== undefined) {
      validateOverride(payload.overrides)
      if (payload.overrides.monthKey !== monthKey) invalid('月份分片与分类月份不一致')
    }
  } else if (kind === 'metadata') {
    if (monthKey !== undefined && monthKey !== null && monthKey !== '') invalid('元数据分片不能指定月份')
    validateBackup(payload)
    if (payload.data.months.length) invalid('元数据分片不能重复包含月份流水')
  } else invalid('不支持的分片类型')
  return payload
}

export function validateDescriptors(parts) {
  if (!Array.isArray(parts) || !parts.length || parts.length > 1201) invalid('云端分片清单无效')
  let metadataCount = 0; const months = new Set()
  for (const part of parts) {
    if (!object(part) || !/^[a-f0-9]{64}$/.test(part.hash || '')) invalid('云端分片校验值无效')
    if (part.kind === 'metadata') { metadataCount++; if (part.monthKey) invalid('元数据分片月份无效') }
    else if (part.kind === 'month') { if (!monthPattern.test(part.monthKey || '') || months.has(part.monthKey)) invalid('云端月份分片重复或无效'); months.add(part.monthKey) }
    else invalid('云端分片类型无效')
  }
  if (metadataCount !== 1) invalid('云端必须有且仅有一个元数据分片')
  return parts.map(part => part.kind === 'month' ? { kind: 'month', monthKey: part.monthKey, hash: part.hash } : { kind: 'metadata', hash: part.hash }).sort((a, b) => `${a.kind}:${a.monthKey || ''}`.localeCompare(`${b.kind}:${b.monthKey || ''}`))
}

export function splitBackup(snapshot) {
  validateBackup(snapshot)
  const byMonth = new Map(snapshot.data.overrides.map(record => [record.monthKey, record]))
  const monthKeys = new Set(snapshot.data.months.map(record => record.monthKey))
  return [
    ...snapshot.data.months.map(month => ({ kind: 'month', monthKey: month.monthKey, payload: { month, overrides: byMonth.get(month.monthKey) || null } })),
    { kind: 'metadata', payload: { ...snapshot, data: { ...snapshot.data, months: [], overrides: snapshot.data.overrides.filter(record => !monthKeys.has(record.monthKey)) } } },
  ]
}

export function assembleBackup(entries) {
  const metadata = entries.find(entry => entry.part.kind === 'metadata')?.payload
  if (!metadata) invalid('缺少账本元数据分片')
  const months = entries.filter(entry => entry.part.kind === 'month').map(entry => entry.payload)
  return validateBackup({ ...metadata, data: { ...metadata.data, months: months.map(entry => entry.month).sort((a, b) => a.monthKey.localeCompare(b.monthKey)), overrides: [...metadata.data.overrides, ...months.flatMap(entry => entry.overrides ? [entry.overrides] : [])].sort((a, b) => a.monthKey.localeCompare(b.monthKey)) } })
}
