export class HttpError extends Error {
  constructor(status, code, message, details = {}) { super(message); this.status = status; this.code = code; this.details = details }
}

export function secureHeaders(res) {
  res.setHeader('Cache-Control', 'private, no-store')
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('Referrer-Policy', 'no-referrer')
}

export function json(res, status, payload) {
  secureHeaders(res)
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.statusCode = status
  res.end(JSON.stringify(payload))
}

export function fail(res, error) {
  const known = error instanceof HttpError
  json(res, known ? error.status : 500, {
    error: { code: known ? error.code : 'SERVER_ERROR', message: known ? error.message : '云端服务暂时不可用，本机账单仍保留' },
    ...(known ? error.details : {}),
  })
}

export function method(req, allowed) {
  if (!allowed.includes(req.method)) throw new HttpError(405, 'METHOD_NOT_ALLOWED', '此操作不受支持')
}

export async function bodyJSON(req, limit = 4 * 1024 * 1024) {
  if (!String(req.headers?.['content-type'] || '').toLowerCase().startsWith('application/json')) throw new HttpError(415, 'UNSUPPORTED_MEDIA_TYPE', '请使用 JSON 数据')
  if (Number(req.headers?.['content-length']) > limit) throw new HttpError(413, 'PAYLOAD_TOO_LARGE', '单个云端分片过大，请保留本机备份后重试')
  let value = req.body
  if (value === undefined) {
    const chunks = []; let size = 0
    for await (const chunk of req) {
      const bytes = Buffer.from(chunk); size += bytes.length
      if (size > limit) throw new HttpError(413, 'PAYLOAD_TOO_LARGE', '单个云端分片过大，请保留本机备份后重试')
      chunks.push(bytes)
    }
    value = Buffer.concat(chunks)
  }
  if (typeof value === 'object' && value !== null && !Buffer.isBuffer(value)) {
    if (Buffer.byteLength(JSON.stringify(value)) > limit) throw new HttpError(413, 'PAYLOAD_TOO_LARGE', '云端请求过大')
    return value
  }
  const text = Buffer.isBuffer(value) ? value.toString('utf8') : String(value || '')
  if (Buffer.byteLength(text) > limit) throw new HttpError(413, 'PAYLOAD_TOO_LARGE', '云端请求过大')
  try { return JSON.parse(text) } catch { throw new HttpError(400, 'INVALID_JSON', '数据不是有效的 JSON') }
}
