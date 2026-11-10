import { createHash, randomUUID } from 'node:crypto'
import { HttpError } from './http.js'
import { hashJSON, validatePart, validateDescriptors, splitBackup, assembleBackup } from './backup-schema.js'

export function createCloudStore(adapter, ownerId) {
  const prefix = `budget/v1/${createHash('sha256').update(ownerId).digest('hex')}`
  const latestPath = `${prefix}/latest.json`
  const partPath = part => `${prefix}/parts/${part.kind}/${part.monthKey || 'global'}/${part.hash}.json`

  async function manifest() {
    const result = await adapter.read(latestPath, { fresh: true })
    if (!result) return null
    const value = result.value
    if (value?.format !== 'budget-cloud-manifest' || value.version !== 1 || typeof value.revision !== 'string' || typeof result.etag !== 'string' || !result.etag) throw new HttpError(503, 'CLOUD_DATA_INVALID', '云端版本信息异常，请保留本机账本')
    validateDescriptors(value.parts)
    return result
  }

  async function readPart(part) {
    validateDescriptors(part.kind === 'metadata' ? [part] : [part, { kind: 'metadata', hash: '0'.repeat(64) }])
    const result = await adapter.read(partPath(part))
    if (!result) throw new HttpError(400, 'MISSING_PART', '云端分片尚未上传完成')
    if (hashJSON(result.value) !== part.hash) throw new HttpError(503, 'PART_HASH_MISMATCH', '云端分片校验失败，本机数据未更改')
    validatePart(part.kind, part.monthKey, result.value)
    return { part, payload: result.value }
  }

  async function uploadPart({ kind, monthKey, payload }) {
    validatePart(kind, monthKey, payload)
    const part = { kind, ...(kind === 'month' ? { monthKey } : {}), hash: hashJSON(payload) }
    const path = partPath(part)
    const existing = await adapter.read(path)
    if (!existing) {
      try { await adapter.write(path, payload, { createOnly: true }) }
      catch (error) { if (error.code !== 'PRECONDITION_FAILED') throw error; await readPart(part) }
    } else if (hashJSON(existing.value) !== part.hash) throw new HttpError(503, 'PART_HASH_MISMATCH', '云端分片校验失败')
    return part
  }

  async function load({ manifestOnly = false } = {}) {
    const current = await manifest()
    if (!current) return { revision: null, snapshot: null, updatedAt: null, parts: [] }
    const { revision, updatedAt, parts } = current.value
    if (manifestOnly) return { revision, updatedAt, parts }
    const entries = []
    for (const part of parts) entries.push(await readPart(part))
    return { revision, updatedAt, snapshot: assembleBackup(entries) }
  }

  async function commit({ baseRevision, requestId, parts, snapshot }) {
    if (!(baseRevision === null || typeof baseRevision === 'string') || typeof requestId !== 'string' || !/^[a-zA-Z0-9_-]{16,100}$/.test(requestId)) throw new HttpError(400, 'INVALID_SYNC_REQUEST', '云端保存缺少有效版本或请求标识')
    if (snapshot !== undefined) {
      if (parts !== undefined) throw new HttpError(400, 'INVALID_SYNC_REQUEST', '不能同时提交整份账本和分片')
      parts = []
      for (const part of splitBackup(snapshot)) parts.push(await uploadPart(part))
    }
    parts = validateDescriptors(parts)
    const contentHash = hashJSON(parts)
    const current = await manifest()
    if (current?.value.requestId === requestId) {
      if (current.value.contentHash !== contentHash) throw new HttpError(400, 'REQUEST_ID_REUSED', '同一保存标识不能用于不同账本')
      return { revision: current.value.revision, updatedAt: current.value.updatedAt }
    }
    const revision = current?.value.revision || null
    if (baseRevision !== revision) throw new HttpError(409, 'REVISION_CONFLICT', '云端已有更新，本机修改已保留', { revision })
    // Verify every immutable part and the complete ledger before changing the only mutable pointer.
    const entries = []
    for (const part of parts) entries.push(await readPart(part))
    assembleBackup(entries)
    const next = { format: 'budget-cloud-manifest', version: 1, revision: randomUUID(), requestId, parentRevision: revision, updatedAt: new Date().toISOString(), parts, contentHash }
    await adapter.write(`${prefix}/revisions/${next.revision}.json`, next, { createOnly: true })
    try {
      await adapter.write(latestPath, next, current ? { ifMatch: current.etag } : { createOnly: true })
    } catch (error) {
      if (error.code !== 'PRECONDITION_FAILED') throw error
      const changed = await manifest()
      if (changed?.value.requestId === requestId && changed.value.contentHash === contentHash) return { revision: changed.value.revision, updatedAt: changed.value.updatedAt }
      throw new HttpError(409, 'REVISION_CONFLICT', '云端已有更新，本机修改已保留', { revision: changed?.value.revision || null })
    }
    return { revision: next.revision, updatedAt: next.updatedAt }
  }

  return { load, readPart, uploadPart, commit }
}
