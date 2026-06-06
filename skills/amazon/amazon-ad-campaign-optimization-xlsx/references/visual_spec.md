# 广告优化方案 xlsx 视觉规格（金标准）

> 本文档由 `templates/golden_sample.xlsx` 实测提取，是 `scripts/build_xlsx.py` 必须严格对齐的视觉基线。
> 修改本文档前必须同步更新 `verify_xlsx.py` 的硬失败规则。

## 字体

- 主字体：**微软雅黑** （所有有内容的单元格必须用这个，英文/数字也用这个，避免中英混排错位）
- 西文兜底：Calibri（默认空格 / Excel 自动用，不主动设）

## 色卡（必须是这 9 个 ARGB 值，多一个不要少一个不行）

| 用途 | 名称 | ARGB | 备注 |
|---|---|---|---|
| 标题字色 | navy | `FF1F4E78` | sheet 顶部大标题字，14pt bold |
| 章节字色 | red_text | `FFC00000` | "一、xxx" 章节小标题字，12pt bold |
| 保护词字色 | dark_green_text | `FF006100` | Sheet 04 保护词章节标题专用 |
| 表头底色 | navy_bg | `FF1F4E78` | 表头深蓝底，配白字 |
| 表头字色 | white | `FFFFFFFF` | 表头唯一字色 |
| 状态-坏 | red_bg | `FFFFCCCC` | 黑洞 / P0 / 风险 / 同步操作警示 |
| 状态-好 | green_bg | `FFC6EFCE` | 健康 / 高效 / 保护词 / P3 / 新增 |
| 状态-警 | gold_bg | `FFFFE699` | 观察 / P1 / 警告 |
| 状态-中 | yellow_bg | `FFFFF2CC` | 一般 / P2 / 合计 / 备注 |
| 参数底 | light_blue_bg | `FFDDEBF7` | 参数行 / Day 标 / 改造前数据行 |
| 灰底 | gray_bg | `FFEDEDED` | 次要信息（"其他17个词"这种汇总） |

> openpyxl 写入时用 `Color(rgb="1F4E78")` 即可，会自动加 alpha 前缀变 `FF1F4E78`。

## 行高规格

| 行类型 | 高度 | 用法 |
|---|---|---|
| 标题行 | 28 | sheet 第 1 行 |
| 章节行 | 24 | "一、二、三" 红字章节小标题 |
| 表头行 | 32 | 深蓝底白字表头 |
| 数据-紧 | 22 | Sheet 03 参数表 / Sheet 04 词列表 |
| 数据-中 | 24 | Sheet 01 数据 / Sheet 06/07 大部分行 |
| 数据-高 | 32 | Sheet 05 加码行（有理由长文本） |
| 数据-动作 | 38-50 | Sheet 05/08 多行文本 |
| 数据-超高 | 85 | Sheet 02 P0/P1/P2 动作行（含具体参数+预期） |

## 列宽规格（每个 sheet 单独配，必须按 sheet 设）

| Sheet | 列宽（A,B,C,D,E,F,G,H） |
|---|---|
| 01-现状诊断 | 38, 11, 9, 14, 10, 9, 38, 15 |
| 02-核心动作 | 9, 22, 28, 35, 35, 12 |
| 03-新Campaign搭建 | 22, 38, 40, 12 |
| 04-否定词清单 | 42, 14, 40, 16 |
| 05-加码清单 | 45, 11, 22, 12, 24, 20 |
| 06-预算重分配 | 28, 15, 14, 20, 35, 15 |
| 07-执行Checklist | 14, 52, 26, 12, 8 |
| 08-风险提示 | 35, 38, 40 |

## 合并规则

- **第 1 行标题**：横跨整个 sheet 的全部列（如 Sheet 01 是 `A1:H1`）
- **章节行**：同上横跨全部列（如 Sheet 01 的 `A3:H3`）
- **Sheet 04 保护词块**：每个保护词 chip 行单独 `A{r}:D{r}` 合并（让 emoji + 词列表占满整宽）
- **Sheet 06 末尾说明行 / Sheet 04 末尾"📊 直接省"行**：横跨全部列合并

## 状态枚举（emoji + 配色，必须完全匹配）

### Sheet 01 效率列（H 列）

