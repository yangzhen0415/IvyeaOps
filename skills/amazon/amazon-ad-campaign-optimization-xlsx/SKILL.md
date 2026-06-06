---
name: amazon-ad-campaign-optimization-xlsx
description: Use when 用户需要把多份 Amazon SP/SB 搜索词报告 CSV 转成一份 8-sheet 的 Excel 广告优化方案（现状诊断 / 核心动作 / 新建 campaign / 否词 / 加码 / 预算重分配 / 执行 checklist / 风险），视觉效果对齐 5/12 FKPCAM 金标准模板，并用 SIF MCP 做关键词竞争与需求增强。
version: 1.0.0
author: Hermes Agent
license: MIT
metadata:
  hermes:
    tags: [amazon, ads, search-term-report, xlsx, optimization, sif]
    related_skills: [zach-search-term-report-analyzer, amazon-asin-cosmo-rufus-audit]
---

# Amazon 广告优化方案 xlsx 生成器

把 1~N 份 Amazon 搜索词/Campaign 报告 CSV，按 5/12 FKPCAM 金标准的视觉规格，渲染成一份 8-sheet 的 .xlsx 优化方案。

## When to Use

触发条件（任一）：
- 用户上传 Amazon SP/SB 搜索词报告 CSV，要求"出一份广告优化方案"
- 用户上传多个按广告结构拆出的搜索词 CSV（如 自动 / 广泛 / 词组 / 核心 / 捡漏），要求判断哪些词该加码、降价、否定，或问是否需要新建广告活动
- 用户说"按 FK50 那份格式做"/"复刻 5/12 那份 xlsx"/"做成 8 sheet 的 Excel"
- 用户给定 ASIN+CSV+目标后要求"系统性诊断+重排预算+给执行 checklist"

不要在以下场景调用：
- 仅看销量/排名趋势 → 用 `mcp_sif_mcp_ops_get_asin_traffic_trend`
- 仅做单 ASIN 全维度审计（非广告优化）→ 用 `amazon-asin-cosmo-rufus-audit`
- 仅做搜索词分类（无需 xlsx）→ 用 `zach-search-term-report-analyzer`

## Required Inputs

向用户确认这 7 项，缺一不能跑：

| 字段 | 含义 | 示例 |
|------|------|------|
| `csv_files` | 1~N 个 CSV 路径，SP/SB 都行 | `["/tmp/sp_search_term.csv", "/tmp/sb_search_term.csv"]` |
| `asin` | 主 ASIN | `B0CLPGQWNB` |
| `marketplace` | 站点 | `US` / `DE` / `UK` |
| `start_date` / `end_date` | 报告时间窗 yyyy-MM-dd | `2026-04-21` / `2026-05-11` |
| `goal` | 阶段目标，5 选 1 | `profit` / `volume` / `clearance` / `launch` / `volume_with_top_of_search_push` |
| `protected_keywords` | 保护词，**不否、不降但仍按数据建议 bid** | `["trail camera", "wildlife camera"]` |
| `product_notes` | 产品配置/卖点，影响词义判断 | `"4G+太阳能；不含电池；防水 IP66"` |

`goal` 含义：
- `profit` — 盈利优先，黑洞词无豁免
- `volume` — 冲量，可容忍偏高 ACOS
- `clearance` — 清货，aggressive 拉量
- `launch` — 新品冲量+学习
- `volume_with_top_of_search_push` — 冲量 + 必拿首页顶部坑位（要求新建 ToS-Only campaign）

## Workflow

### Step 1 — 解析 CSV
```bash
python scripts/parse_csvs.py \
  --csv FILE1 FILE2 ... \
  --asin B0XXX --marketplace US \
  --start-date 2026-04-21 --end-date 2026-05-11 \
  --out /tmp/ad-skill/{ASIN}_{ts}/aggregated.json
```
产出 `aggregated.json`：totals / by_campaign / by_keyword / top30_search_terms。
中英列名兼容（见 `scripts/parse_csvs.py` 的 `COLUMN_ALIASES`）；陌生列名报错而不是静默丢弃。

