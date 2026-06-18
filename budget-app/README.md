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
#    CLAUDE_API_KEY = 你的API密钥
```

## 功能

- 自动识别微信 / 支付宝两种 CSV 格式
- 11 大类 33 子类自动分类
- 月度消费看板（环形图 + 分类明细 + 趋势）
- AI 消费分析（需配置 Claude API Key）
- 本地数据持久化（IndexedDB）
- 响应式设计，移动端友好
- 支持暗色模式