| emoji | 文字 | 底色 |
|---|---|---|
| ✓✓ | 高效 | green_bg |
| ✓ | 健康 | green_bg |
| ❌ | 效率黑洞 | red_bg |

### Sheet 02 优先级列（A 列）

| emoji | 文字 | 底色 |
|---|---|---|
| 🔴 | P0 | red_bg |
| 🟠 | P1 | gold_bg |
| 🟡 | P2 | yellow_bg |
| 🟢 | P3 | green_bg |

### Sheet 03 重要度列（D 列）

| emoji | 文字 | 底色 |
|---|---|---|
| ⚠️ | 同步操作 / 警示行 | red_bg |
| （无） | 必填 / 选填 | light_blue_bg |

### Sheet 04 保护词区（A 列，章节标题色 dark_green_text）

```
🛡️  trail camera / trail cameras / trail cam / ...
🛡️  cellular trail camera / ...
```

行底色：green_bg；emoji 与词之间用两个全角空格

### Sheet 04 否定词类型列

| emoji | 文字 | 底色 |
|---|---|---|
| ❌ | 立即否 | red_bg（行底色） |
| ⚠️ | 观察 | gold_bg（行底色） |

### Sheet 06 预算重分配 Trend 列

| emoji | 文字 | 底色 |
|---|---|---|
| 🆕 | 新增 | green_bg |
| ⬇️ | 缩减 | yellow_bg |
| ⬆️ | 增加 | green_bg |
| ➡️ | 保持 | light_blue_bg |
| 合计 | （无 emoji） | yellow_bg + bold |

### Sheet 07 Day 标记 / 完成框

- 周一/二/三/四/五行底色：light_blue_bg
- 周末/复盘行底色：green_bg
- 复盘日（Day 8-10 / Day 11-14）章节标记：green_bg
- 完成列：☐（U+2610，所有行）

## Sheet Title 大标题前缀（每个 sheet 第 1 行的 emoji，必须一致）

| Sheet | Emoji + 模板 |
|---|---|
| 01-现状诊断 | `📊 {ASIN_OR_SKU} 广告现状诊断（{date_range} 共{N}天）` |
| 02-核心动作 | `🎯 广告优化动作清单（{核心一句话目标}）` |
| 03-新Campaign搭建 | `🏗️ 新建Campaign详细设置（抄作业版）` |
| 04-否定词清单 | `🚫 否定词清单（保护词完全不动）` |
| 05-加码清单 | `📈 已验证转化词加码清单` |
| 06-预算重分配 | `💰 广告预算重分配方案` |
| 07-执行Checklist | `✅ 每日执行Checklist` |
| 08-风险提示 | `⚠️ 风险提示与注意事项` |

## Alignment 规则

| 列类型 | 水平 | 垂直 | wrap_text |
|---|---|---|---|
| 标题行 | left | center | True |
| 章节行 | left | center | True |
| 表头行 | center | center | True |
| 数据-关键词列 | left | center | True |
| 数据-数值列 | center | center | True |
| 数据-长文本列（理由/参数/操作内容） | left | center | True |

## Freeze Panes

- 金标准 **未冻结**任何窗格。新生成的 xlsx 也保持不冻结，避免长表格冻结后不直观。

## 校验门槛（verify_xlsx.py）

### 硬失败（必须通过，否则不交付）

1. Sheet 数恰好 8 个
2. Sheet 名按顺序：`01-现状诊断 / 02-核心动作 / 03-新Campaign搭建 / 04-否定词清单 / 05-加码清单 / 06-预算重分配 / 07-执行Checklist / 08-风险提示`
3. 每个 Sheet A1 单元格字色 `FF1F4E78` + 字号 14
4. 每个 Sheet 至少有一行 fill=`FF1F4E78`（表头）
5. 出现的字体名称只能是 `微软雅黑` 和 `Calibri`
6. 每个 Sheet 至少有 1 处合并单元格（标题行）

### 软警告（仅打印，不阻塞交付）

1. Sheet 04 保护词区缺失（保护词列表为空时允许）
2. 任一 Sheet 数据行少于 3 行（数据稀疏的 ASIN）
3. 颜色种类与色卡不完全匹配（用了未定义色值时）
