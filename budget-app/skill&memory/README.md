# Budget App Skill & Memory 跨设备备份

更新时间：2026-08-06

这个目录保存月度账单工具的可迁移能力，不保存真实账单、截图、银行卡信息、浏览器数据库或密钥。

## 目录内容

- `skills/reconcile-spending-evidence/`：整合支付宝、微信、银行卡/信用卡、拼多多及消费截图，匹配商品明细并生成网页可导入的 Excel。
- `skills/apply-budget-memory/`：学习并应用交通、咖啡奶茶、商户名称和月度合并规则。
- `memory/`：长期分类学习与项目偏好，仅保存通用规则，不保存完整个人流水。
- `docs/`：分类记忆设计说明。
- `web-app/source/`：已确认并上线的网页完整源码，可继续开发或重新部署。
- `web-app/static-site/`：使用相对资源路径构建的便携静态网页。
- `VERSION.md`：本次备份版本、线上入口和验证状态。

## 换设备后如何使用

### 直接让 Codex 读取

把整个 `budget-app` 文件夹复制或同步到新设备，然后把新设备上的 `skill&memory` 绝对路径发给 Codex，并说明：

> 读取此目录中的 Skill 和 Memory，按其中规则处理账单。

### 安装为 Codex 全局 Skill

将 `skills/` 下的两个 Skill 文件夹复制到新设备的 Codex Skills 目录：

- macOS/Linux：`~/.codex/skills/`
- 如果新设备目录不同，以 Codex 设置中显示的 Skills 目录为准。

安装后保留本 `skill&memory/memory/` 目录，并在第一次使用时把它的绝对路径告诉 Codex。

### 运行网页源码

进入 `web-app/source/` 后运行：

```bash
npm install
npm run dev
```

### 运行便携静态网页

进入 `web-app/static-site/` 后启动本地网页服务：

```bash
python3 -m http.server 4178
```

然后访问 `http://127.0.0.1:4178/`。Windows 也可以使用 `py -m http.server 4178`。

线上稳定入口仍为：<https://zora-max.github.io/budget-app/>

## 数据迁移提醒

网页历史账单与分类学习保存在浏览器 IndexedDB 中，不在这个代码备份里。跨设备迁移真实数据时，应在网页“历史记录”中导出完整备份 JSON，再在新设备导入恢复。完整备份 JSON 含个人账单，不要提交到 GitHub 公共仓库。

## 后续更新规则

以后新增或修改 Skill、Memory、分类规则、网页功能时，同步更新本目录的对应副本与 `VERSION.md`。详细约束见 `AGENTS.md`。
