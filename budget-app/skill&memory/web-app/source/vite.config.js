import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import extractReceipts from './api/extract-receipts.js'

const MAX_API_BODY_BYTES = 12 * 1024 * 1024

function localReceiptApi() {
  return {
    name: 'local-receipt-api',
    configureServer(server) {
      server.middlewares.use('/api/extract-receipts', async (req, res) => {
        try {
          const chunks = []
          let size = 0
          for await (const chunk of req) {
            size += chunk.length
            if (size > MAX_API_BODY_BYTES) {
              res.statusCode = 413
              res.setHeader('Content-Type', 'application/json; charset=utf-8')
              res.end(JSON.stringify({ error: '截图数据过大，请压缩后重试' }))
              return
            }
            chunks.push(chunk)
          }

          const rawBody = Buffer.concat(chunks).toString('utf8')
          req.body = rawBody ? JSON.parse(rawBody) : {}

          const response = {
            status(code) {
              res.statusCode = code
              return response
            },
            json(payload) {
              res.setHeader('Content-Type', 'application/json; charset=utf-8')
              res.end(JSON.stringify(payload))
              return response
            },
          }
          await extractReceipts(req, response)
        } catch (error) {
          res.statusCode = error instanceof SyntaxError ? 400 : 500
          res.setHeader('Content-Type', 'application/json; charset=utf-8')
          res.end(JSON.stringify({ error: error instanceof SyntaxError ? '请求格式错误' : '本地识别接口异常' }))
        }
      })
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  for (const key of ['CLAUDE_API_KEY', 'AI_GATEWAY_API_KEY', 'VERCEL_OIDC_TOKEN']) {
    if (!process.env[key] && env[key]) process.env[key] = env[key]
  }

  return {
    plugins: [react(), localReceiptApi()],
    base: process.env.VITE_BASE_PATH || '/',
    server: { port: 5173 },
  }
})
