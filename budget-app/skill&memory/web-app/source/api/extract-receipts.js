function extractJson(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]
  const candidate = fenced || text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)
  return JSON.parse(candidate)
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  const claudeApiKey = process.env.CLAUDE_API_KEY
  const gatewayToken = process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN
  if (!claudeApiKey && !gatewayToken) {
    return res.status(503).json({
      error: '截图识别服务尚未配置：请设置 AI_GATEWAY_API_KEY 或 CLAUDE_API_KEY',
      code: 'AI_CREDENTIALS_MISSING',
    })
  }

  try {
    const { filename, image } = req.body || {}
    if (!image?.data || !image?.mediaType) return res.status(400).json({ error: '缺少截图数据' })

    const prompt = `你是个人账单截图结构化助手。分析截图 ${filename || ''}，提取截图中每一笔真实交易。
必须优先识别具体买到的商品/服务名称，不能把“拼多多先用后付”“平台商户”“微信支付”“订单”当作商品名。
如果截图包含订单商品清单，itemNames 要逐项列出；productName 写清晰的汇总商品名。
金额、时间、平台、商家看不清时使用 null，不要猜测。direction 只能是 expense、income、refund、transfer、other。
只返回 JSON，不要解释：
{
  "transactions": [{
    "date": "YYYY-MM-DDTHH:mm:ss+08:00 或 null",
    "amount": 0,
    "direction": "expense",
    "platform": "拼多多/淘宝/京东/微信/支付宝/银行等",
    "merchant": "商家或收付款方",
    "productName": "具体商品或服务",
    "itemNames": ["具体商品1", "具体商品2"],
    "quantity": "数量信息",
    "status": "交易状态",
    "paymentMethod": "支付方式",
    "orderId": "订单号",
    "transactionId": "交易号",
    "rawText": "与该笔交易有关的关键原文",
    "confidence": 0.0
  }]
}`

    const useGateway = Boolean(gatewayToken)
    const response = await fetch(useGateway
      ? 'https://ai-gateway.vercel.sh/v1/messages'
      : 'https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: useGateway ? {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${gatewayToken}`,
        'anthropic-version': '2023-06-01',
      } : {
        'Content-Type': 'application/json',
        'x-api-key': claudeApiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: useGateway ? 'anthropic/claude-sonnet-4.6' : 'claude-sonnet-4-6',
        max_tokens: 1800,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: image.mediaType, data: image.data } },
            { type: 'text', text: prompt },
          ],
        }],
      }),
    })

    if (!response.ok) {
      const upstreamError = await response.text()
      console.error('Receipt extraction error:', response.status, upstreamError)
      let upstreamType = ''
      try {
        upstreamType = JSON.parse(upstreamError)?.error?.type || ''
      } catch {
        upstreamType = ''
      }
      if (upstreamType === 'customer_verification_required') {
        return res.status(503).json({
          error: 'Vercel AI Gateway 尚未完成付款方式验证；请在 Vercel AI Gateway 中添加有效付款方式后重试',
          code: 'AI_GATEWAY_VERIFICATION_REQUIRED',
        })
      }
      if (response.status === 401 || response.status === 403) {
        return res.status(502).json({ error: '截图识别凭证无效或已过期，请更新 AI 服务凭证', code: 'AI_AUTH_FAILED' })
      }
      if (response.status === 402) {
        return res.status(502).json({ error: 'AI 识别额度不足，请检查 Vercel AI Gateway 额度', code: 'AI_CREDITS_EXHAUSTED' })
      }
      if (response.status === 429) {
        return res.status(429).json({ error: '识别请求过于频繁，请稍后重试', code: 'AI_RATE_LIMITED' })
      }
      return res.status(502).json({ error: `截图识别服务暂时不可用（${response.status}）`, code: 'AI_UPSTREAM_ERROR' })
    }
    const data = await response.json()
    const text = data.content?.filter(block => block.type === 'text').map(block => block.text).join('') || ''
    const parsed = extractJson(text)
    return res.status(200).json({ transactions: Array.isArray(parsed.transactions) ? parsed.transactions : [] })
  } catch (error) {
    console.error('Receipt handler error:', error)
    return res.status(500).json({ error: '截图解析失败，请换一张更清晰的截图' })
  }
}
