import {
  createCloudSnapshot, replaceCloudSnapshot, loadSyncCheckpoint, saveSyncCheckpoint,
  saveConflictBackups, listConflictBackups as readConflictBackups, getConflictBackup,
  createDefaultTaxonomySnapshot, validateBackupPayload,
} from './storage.js'
import { subscribeBudgetChanges, getBudgetChangeVersion } from './budget-events.js'

export { getConflictBackup }

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical)
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().filter(key => value[key] !== undefined).map(key => [key, canonical(value[key])]))
  return value
}

// Export times and record save times do not change the financial contents of a snapshot.
export function snapshotContent(snapshot) {
  if (!snapshot) return null
  const records = (items, key) => (items || []).map(({ updatedAt, ...record }) => record).sort((a, b) => String(a[key]).localeCompare(String(b[key])))
  return canonical({
    format: snapshot.format, schemaVersion: snapshot.schemaVersion,
    data: { ...snapshot.data,
      months: records(snapshot.data?.months, 'monthKey'),
      overrides: records(snapshot.data?.overrides, 'monthKey'),
      classificationMemory: records(snapshot.data?.classificationMemory, 'key'),
    },
    debtLedger: snapshot.debtLedger ?? null,
    taxonomy: snapshot.taxonomy ?? createDefaultTaxonomySnapshot(),
  })
}

export async function fingerprintSnapshot(snapshot) {
  const bytes = new TextEncoder().encode(JSON.stringify(snapshotContent(snapshot)))
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
}

export function summarizeSnapshot(snapshot) {
  const monthKeys = (snapshot?.data?.months || []).map(month => month.monthKey).sort()
  return {
    monthKeys, months: monthKeys, monthCount: monthKeys.length,
    transactionCount: (snapshot?.data?.months || []).reduce((sum, month) => sum + month.transactions.length, 0),
    memoryCount: snapshot?.data?.classificationMemory?.length || 0,
    debtCount: snapshot?.debtLedger?.items?.length || 0,
  }
}

export function isEmptySnapshot(snapshot) {
  if (!snapshot) return true
  return !snapshot.data?.months?.length && !snapshot.data?.overrides?.length && !snapshot.data?.classificationMemory?.length &&
    snapshot.debtLedger == null && JSON.stringify(canonical(snapshot.taxonomy ?? createDefaultTaxonomySnapshot())) === JSON.stringify(canonical(createDefaultTaxonomySnapshot()))
}

export async function listConflictBackups() {
  return (await readConflictBackups()).map(({ id, createdAt, cloudRevision, local, cloud, reason }) => ({
    id, createdAt, cloudRevision, reason,
    hasLocal: Boolean(local), hasCloud: Boolean(cloud),
    localSummary: summarizeSnapshot(local), cloudSummary: summarizeSnapshot(cloud),
  }))
}

function requestId() {
  return globalThis.crypto.randomUUID()
}

export function splitCloudSnapshot(snapshot) {
  const { data, ...metadata } = snapshot
  const monthKeys = new Set(data.months.map(month => month.monthKey))
  const overrides = new Map(data.overrides.map(record => [record.monthKey, record]))
  return [
    { kind: 'metadata', payload: { ...metadata, data: { ...data, months: [], overrides: data.overrides.filter(record => !monthKeys.has(record.monthKey)) } } },
    ...data.months.map(month => ({ kind: 'month', monthKey: month.monthKey, payload: { month, overrides: overrides.get(month.monthKey) || null } })),
  ]
}

export function assembleCloudSnapshot(parts) {
  const metadata = parts.filter(part => part.kind === 'metadata')
  if (metadata.length !== 1) throw new Error('云端快照缺少唯一的元数据分片')
  const result = structuredClone(metadata[0].payload)
  result.data = { ...result.data, months: [], overrides: [...(result.data?.overrides || [])] }
  for (const { kind, monthKey, payload } of parts) {
    if (kind === 'metadata') continue
    if (kind !== 'month' || payload?.month?.monthKey !== monthKey) throw new Error('云端月份分片不匹配')
    result.data.months.push(payload.month)
    if (payload.overrides) result.data.overrides.push(payload.overrides)
  }
  result.data.months.sort((a, b) => a.monthKey.localeCompare(b.monthKey))
  result.data.overrides.sort((a, b) => a.monthKey.localeCompare(b.monthKey))
  return validateBackupPayload(result, { cloud: true })
}

