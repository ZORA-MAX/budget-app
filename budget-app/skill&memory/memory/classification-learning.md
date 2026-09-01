# Spending Classification Learning

Updated: 2026-08-08
Latest reviewed source: `历史账单/6月/budget-full-backup-2026-08-08 (1).json`
Reusable rule source: `skills/apply-budget-memory/references/classification-rules.md`

## Confirmed workflow preferences

- Learn from user-adjusted workbooks incrementally.
- Preserve raw transaction text and keep learned rules free of personal transaction data.
- Merge confirmed `交通出行` expenses monthly by `打车`, `地铁公交`, and `共享单车` after deduplication.
- Merge `餐饮消费 / 咖啡奶茶` monthly by canonical merchant name; do not merge different brands together.
- Preserve source-row audit details, summed amount, and underlying transaction count.
- Preserve every valid income, expense, and refund row. Keep refunds separate from genuine income.
- Pair refunds only with unique evidence; calculate net spending after refund offset and never subtract the same refund twice.

## June learning summary

- Reviewed 31 explicit browser edits and 111 exact classification-memory entries.
- Promoted only generalized product, merchant, and multi-field signals; personal contacts, masked payees, amounts, dates, order IDs, and full transaction text remain outside portable memory.
- Treat browser full-backup JSON as valid learning evidence when it contains `data.overrides` and `data.classificationMemory`.

## Learned high-confidence transport signals

- 高德打车订单 / 高德信息技术 → 交通出行 / 打车.
- 苏州支付宝小程序自动充值 / 苏州城慧通 → 交通出行 / 地铁公交.
- 北京一卡通充值 → 交通出行 / 地铁公交.
- 哈啰助力车骑行 / 哈啰单车 / 哈啰骑行 → 交通出行 / 共享单车.
- 杭州青奇 + 先乘车后付款, or 青桔单车 → 交通出行 / 共享单车.

## Learned coffee and tea canonical names

- luckin coffee / 瑞幸咖啡 → 瑞幸咖啡.
- Pelican鹈鹕 / 堂食-Pelican鹈鹕 → Pelican鹈鹕.
- 麒麟大口茶（含门店与外卖后缀）→ 麒麟大口茶.
- 麦记牛奶（含门店与外卖后缀）→ 麦记牛奶.
- 霸王茶姬 / CHAGEE（含门店后缀）→ 霸王茶姬.
- 智能货柜消费 + U7混合水果味 → U7混合水果味饮料.
- Blueglass酸奶 → Blueglass酸奶.
- Concrete 可口可乐 product → 可口可乐.
- 永民手作 + food/drink order context → 永民手作.

## Learned June context rules

- 宠物医保 → 日用消耗 / 宠物用品；刚需、高频。
- 顺风车 + 宠物 → 日用消耗 / 宠物用品；刚需、高频。
- Express/shipping joins 居住生活 / 搬家 only when 搬家、打包 or confirmed moving context is also present.
- Concrete 徽章、卡帽、锁扣类小件 → 日用消耗 / 生活小物；刚需、高频。
- Concrete fruit item → 餐饮消费 / 水果；supermarket name alone is insufficient.
- Food/restaurant merchant joins 旅游度假 / 旅行餐饮 only with confirmed overseas or travel context.
- Transport monthly aggregate names stay distinct as 地铁公交、打车、共享单车; never collapse their display names to a generic `交通`.

## Guardrail

Names such as 上海拉扎斯、特约商户、平台商户、群收款 or personal contacts are not globally reusable category signals. A user-confirmed row may join its current month's transport aggregate, but a future unclassified row with only such a generic name must remain pending review.

Personal-contact transfers and generic scan-code payments adjusted in June remain exact browser memory only. Do not add those descriptions to portable rules.
