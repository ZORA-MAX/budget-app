# 消费与偿债数据约定

## 保留原资金事实

`amount` 始终是该流水原额。`direction` 使用 expense / income / refund / transfer / other；`isEffective` 表示此记录是否已实际发生并纳入已记录现金流，不能用它替代“是否属于消费”。

可选字段：
- `stableKey`：导入批次中唯一且稳定的来源记录键，防止同秒同名同金额流水冲突；旧记录不必补填，旧键保持兼容。
- `netConsumption`：非负，按导入总账和已核验退款记录确定的原单净额；全退为 0。未关联退款只进入现金流，不自行分摊分类。
- `includeInConsumption`：false 排除借款、还款本金、内部转账等非消费项。
- `cashflowImpact`：有符号实际现金流，用于外部借款或偿债等 transfer；内部转账填 0。省略时沿用 direction 和 amount。
- `consumptionBasis`：人可读的范围和未关联退款说明；页面按月去重展示。

旧数据没有 netConsumption 时保守沿用原额，并标明未核退款。不能把旧分类或日期当作退款关联证据。编辑原额会保留原已核验退款差额；方向编辑优先于导入现金流方向。

## 备份与债务

完整备份仍是 `format: budget-app-backup`、`schemaVersion: 2`，每月写入会替换同月，其他月份保留。交易扩展字段不改变原始字段。

顶层可选 `debtLedger`：`{ version: 1, asOf, notes, items: [...] }`。未提供该字段时保留本机原债务台账，不删除或清空。此数据保存在浏览器 localStorage，并随完整备份导出。

每条 item 必有 id、title；可选 originalPrincipal、remainingPrincipal、remainingPrincipalLabel、unbilledPrincipal、unbilledInterest、remainingPeriods、annualRate（百分数，如 5 表示 5%）、monthlyPayment、annualReserve（每月预留）、notes。

payments 数组记录有证据的实际还款，字段 date、amount、label、status；schedule 数组记录计划/入账事实，字段 period、date、principal、interest、amount、status。计划不会自动生成消费流水。

待入账本金不等同于完整剩余本金；已入账也不等同于已实付。只有证据足够才填对应字段，缺口写 notes。

## 导入与显示

核验账本可以给出净消费/净支出/净计入金额、是否计入消费、现金流影响、消费口径说明，以及一级分类、二级分类、消费性质。显式类型优先于交易状态文字，已付款后关闭的记录可由明确“是否计入收支=是”保留。推荐用已核验 JSON 导入包避开混合工作表重复读取。

历史列表、分类图、趋势、Top 和消费性质使用同一净消费计算。明细与导出仍保留原付款，导出另附净消费和现金流影响列。贷款计划单独展示。