export function createCloudTransport({ fetchImpl = globalThis.fetch, baseUrl = '' } = {}) {
  async function request(path, { body, signal } = {}) {
    const response = await fetchImpl(`${baseUrl}${path}`, {
      method: body === undefined ? 'GET' : 'PUT', credentials: 'same-origin', cache: 'no-store', signal,
      ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
    })
    const payload = await response.json().catch(() => null)
    if (!response.ok) throw Object.assign(new Error(payload?.error?.message || '云端请求未完成'), { status: response.status, code: payload?.error?.code, revision: payload?.revision })
    if (!payload || typeof payload !== 'object') throw new Error('云端返回了无法识别的数据')
    return payload
  }
  return {
    async pull({ signal } = {}) {
      const manifest = await request('/api/sync?manifest=1', { signal })
      if (manifest.snapshot === null && !manifest.parts?.length) return { revision: manifest.revision ?? null, snapshot: null, updatedAt: manifest.updatedAt }
      if (!Array.isArray(manifest.parts) || !manifest.revision) throw new Error('云端快照清单无效')
      const parts = []
      for (const part of manifest.parts) {
        const params = new URLSearchParams({ kind: part.kind, hash: part.hash })
        if (part.monthKey) params.set('monthKey', part.monthKey)
        const loaded = await request(`/api/sync-part?${params}`, { signal })
        parts.push({ ...part, payload: loaded.payload })
      }
      return { revision: manifest.revision, updatedAt: manifest.updatedAt, snapshot: assembleCloudSnapshot(parts) }
    },
    async push(snapshot, baseRevision, { signal } = {}) {
      const parts = []
      for (const item of splitCloudSnapshot(snapshot)) {
        // Vercel limits each request, not the full ledger. Reject before any manifest commit.
        if (new TextEncoder().encode(JSON.stringify(item)).length > 4 * 1024 * 1024) throw Object.assign(new Error('单个月份的数据超过同步上限，请保留本地备份'), { status: 413, code: 'PAYLOAD_TOO_LARGE' })
        const uploaded = await request('/api/sync-part', { body: item, signal })
        if (!uploaded.part?.hash || uploaded.part.kind !== item.kind || uploaded.part.monthKey !== item.monthKey) throw new Error('云端分片校验未通过')
        parts.push(uploaded.part)
      }
      const result = await request('/api/sync', { body: { baseRevision, requestId: requestId(), parts }, signal })
      if (!result.revision) throw new Error('云端没有确认保存版本')
      return result
    },
  }
}

const defaultStorage = {
  createSnapshot: createCloudSnapshot, replaceSnapshot: replaceCloudSnapshot,
  loadCheckpoint: loadSyncCheckpoint, saveCheckpoint: saveSyncCheckpoint,
  saveBackups: saveConflictBackups, subscribe: subscribeBudgetChanges, getVersion: getBudgetChangeVersion,
}

