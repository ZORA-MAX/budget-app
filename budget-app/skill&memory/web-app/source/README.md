# 月度账单分析 Budget App

导入微信 + 支付宝 CSV 账单，自动分类生成消费分析报告。

## 本地运行

```bash
# 1. 安装依赖
npm install

# 2. 启动开发服务器
npm run dev

# 3. 浏览器打开 http://localhost:5173
```

截图识别需要在 `.env.local` 中配置 `AI_GATEWAY_API_KEY` 或 `CLAUDE_API_KEY`。
Vercel 本地/云端运行时也可以使用项目自动提供的 `VERCEL_OIDC_TOKEN`。
AI Gateway 在开始识别前可能要求在 Vercel 控制台完成付款方式验证；每次识别会产生模型用量。

## 部署到 Vercel

```bash
# 1. 初始化 Git 仓库
git init
git add .
git commit -m "first commit"

# 2. 在 GitHub 创建仓库，然后推送
git remote add origin https://github.com/你的用户名/budget-app.git
git branch -M main
git push -u origin main

# 3. 去 vercel.com 用 GitHub 登录，Import 仓库，点 Deploy

# 4. 在 Vercel 后台 Settings → Environment Variables 添加：
#    AI_GATEWAY_API_KEY = 你的 Vercel AI Gateway 密钥
#    或 CLAUDE_API_KEY = 你的 Claude API 密钥
```

## 功能

- 自动识别微信 / 支付宝两种 CSV 格式
- 11 大类 33 子类自动分类
- 月度消费看板（环形图 + 分类明细 + 趋势）
- AI 消费分析（需配置 Claude API Key）
- 本地数据持久化（IndexedDB）
- 从手动分类和消费属性修改中自动学习
- 支持导入历史分类 JSON，仅学习明确编辑过的记录
- 精确交易记忆仅保存在浏览器本地，GitHub 不包含原始账单和联系人信息
- 分类记忆的规则、优先级和隐私边界见 [分类记忆设计](docs/classification-memory.md)
- 响应式设计，移动端友好
- 支持暗色模式
