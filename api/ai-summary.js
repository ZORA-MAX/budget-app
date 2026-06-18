// Vercel Serverless Function — AI Summary via Claude API
// Deploy: this file lives at /api/ai-summary.js and auto-maps to POST /api/ai-summary

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const apiKey = process.env.CLAUDE_API_KEY
  if (!apiKey) {
    return res.status(500).json({ error: 'CLAUDE_API_KEY not configured' })
  }

  try {
    const { month, total, diff, categories } = req.body

    const catSummary = categories
      .map(c => `${c.label}: ¥${c.total}（${c.pct}%，${c.count}笔）`)
      .join('\n')

    const prompt = `你是一个个人消费分析助手。请根据以下月度消费数据，用中文写一段 150 字以内的消费分析，包括：
1. 指出消费结构是否健康
2. 哪个分类值得关注
3. 给出一条具体的省钱建议

月份：${month}
总支出：¥${total}
${diff !== undefined ? `与上月差额：¥${diff}` : ''}

各分类明细：
${catSummary}

请直接输出分析文字，不要加标题和序号。`

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 500,
        messages: [{ role: 'user', content: prompt }],
      }),
    })

    if (!response.ok) {
      const err = await response.text()
      console.error('Claude API error:', err)
      return res.status(502).json({ error: 'AI service error' })
    }

    const data = await response.json()
    const summary = data.content
      ?.filter(b => b.type === 'text')
      .map(b => b.text)
      .join('') || '分析生成失败'

    return res.status(200).json({ summary })
  } catch (err) {
    console.error('Handler error:', err)
    return res.status(500).json({ error: 'Internal error' })
  }
}
