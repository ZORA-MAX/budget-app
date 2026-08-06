const DATE_RE = /(20\d{2})[年/.\-](\d{1,2})[月/.\-](\d{1,2})日?|(?<!\d)(\d{1,2})[月/.\-](\d{1,2})日?/
const NUMBER = '([0-9]{1,7}(?:[,，][0-9]{3})*(?:\\.\\d{1,2})?)'
const AMOUNT_RE = new RegExp(`(?:人民币|CNY|RMB|[¥￥])\\s*[+\\-−]?\\s*${NUMBER}|[+\\-−]\\s*${NUMBER}|${NUMBER}\\s*元`, 'gi')
const IGNORE_RE = /^(交易成功|支付成功|扣款成功|支出|消费|详情|账单|余额|可用额度|银行卡|储蓄卡|信用卡|已入账)$/

function joinSpacedChinese(text) {
  let value = text
  let previous = ''
  while (value !== previous) {
    previous = value
    value = value.replace(/([\u3400-\u9fff])\s+(?=[\u3400-\u9fff])/g, '$1')
  }
  return value.replace(/\s+/g, ' ').trim()
}

function bankMerchantName(line) {
  return joinSpacedChinese(line)
    .replace(/^\d{1,2}\s*[。.·-]*\s*/, '')
    .replace(/^(?:网上快捷支付|二维码消费)\s*/, '')
    .replace(/[拌择]音支付/g, '抖音支付')
    .replace(/叮[噬咚]买[荣菜]/g, '叮咚买菜')
    .replace(/iCloud\s+由.*$/i, 'iCloud')
    .replace(/\s*\(\s*/g, '（')
    .replace(/\s*\)\s*/g, '）')
    .replace(/\s+-\s*/g, '-')
    .replace(/[.…。-]+\s*$/, '')
    .trim() || '银行卡消费'
}

function parseBankScreenshot(lines, now) {
  const normalized = lines.map(joinSpacedChinese)
  const monthLine = normalized.find(line => /20\d{2}[./-]\d{1,2}/.test(line))
  const monthMatch = monthLine?.match(/(20\d{2})[./-](\d{1,2})/)
  const year = Number(monthMatch?.[1] || now.getFullYear())
  const month = Number(monthMatch?.[2] || now.getMonth() + 1)
  const records = []
  let currentDay = null

  normalized.forEach((line, index) => {
    if (/^\d{1,2}:\d{2}/.test(line)) return
    const explicitDay = line.match(/^(0?[1-9]|[12]\d|3[01])(?:\s|[。.])/) 
    if (explicitDay) currentDay = Number(explicitDay[1])
    if (!/余额/.test(line)) return

    const amountMatch = line.match(/[-−]\s*([0-9]{1,7}(?:[,，][0-9]{3})*(?:\.\d{1,2})?)\s*$/)
    if (!amountMatch) return // Positive values are refunds/income, not spending.
    const amount = Number(amountMatch[1].replace(/[,，]/g, ''))
    if (!amount) return

    const merchantLine = normalized[index - 1] || ''
    const merchantDay = merchantLine.match(/^(0?[1-9]|[12]\d|3[01])(?:\s|[。.])/) 
    if (merchantDay) currentDay = Number(merchantDay[1])
    records.push({ day: currentDay, name: bankMerchantName(merchantLine), amount })
  })

  const firstDatedIndex = records.findIndex(record => record.day !== null)
  if (firstDatedIndex > 0) {
    const inferredDay = Math.min(records[firstDatedIndex].day + 1, new Date(year, month, 0).getDate())
    for (let index = 0; index < firstDatedIndex; index += 1) records[index].day = inferredDay
  }

  return records.flatMap((record, index) => {
    if (!record.day) return []
    const date = new Date(year, month - 1, record.day)
    return [{
      fingerprint: `${year}-${month}-${record.day}_${record.amount}_${record.name}_${index}`,
      date,
      name: record.name,
      amount: record.amount,
      source: 'bank-screenshot',
    }]
  })
}

function parseDate(text, fallbackDate) {
  const match = text.match(DATE_RE)
  if (!match) return fallbackDate
  const year = Number(match[1] || fallbackDate.getFullYear())
  const month = Number(match[2] || match[4])
  const day = Number(match[3] || match[5])
  const date = new Date(year, month - 1, day)
  return Number.isNaN(date.getTime()) ? fallbackDate : date
}

function cleanName(text) {
  return text
    .replace(DATE_RE, '')
    .replace(AMOUNT_RE, '')
    .replace(/[+\-−]?\s*元/g, '')
    .replace(/(?:交易成功|支付成功|扣款成功|支出|消费|已入账|人民币|CNY|RMB)/gi, '')
    .replace(/[|丨_—]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function nameFromContext(lines, index, currentLine) {
  const inline = cleanName(currentLine)
  if (inline.length >= 2 && !IGNORE_RE.test(inline)) return inline

  for (let offset = 1; offset <= 3; offset += 1) {
    const candidate = cleanName(lines[index - offset] || '')
    if (candidate.length >= 2 && !IGNORE_RE.test(candidate) && !DATE_RE.test(candidate)) return candidate
  }
  return '银行卡消费'
}

/** Convert loose OCR text from common bank screenshots into editable expenses. */
export function parseScreenshotText(text, now = new Date()) {
  const lines = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean)
  if (lines.filter(line => line.includes('余额')).length >= 2) return parseBankScreenshot(lines, now)
  const results = []
  let recentDate = now

  lines.forEach((line, index) => {
    if (DATE_RE.test(line)) recentDate = parseDate(line, recentDate)

    const matches = [...line.matchAll(AMOUNT_RE)]
    if (matches.length === 0) return

    // Prefer signed/currency amounts and ignore likely time, card-number and balance lines.
    const amountMatch = matches.at(-1)
    const numberText = amountMatch.slice(1).find(Boolean)
    const amount = Number(numberText.replace(/[,，]/g, ''))
    if (!amount || amount > 10000000 || /余额|可用额度|卡号|尾号/.test(line)) return

    const context = lines.slice(Math.max(0, index - 3), index + 1).join(' ')
    const date = parseDate(context, recentDate)
    const name = nameFromContext(lines, index, line)
    const fingerprint = `${date.toISOString().slice(0, 10)}_${amount}_${name}`
    if (results.some(item => item.fingerprint === fingerprint)) return
    results.push({ fingerprint, date, name, amount, source: 'bank-screenshot' })
  })

  return results
}
