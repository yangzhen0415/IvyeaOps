# Cellular/Solar Trail Camera 广告架构搜索词案例

适用场景：用户上传多个按广告结构拆出的搜索词 CSV（如 自动 / 广泛 / 词组 / 核心 / 捡漏），想判断大词为何自然位不动，并要求做中文 Excel 优化表。

## 核心诊断模式

若核心精准大词（如 `trail camera`）表现为：

- 展示和点击显著高于其他词；
- 点击率低（例如 <1%）；
- 转化率低（例如 <2%）；
- ACOS / 广告成本占比极高；
- 同期中长尾词（cellular / solar / 4G / app / sim card / send pictures to phone）ACOS 明显更低、CVR 更高；

结论不要写成“大词继续冲”。应判断为：

> 大词已买到曝光，但搜索结果页点击与详情页转化信号不足，无法推动自然位；应将大词降级为守入口，把主预算转给高意图中词和长尾词。

## 推荐广告结构

现有 自动 / 广泛 / 词组 可保留做挖词；核心精准降预算；低效“捡漏”暂停或压低预算。通常建议额外新建 3 个活动：

1. 中词精准冲排名
   - 放入：`trail camera cellular`、`cellular trail camera`、`4g trail camera`、`solar cellular trail camera`、`4g solar trail camera` 等。
   - 目的：把已有首页基础的高相关中词推到首页中前段。

2. 高意图长尾精准
   - 放入：已出单或高度匹配的长尾，如 `cellular trail camera with solar panel`、`4g lte cellular trail camera night vision`、`solar trail camera with live feed`、`wildlife camera with sim card`、`trail cam with app`。
   - 目的：补订单、控 ACOS、反哺中词和大词。

3. 核心大词守入口
   - 放入：`trail camera`、`trail cameras`。
   - 策略：仅降低；降低基础 bid；保留适度 Top of Search 加价；不再吃主预算。

## 否词注意

对需要流量套餐激活的 cellular 产品：

- `no subscription` / `no monthly fee` 相关词通常应作为否定精准候选，避免低转化、差评、退货。
- `no wifi needed` 与产品功能可能相关，但必须在 Listing 中明确“无需 WiFi，但需要流量套餐”。不要与 no subscription 混为一谈。

## 中文输出要求

如果用户说“不要说英文”或在中文运营场景中要求可执行表格：

- Excel sheet 名、表头、动作、解释尽量全部中文；
- unavoidable 的关键词原文可以保留英文（因为是 Amazon 搜索词），但不要用英文管理术语堆叠解释；
- 用“广告成本占比”替代 ACOS、“投入产出比”替代 ROAS，必要时括号补充一次即可；
- 明确回答“是否需要新建广告活动、建几个、现有几个怎么处理”。