export function createCloudSyncController({
  onStateChange, debounceMs = 800, pollMs = 30000,
  storage = defaultStorage, transport = createCloudTransport(),
  fingerprint = fingerprintSnapshot, now = () => new Date().toISOString(),
} = {}) {
  let state = { status: 'signed-out', revision: null, lastSyncedAt: null, error: null, conflict: null, pendingChanges: false, backupId: null }
  let active = false, generation = 0, inFlight = null, rerun = false, debounceTimer, pollTimer, unsubscribe
  let abortController, conflictRemote = null
  const listeners = new Set(onStateChange ? [onStateChange] : [])
  const current = token => active && generation === token
  function setState(patch) {
    state = { ...state, ...patch }
    for (const listener of listeners) listener(state)
  }
  function clearTimers() {
    clearTimeout(debounceTimer)
    clearInterval(pollTimer)
  }
  function schedule() {
    if (!active || state.status === 'conflict') return
    clearTimeout(debounceTimer)
    debounceTimer = setTimeout(() => { void syncNow() }, debounceMs)
  }
  function showConflict(local, remote, extra = {}) {
    conflictRemote = remote
    setState({ status: 'conflict', revision: remote.revision, pendingChanges: true, error: null,
      conflict: { localSummary: summarizeSnapshot(local), cloudSummary: summarizeSnapshot(remote.snapshot), ...extra } })
  }
  async function capture() {
    // A synchronous taxonomy/debt edit can happen while the IDB snapshot is read.
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const version = storage.getVersion()
      const snapshot = await storage.createSnapshot()
      const hash = await fingerprint(snapshot)
      if (version === storage.getVersion()) return { snapshot, hash, version }
    }
    throw Object.assign(new Error('账本仍在编辑，稍后重试同步'), { code: 'LOCAL_CHANGED' })
  }
  async function checkpoint(revision, hash, token) {
    if (!current(token)) return
    const lastSyncedAt = now()
    await storage.saveCheckpoint({ revision, fingerprint: hash, lastSyncedAt })
    if (current(token)) setState({ status: 'synced', revision, lastSyncedAt, error: null, conflict: null, pendingChanges: false })
  }
  async function applyCloud(local, remote, remoteHash, token, backupId) {
    const id = backupId || await storage.saveBackups({ local: local.snapshot, cloud: remote.snapshot, cloudRevision: remote.revision, reason: 'cloud-restore' })
    if (!current(token)) return
    await storage.replaceSnapshot(remote.snapshot, { expectedSnapshot: local.snapshot, shouldApply: () => current(token) && storage.getVersion() === local.version })
    if (!current(token)) return
    setState({ backupId: id })
    await checkpoint(remote.revision, remoteHash, token)
  }
  async function pushLocal(local, remote, token) {
    const result = await transport.push(local.snapshot, remote.revision, { signal: abortController.signal })
    if (!current(token)) return
    await checkpoint(result.revision, local.hash, token)
    if (storage.getVersion() !== local.version) {
      rerun = true
      setState({ pendingChanges: true })
    }
  }
  async function reportError(error, token) {
    if (!current(token) || error.name === 'AbortError') return
    if (error.status === 409) {
      // A CAS rejection always requires another explicit choice, even if the next GET races too.
      let remote = { revision: error.revision ?? null, snapshot: null }
      try { remote = await transport.pull({ signal: abortController.signal }) } catch { /* conflict remains blocked */ }
      let local = null
      try { local = await storage.createSnapshot() } catch { /* keep the conflict paused */ }
      if (current(token)) showConflict(local, remote, { needsRefresh: !remote.snapshot })
    } else if (error.code === 'LOCAL_CHANGED') {
      setState({ status: 'syncing', pendingChanges: true })
      rerun = true
    } else if (error.status === 401) {
      stop()
      setState({ status: 'signed-out', error: { code: 'UNAUTHENTICATED', message: '请登录后同步' } })
    } else {
      const offline = error instanceof TypeError || (typeof navigator !== 'undefined' && navigator.onLine === false)
      setState({ status: offline ? 'offline' : 'error', error: { code: error.code || 'SYNC_FAILED', message: error.message }, pendingChanges: true })
    }
  }
  async function reconcile(token) {
    setState({ status: state.lastSyncedAt ? 'syncing' : 'connecting', error: null })
    const remote = await transport.pull({ signal: abortController.signal })
    if (!current(token)) return
    const baseline = await storage.loadCheckpoint()
    const local = await capture()
    const remoteHash = remote.snapshot ? await fingerprint(remote.snapshot) : null
    if (!current(token)) return
    if (local.hash === remoteHash) return checkpoint(remote.revision, local.hash, token)
    if (!remote.snapshot) {
      if (baseline?.revision != null) return showConflict(local.snapshot, remote)
      if (isEmptySnapshot(local.snapshot)) return checkpoint(remote.revision, local.hash, token)
      return pushLocal(local, remote, token)
    }
    if (!baseline) {
      if (isEmptySnapshot(local.snapshot)) return applyCloud(local, remote, remoteHash, token)
      return showConflict(local.snapshot, remote)
    }
    const localUnchanged = local.hash === baseline.fingerprint
    const cloudUnchanged = remoteHash === baseline.fingerprint
    if (localUnchanged) return applyCloud(local, remote, remoteHash, token)
    if (cloudUnchanged) return pushLocal(local, remote, token)
    return showConflict(local.snapshot, remote)
  }
  function run(operation) {
    if (!active) return Promise.resolve(state)
    if (inFlight) return inFlight
    const token = generation
    abortController = new AbortController()
    const operationPromise = (async () => {
      try {
        // Only one tab may reconcile this origin at a time. Other-device writes remain
        // protected independently by the server's compare-and-swap revision check.
        const execute = () => current(token) ? operation(token) : undefined
        if (typeof navigator !== 'undefined' && navigator.locks) return await navigator.locks.request('budget-app-cloud-sync', { signal: abortController.signal }, execute)
        return await execute()
      } catch (error) { await reportError(error, token) }
      finally {
        if (inFlight === operationPromise) inFlight = null
        if (current(token) && rerun && state.status !== 'conflict') { rerun = false; schedule() }
      }
      return state
    })()
    inFlight = operationPromise
    return inFlight
  }
  function syncNow() {
    if (state.status === 'conflict') return Promise.resolve(state)
    clearTimeout(debounceTimer)
    return run(reconcile)
  }
  function handleLocalChange(detail) {
    if (!active || detail.source === 'cloud') return
    setState({ pendingChanges: true })
    if (inFlight) rerun = true
    else schedule()
  }
  const onOnline = () => { if (active) void syncNow() }
  const onVisible = () => { if (typeof document !== 'undefined' && document.visibilityState === 'visible') onOnline() }
  function start() {
    if (active) return syncNow()
    active = true
    generation += 1
    unsubscribe = storage.subscribe(handleLocalChange)
    if (pollMs > 0) pollTimer = setInterval(onOnline, pollMs)
    if (typeof window !== 'undefined') { window.addEventListener('online', onOnline); window.addEventListener('focus', onOnline); document.addEventListener('visibilitychange', onVisible) }
    return syncNow()
  }
  function stop() {
    active = false
    generation += 1
    abortController?.abort()
    inFlight = null
    clearTimers()
    unsubscribe?.()
    unsubscribe = null
    rerun = false
    conflictRemote = null
    if (typeof window !== 'undefined') { window.removeEventListener('online', onOnline); window.removeEventListener('focus', onOnline); document.removeEventListener('visibilitychange', onVisible) }
    setState({ status: 'signed-out', conflict: null, error: null })
  }
  async function resolveConflict(choice) {
    if (!['local', 'cloud'].includes(choice)) throw new Error('请选择本机或云端版本')
    if (!active || state.status !== 'conflict') return state
    return run(async token => {
      const observedRevision = conflictRemote?.revision
      const remote = await transport.pull({ signal: abortController.signal })
      const local = await capture()
      if (!current(token)) return
      if (observedRevision !== remote.revision) { showConflict(local.snapshot, remote); return state }
      const id = await storage.saveBackups({ local: local.snapshot, cloud: remote.snapshot, cloudRevision: remote.revision })
      if (!current(token)) return
      setState({ backupId: id })
      if (storage.getVersion() !== local.version) { showConflict((await capture()).snapshot, remote); return state }
      setState({ status: 'syncing', error: null })
      if (choice === 'local') await pushLocal(local, remote, token)
      else if (remote.snapshot) await applyCloud(local, remote, await fingerprint(remote.snapshot), token, id)
      else {
        // An intentionally cleared remote still means an empty full snapshot, not a merge.
        const empty = { ...local.snapshot, data: { months: [], overrides: [], classificationMemory: [] }, debtLedger: null, taxonomy: createDefaultTaxonomySnapshot() }
        await applyCloud(local, { ...remote, snapshot: empty }, await fingerprint(empty), token, id)
      }
      return { backupId: id, choice }
    })
  }
  return { start, stop, syncNow, resolveConflict, getState: () => state,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener) },
  }
}