### Step 2 — SIF 数据增强（顺序固定，可降级）

按以下 5 工具依次调用。**每个调用失败标"未获取到"继续**，不阻断流程。

1. `mcp_sif_mcp_ads_get_asin_ad_window_feature_profile` — 必跑，给广告画像
2. `mcp_sif_mcp_market_get_asin_keyword_signals` — `topN=50, time_value=30`
3. `mcp_sif_mcp_market_get_keyword_demand` — 保护词全跑（≤20 个）
4. `mcp_sif_mcp_market_get_keyword_competition` — 取 top-3 花费词 + 保护词去重 ≤ **8 个**（这个工具单次 ASIN 不能超过 8 keyword）
5. `mcp_sif_mcp_ads_get_asin_campaign_contribution_overview` — 只在 `aggregated.totals.acos > 0.4` 或 由用户指出的异常窗口才跑

把所有响应合并成 `sif_data.json` 写到同一个 run 目录。

### Step 3 — LLM 出 plan.json

把以下打包给 LLM：
- `aggregated.json`（top30 + by_campaign + by_keyword + totals）
- `sif_data.json`
- 用户输入：goal / protected_keywords / product_notes / marketplace
- `references/decision_rules.md`（决策铁律 + 数据驱动 + 破例规则）
- `references/llm_output_schema.json`（**LLM 必须严格按此 schema 出 JSON，不许加字段不许少字段**）

LLM 输出顶层 8 字段（具体见 schema）：
```
meta / diagnosis / actions / new_campaigns / negatives / boost / budget_redistribution / checklist
```

不让 LLM 决定的事：
- 视觉参数（颜色/字体/行高/列宽）—— 全在 `build_xlsx.py` 顶部 const
- Sheet 8 风险文案 —— 走 `templates/risk_text.md`
- 状态枚举 —— 必须用 `references/llm_output_schema.json` 的 enum 字符串

### Step 4 — 渲染 xlsx
```bash
python scripts/build_xlsx.py \
  --plan plan.json \
  --aggregated aggregated.json \
  --risk-template templates/risk_text.md \
  --out ~/.hermes/cache/{ASIN}_广告优化方案_{YYYYMMDD}.xlsx
```
路径已存在时自动追加 `_v2/_v3`，绝不覆盖。

### Step 5 — 自检
```bash
python scripts/verify_xlsx.py ~/.hermes/cache/{ASIN}_广告优化方案_{YYYYMMDD}.xlsx
```
- HARD 失败（exit 1）：sheet 数 / 名 / 标题色 / 字体
- SOFT 警告（exit 0）：行数偏少 / 合并区少 / 列宽漂移 / 保护词块缺 / R3 红字缺
- 端到端 smoke 用 `--strict-soft` 把 SOFT 也升级成失败

### Step 6 — 交付
- 把 xlsx 路径用 `MEDIA:` 前缀回给用户
- 简短摘要：今日 ACOS / 单量 / 黑洞词数 / 否词 / 加码数 / 新建 campaign 数 / 预期变化

## Files

- `scripts/parse_csvs.py` — CSV → aggregated.json
- `scripts/build_xlsx.py` — plan.json + aggregated.json + risk_text.md → 8-sheet xlsx
- `scripts/verify_xlsx.py` — 视觉基线自检
- `references/visual_spec.md` — 金标准实测的色卡/字体/行高/列宽/合并/状态枚举
- `references/decision_rules.md` — 决策铁律 + 数据驱动 + 破例规则（喂 LLM）
- `references/llm_output_schema.json` — LLM 输出严格 schema
- `references/trail-camera-cellular-solar-case.md` — cellular/solar trail camera 多广告结构 CSV 的中文诊断与新建活动模式
- `templates/golden_sample.xlsx` — 5/12 FKPCAM 金标准 21990 字节
- `templates/risk_text.md` — Sheet 8 固定文案，含 `{{核心词}}` / `{{tos_campaign_name_or_default}}` 占位

