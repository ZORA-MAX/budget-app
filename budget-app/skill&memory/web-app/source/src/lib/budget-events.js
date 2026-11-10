export const BUDGET_CHANGE_EVENT = 'budget:data-changed'
export const CLOUD_APPLIED_EVENT = 'budget:cloud-data-applied'

const listeners = new Set()
let version = 0
let writeQueue = Promise.resolve()
let replacing = false
let channel

function notify(detail) {
  version += 1
  for (const listener of listeners) listener(detail)
  if (typeof window !== 'undefined' && window.dispatchEvent) window.dispatchEvent(new CustomEvent(BUDGET_CHANGE_EVENT, { detail }))
  if (detail.external) notifyCloudApplied()
}

function getChannel() {
  if (!channel && typeof window !== 'undefined' && typeof window.BroadcastChannel !== 'undefined') {
    channel = new window.BroadcastChannel('budget-app-data-changes')
    channel.onmessage = ({ data }) => notify({ ...data, external: true })
  }
  return channel
}

export function emitBudgetChange(kind, source = 'local') {
  const detail = { kind, source }
  notify(detail)
  getChannel()?.postMessage(detail)
}

export function subscribeBudgetChanges(listener) {
  listeners.add(listener)
  getChannel()
  return () => listeners.delete(listener)
}

export function getBudgetChangeVersion() { return version }

// Keep local IndexedDB writes and a full cloud replacement in one ordered queue.
export function withBudgetWrite(operation) {
  const result = writeQueue.then(operation)
  writeQueue = result.catch(() => {})
  return result
}

export function assertBudgetWritable() {
  if (replacing) throw new Error('正在恢复云端账本，请稍后再编辑')
}

export async function duringCloudReplacement(operation) {
  replacing = true
  try { return await operation() } finally { replacing = false }
}

export function notifyCloudApplied() {
  if (typeof window !== 'undefined' && window.dispatchEvent) window.dispatchEvent(new CustomEvent(CLOUD_APPLIED_EVENT))
}
