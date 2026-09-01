import { normalizeReceiptTransactions } from './receipt-reconciliation.js'

const MAX_IMAGE_EDGE = 1600
const JPEG_QUALITY = 0.82

function readAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = () => reject(new Error(`无法读取 ${file.name}`))
    reader.readAsDataURL(file)
  })
}

function loadImage(dataUrl) {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('截图格式无法识别'))
    image.src = dataUrl
  })
}

async function compressImage(file) {
  const original = await readAsDataUrl(file)
  const image = await loadImage(original)
  const scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(image.width, image.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(image.width * scale))
  canvas.height = Math.max(1, Math.round(image.height * scale))
  canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height)
  const dataUrl = canvas.toDataURL('image/jpeg', JPEG_QUALITY)
  return { mediaType: 'image/jpeg', data: dataUrl.split(',')[1] }
}

async function extractSingleReceipt(file) {
  const image = await compressImage(file)
  const response = await fetch('/api/extract-receipts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ filename: file.name, image }),
  })
  const responseText = await response.text()
  let payload = {}
  try {
    payload = responseText ? JSON.parse(responseText) : {}
  } catch {
    payload = {}
  }
  if (!response.ok) {
    if (response.status === 404) {
      throw new Error('本地截图识别接口未启动，请重启开发服务后重试')
    }
    throw new Error(payload.error || `${file.name} 识别失败（${response.status}）`)
  }
  return normalizeReceiptTransactions(payload.transactions, file.name)
}

export async function extractReceiptImages(files, onProgress) {
  const selected = Array.from(files || [])
  const transactions = []
  for (let index = 0; index < selected.length; index += 1) {
    onProgress?.({ current: index + 1, total: selected.length, filename: selected[index].name })
    transactions.push(...await extractSingleReceipt(selected[index]))
  }
  return transactions
}