## Common Pitfalls

1. **大词 ACOS 豁免** — 没有这个豁免。protected_keywords 仅"不否"，bid 仍按数据建议（高 ACOS 该降就降）。
2. **不投 SBV / 不走 Vine** — `actions` / `new_campaigns` 中绝不出现 SBV 或 Vine 建议。
3. **预设产品配置** — 不要默认产品有 4G/WiFi/电池/IP 等卖点；只用 `product_notes` 显式给的信息。
4. **CSV 列名不识别** — 若缺的是常规字段（如 spend/orders），把列名加到 `COLUMN_ALIASES`，不要改业务逻辑；若导出的搜索词报告本身没有 `Campaign` 列，`parse_csvs.py` 现已回退到文件名 stem 作为 campaign，因此临时文件应尽量保留原始文件名（不要只传 `source_xxx.csv` 这类无语义名字）。
5. **KeywordCompetition 超过 8 个** — SIF 工具单次 ASIN ≤8 keyword，记得去重。
6. **SBV 词在保护词里** — 保护词不能带 "video" / "sbv" 类描述符；如用户提了，按视频流量过滤后再传入。
7. **LLM 多生成字段** — 必须按 schema 严格出 JSON；多出字段或漏字段都丢回 LLM 重出，不要在 build_xlsx 里硬塞默认值。
8. **金标准视觉漂移** — 改 build_xlsx.py 的 `class C` / `class H` / `SHEETS_CONFIG` 之前必须先核对 `references/visual_spec.md`，否则 verify_xlsx 报 H3/H4。
9. **Path 冲突** — 同 ASIN 当天多次跑会自动 `_v2`，不要手工删旧文件。
10. **Sheet 8 占位符** — `risk_text.md` 里的 `{{核心词}}` 自动替换为 `protected_keywords[0]` 或第一个非汇总黑洞词；如果都没有，落到 "核心大词" 默认值。

## Output style

- 中文用户要求可执行表格或明确说“不要说英文”时，Excel sheet 名、表头、动作、解释尽量全部中文；关键词原文可保留英文，因为它们是 Amazon 搜索词。
- 明确回答“是否需要新建广告活动、建几个、现有活动怎么处理”，不要只给笼统策略。
- 面向运营执行时优先使用中文指标名：广告成本占比（ACOS）、投入产出比（ROAS）、转化率、单次点击成本。
- 对大词不要默认保护：如果核心精准词高花费低转化，允许建议降级为“守入口”、仅降低、降 bid、预算转移。

## Verification Checklist

跑完前手工核：

- [ ] verify_xlsx.py 退出码为 0（无 HARD 失败）
- [ ] 8 个 sheet 名称顺序对：`01-现状诊断 / 02-核心动作 / 03-新Campaign搭建 / 04-否定词清单 / 05-加码清单 / 06-预算重分配 / 07-执行Checklist / 08-风险提示`
- [ ] Sheet 02 actions 按 P0→P3 排序，CTR/CVR 杠杆类在 P0
- [ ] Sheet 04 顶部有保护词绿底 chip（如用户给了 protected_keywords）
- [ ] Sheet 06 合计行 改前/改后 总额相等（预算守恒）
- [ ] Sheet 07 周一 Day 1 有"立即否定 + 新建 ToS Campaign"两条
- [ ] Sheet 08 段一红底（绝对不能做）+ 段二金底（信号即调）
- [ ] 产品如果不是冲量类目标，Sheet 03 可为空（带说明），不要硬塞 ToS-Only campaign
- [ ] 文件名格式：`{ASIN}_广告优化方案_{YYYYMMDD}.xlsx`，已存在自动 `_v2`
