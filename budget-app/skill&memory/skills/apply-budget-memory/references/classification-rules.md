# Classification and grouping rules

Updated: 2026-08-08

## Matching normalization

- Build matching text from `名称`, `交易对象`, `具体商品或服务`, and `账单原商品字段`.
- Normalize Unicode, ASCII case, repeated whitespace, and common payment-channel prefixes for matching only.
- Collapse an exact adjacent duplicate such as `luckin coffee luckin coffee` to one phrase.
- Preserve all original fields in the workbook.

## Classification precedence

1. User-confirmed category in an adjusted workbook.
2. High-confidence alias below.
3. Required composite signal below.
4. Candidate review; do not guess.

## Transport aliases

| Rule | Match signal | Canonical name | Category | Nature | Confidence |
|---|---|---|---|---|---|
| `taxi-gaode` | Contains `高德打车订单` or `高德信息技术` | 高德打车 | 交通出行 / 打车 | 刚需、效率 | high |
| `metro-suzhou` | Contains `苏州支付宝小程序自动充值` or `苏州城慧通` | 苏州地铁通勤 | 交通出行 / 地铁公交 | 刚需、固定、效率 | high |
| `metro-beijing` | Contains `北京一卡通充值` | 北京公共交通 | 交通出行 / 地铁公交 | 刚需、效率 | high |
| `bike-hello` | Contains `哈啰助力车骑行`, `哈啰单车`, or `哈啰骑行` | 哈啰共享单车 | 交通出行 / 共享单车 | 刚需、固定、效率 | high |
| `bike-qingju` | Contains `杭州青奇` and `先乘车后付款`, or contains `青桔单车` | 青桔共享单车 | 交通出行 / 共享单车 | 刚需、效率 | high |

### Transport monthly grouping

- After classification and deduplication, group expenses within the same month by secondary category: `打车`, `地铁公交`, or `共享单车`.
- Produce one aggregate row per month and secondary category with distinct canonical display names: `地铁公交`, `打车`, and `共享单车`. Never name all three aggregates `交通`, because exact-name memory may then assign the wrong secondary category.
- Set aggregate amount to the sum, aggregate count to the sum of source counts, and representative time to the latest source time.
- Preserve source rows in an audit/detail sheet and record the merge rule.
- Keep `高铁机票` separate unless the user later confirms a grouping rule.

### Do not generalize these names alone

Do not automatically classify generic labels such as `上海拉扎斯`, `特约商户`, `平台商户`, `群收款`, or a personal contact as transport. If an adjusted workbook already classifies a specific row as transport, include it in that month's category aggregate, but require fresh context for future unclassified rows.

## Coffee and tea aliases

| Rule | Match signal | Canonical name | Category | Nature | Confidence |
|---|---|---|---|---|---|
| `drink-luckin` | Contains `luckin coffee` or `瑞幸咖啡` | 瑞幸咖啡 | 餐饮消费 / 咖啡奶茶 | 弹性 | high |
| `drink-pelican` | Contains `Pelican鹈鹕` | Pelican鹈鹕 | 餐饮消费 / 咖啡奶茶 | 弹性、改善 | high |
| `drink-qilindakocha` | Contains `麒麟大口茶` | 麒麟大口茶 | 餐饮消费 / 咖啡奶茶 | 弹性 | high |
| `drink-maijiniunai` | Contains `麦记牛奶` | 麦记牛奶 | 餐饮消费 / 咖啡奶茶 | 弹性 | high |
| `drink-chagee` | Contains `霸王茶姬` or `CHAGEE` | 霸王茶姬 | 餐饮消费 / 咖啡奶茶 | 弹性 | high |
| `drink-u7-vending` | Contains `智能货柜消费` and `U7混合水果味` | U7混合水果味饮料 | 餐饮消费 / 咖啡奶茶 | 弹性、奖励、改善 | medium-high |
| `drink-blueglass` | Contains `Blueglass酸奶` | Blueglass酸奶 | 餐饮消费 / 咖啡奶茶 | 弹性 | high |
| `drink-cocacola` | Concrete product contains `可口可乐` | 可口可乐 | 餐饮消费 / 咖啡奶茶 | 弹性 | high |
| `drink-yongmin` | Contains `永民手作` and the row is a food/drink order | 永民手作 | 餐饮消费 / 咖啡奶茶 | 弹性 | medium-high |

### Coffee and tea grouping

- Group only within the same month and the same canonical name.
- Do not combine all coffee/tea merchants into one transaction.
- Sum amount and source count; keep the canonical merchant name as the aggregate name.
- Keep different branches under one canonical brand unless the user explicitly wants branch-level analysis.
- Keep refunds separate from expenses.

## June 2026 learned aliases and context rules

The following rules were promoted from explicit browser edits in the June full-backup JSON. Apply only the stated signal; keep generic payees and transfers in exact browser memory.

| Rule | Required signal | Classification | Nature | Confidence |
|---|---|---|---|---|
| `pet-insurance` | Contains `宠物医保` | 日用消耗 / 宠物用品 | 刚需、高频 | high |
| `pet-ride` | Contains both `顺风车` and `宠物` | 日用消耗 / 宠物用品 | 刚需、高频 | high |
| `moving-shipping` | Shipping/express row also contains `搬家`, `打包`, or user-confirmed moving context | 居住生活 / 搬家 | 刚需、固定、改善 | medium-high |
| `small-badge-hardware` | Concrete item contains `徽章`, `卡帽`, `锁扣`, or similar small fastening hardware | 日用消耗 / 生活小物 | 刚需、高频 | medium-high |
| `fruit-concrete` | Concrete purchased item is fruit; do not use supermarket name alone | 餐饮消费 / 水果 | 刚需 | high |
| `travel-food-context` | Restaurant/food merchant plus confirmed overseas or travel context | 旅游度假 / 旅行餐饮 | 奖励、弹性 | medium-high |

### June rules kept exact-only

- Personal-contact transfers manually marked as 聚餐、房租、水电燃气、运动装备 or 红包 remain exact browser memory. Never generalize the contact or masked payee.
- Generic QR collections and scan-code payments remain exact-only unless the concrete item/service is present.
- A merchant or supermarket name alone does not prove 水果、搬家、伴手礼, or 旅行餐饮.

## Income and refund behavior

- Preserve all valid `收入`, `支出`, and `退款` records before classification or grouping.
- Do not apply spending categories to genuine income unless the user defines an income taxonomy later.
- Keep refunds distinct from genuine income.
- Apply refund offsets after source deduplication and before monthly spending aggregation.
- A fully refunded expense contributes `0` to net spending; a partial refund contributes only the remaining amount.
- Never pair a refund solely because its amount equals an expense.

## Quality checks

- Aggregate amount equals the source-row sum to the cent.
- Aggregate count equals the number of underlying transactions after deduplication.
- Every aggregate retains source references.
- Unknown or conflicting names stay unmerged and visible for review.
