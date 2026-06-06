"""
Parse Amazon Ads search-term / campaign report CSVs (中英双语兼容) and emit aggregated.json.

Usage:
    python parse_csvs.py --csv path1.csv path2.csv ... \
        --asin B0XXX --marketplace US \
        --start-date 2026-04-21 --end-date 2026-05-11 \
        --out /tmp/aggregated.json

Output JSON shape (consumed by build_xlsx.py and the LLM prompt):
{
  "meta": { "asin": "...", "marketplace": "US", "date_range": "...", "days": N, "csv_files": [...] },
  "totals": { "spend": ..., "orders": ..., "clicks": ..., "impressions": ...,
              "ctr": ..., "cvr": ..., "acos": ..., "cpo": ..., "sales": ... },
  "by_campaign": [ {campaign, ad_type, spend, orders, clicks, impressions, ctr, cvr, acos, cpo, sales,
                    spend_share, order_share}, ... ],
  "by_keyword": [ {keyword, campaign, match_type, spend, orders, clicks, impressions, ctr, acos, cpo}, ...],
  "top30_search_terms": [ {keyword, campaign, match_type, ad_type, spend, orders, clicks, impressions,
                           ctr, acos, cvr, cpc, sales, source_file}, ... ]  # 前 30，按 spend 倒序
}

Key principles:
- Tolerant column-name aliasing (中/英 + 历史变体)
- Currency / percent / comma cleanup
- Rows with all-zero spend AND impressions are dropped (junk rows)
- Search-term reports vs campaign reports are auto-detected by header presence
- 任一 CSV 解析失败给清晰错误，不静默丢弃
"""

from __future__ import annotations

import argparse
import csv
import io
import json
import re
import sys
from collections import defaultdict
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any


# ---------------------------------------------------------------------------
# Column aliases — 双语兼容 + 历史命名变体
# ---------------------------------------------------------------------------
COLUMN_ALIASES: dict[str, list[str]] = {
    "campaign": [
        "campaign name", "广告活动名称", "广告活动", "campaign",
    ],
    "ad_group": [
        "ad group name", "广告组名称", "广告组", "ad group",
    ],
    "ad_type": [
        # Amazon 报告里没有显式 ad_type 列；从文件名推断 SP/SB/SD
    ],
    "targeting": [
        "targeting", "投放", "关键词文本", "keyword text", "keyword",
    ],
    "match_type": [
        "match type", "匹配类型",
    ],
    "search_term": [
        "customer search term", "客户搜索词", "顾客搜索词", "search term", "搜索词",
    ],
    "impressions": [
        "impressions", "曝光量", "展示量",
    ],
    "clicks": [
        "clicks", "点击量", "点击次数",
    ],
    "ctr": [
        "click-thru rate (ctr)", "click-through rate (ctr)", "ctr", "点击率", "click-through rate",
        "click thru rate (ctr)",
    ],
    "cpc": [
        "cost per click (cpc)", "cpc", "cpc (usd)", "每次点击成本", "平均cpc竞价", "average cpc",
    ],
    "spend": [
        "spend", "花费", "支出", "spend (usd)", "spend(usd)",
        "总成本 (usd)", "总成本(usd)", "总成本", "成本 (usd)", "成本",
    ],
    "sales": [
        "7 day total sales", "7 day total sales (usd)", "7天总销售额", "总销售额", "7-day total sales",
        "14 day total sales", "14天总销售额", "sales", "sales (usd)", "销售额", "销售额 (usd)", "销售额(usd)", "ad sales",
    ],
    "acos": [
        "total advertising cost of sales (acos)", "acos", "广告投入产出比", "广告投入产出比 acos",
        "广告投入产出比acos", "total acos",
    ],
    "orders": [
        "7 day total orders (#)", "7 day total orders", "7天总订单", "总订单", "7-day total orders",
        "14 day total orders (#)", "14 day total orders", "orders", "订单", "ad orders",
        "购买量", "订单数", "订单量", "成交量",
    ],
    "cvr": [
        "7 day conversion rate", "7天转化率", "conversion rate", "转化率", "7-day conversion rate",
    ],
}


def _normalize_header(h: str) -> str:
    if h is None:
        return ""
    return re.sub(r"\s+", " ", h.strip().lower())


def _build_header_map(headers: list[str]) -> dict[str, int]:
    """Map canonical name -> column index. Unknown columns ignored."""
    norm_headers = [_normalize_header(h) for h in headers]
    out: dict[str, int] = {}
    for canonical, aliases in COLUMN_ALIASES.items():
        for alias in aliases:
            alias_n = _normalize_header(alias)
            if alias_n in norm_headers:
                out[canonical] = norm_headers.index(alias_n)
                break
    return out


# ---------------------------------------------------------------------------
# Cleaning helpers
# ---------------------------------------------------------------------------
_CURRENCY_RE = re.compile(r"[$€£¥￥,\s]")


def _to_float(x: Any) -> float:
    if x is None:
        return 0.0
    if isinstance(x, (int, float)):
        return float(x)
    s = str(x).strip()
    if not s or s in {"-", "—", "N/A", "n/a"}:
        return 0.0
    is_pct = s.endswith("%")
    s = _CURRENCY_RE.sub("", s).rstrip("%")
    try:
        v = float(s)
        return v / 100.0 if is_pct else v
    except ValueError:
        return 0.0


def _to_int(x: Any) -> int:
    return int(round(_to_float(x)))


def _detect_ad_type(filename: str) -> str:
    name = filename.lower()
    if "sponsored brands" in name or "sponsored-brands" in name or "_sb_" in name or " sb " in name or name.startswith("sb_"):
        return "SB"
    if "sponsored display" in name or "_sd_" in name:
        return "SD"
    return "SP"


def _detect_report_kind(headers: list[str]) -> str:
    """search_term | campaign | targeting | unknown."""
    norm = [_normalize_header(h) for h in headers]
    has_search = any(a in norm for a in COLUMN_ALIASES["search_term"])
    has_target = any(a in norm for a in COLUMN_ALIASES["targeting"])
    if has_search:
        return "search_term"
    if has_target:
        return "targeting"
    return "campaign"


# ---------------------------------------------------------------------------
# Parser
# ---------------------------------------------------------------------------
@dataclass
class Row:
    campaign: str = ""
    ad_group: str = ""
    ad_type: str = "SP"
    targeting: str = ""
    match_type: str = ""
    search_term: str = ""
    impressions: int = 0
    clicks: int = 0
    spend: float = 0.0
    sales: float = 0.0
    orders: int = 0
    source_file: str = ""

    @property
    def keyword(self) -> str:
        # search_term > targeting；空都返回 ""
        return (self.search_term or self.targeting or "").strip()

    @property
    def ctr(self) -> float:
        return (self.clicks / self.impressions) if self.impressions else 0.0

    @property
    def cvr(self) -> float:
        return (self.orders / self.clicks) if self.clicks else 0.0

    @property
    def acos(self) -> float:
        return (self.spend / self.sales) if self.sales else 0.0

    @property
    def cpo(self) -> float:
        return (self.spend / self.orders) if self.orders else 0.0

    @property
    def cpc(self) -> float:
        return (self.spend / self.clicks) if self.clicks else 0.0


def _read_csv(path: Path) -> tuple[list[str], list[list[str]]]:
    """Read CSV with BOM tolerance and quote handling."""
    raw = path.read_bytes()
    # BOM handling
    if raw.startswith(b"\xef\xbb\xbf"):
        raw = raw[3:]
    text = raw.decode("utf-8", errors="replace")
    reader = csv.reader(io.StringIO(text))
    rows = list(reader)
    if not rows:
        raise ValueError(f"CSV {path} is empty")
    return rows[0], rows[1:]


def parse_csv(path: Path) -> tuple[list[Row], dict[str, Any]]:
    headers, body = _read_csv(path)
    hmap = _build_header_map(headers)

    # Some exported search-term reports omit an explicit Campaign column.
    # In that case, fall back to the filename stem so single-campaign CSVs still parse.
    campaign_fallback = path.stem

    ad_type = _detect_ad_type(path.name)
    kind = _detect_report_kind(headers)

    parsed: list[Row] = []
    for raw_row in body:
        if not any(c.strip() for c in raw_row if c is not None):
            continue
        # extend short rows
        while len(raw_row) < len(headers):
            raw_row.append("")

        def get(col: str) -> str:
            idx = hmap.get(col)
            return raw_row[idx] if idx is not None and idx < len(raw_row) else ""

        campaign_value = get("campaign").strip() or campaign_fallback

        r = Row(
            campaign=campaign_value,
            ad_group=get("ad_group").strip(),
            ad_type=ad_type,
            targeting=get("targeting").strip(),
            match_type=get("match_type").strip(),
            search_term=get("search_term").strip(),
            impressions=_to_int(get("impressions")),
            clicks=_to_int(get("clicks")),
            spend=round(_to_float(get("spend")), 4),
            sales=round(_to_float(get("sales")), 4),
            orders=_to_int(get("orders")),
            source_file=path.name,
        )

        # Drop fully empty (no campaign + no spend + no imp)
        if not r.campaign and r.spend == 0 and r.impressions == 0:
            continue
        # Drop "Total" / "总计" footer rows
        if r.campaign.lower() in {"total", "totals", "合计", "总计", "grand total"}:
            continue
        parsed.append(r)

    info = {
        "file": path.name,
        "headers": headers,
        "row_count": len(parsed),
        "ad_type": ad_type,
        "report_kind": kind,
    }
    return parsed, info


# ---------------------------------------------------------------------------
# Aggregation
# ---------------------------------------------------------------------------
def _aggregate(rows: list[Row]) -> dict[str, Any]:
    if not rows:
        return {
            "totals": {"spend": 0, "orders": 0, "clicks": 0, "impressions": 0,
                       "sales": 0, "ctr": 0, "cvr": 0, "acos": 0, "cpo": 0},
            "by_campaign": [],
            "by_keyword": [],
        }

    # Totals
    total_spend = sum(r.spend for r in rows)
    total_orders = sum(r.orders for r in rows)
    total_clicks = sum(r.clicks for r in rows)
    total_imp = sum(r.impressions for r in rows)
    total_sales = sum(r.sales for r in rows)
    totals = {
        "spend": round(total_spend, 2),
        "orders": total_orders,
        "clicks": total_clicks,
        "impressions": total_imp,
        "sales": round(total_sales, 2),
        "ctr": round(total_clicks / total_imp, 4) if total_imp else 0,
        "cvr": round(total_orders / total_clicks, 4) if total_clicks else 0,
        "acos": round(total_spend / total_sales, 4) if total_sales else 0,
        "cpo": round(total_spend / total_orders, 2) if total_orders else 0,
    }

    # By campaign
    camp_buckets: dict[tuple[str, str], dict[str, Any]] = defaultdict(
        lambda: {"spend": 0.0, "orders": 0, "clicks": 0, "impressions": 0, "sales": 0.0}
    )
    for r in rows:
        b = camp_buckets[(r.ad_type, r.campaign or "(未命名)")]
        b["spend"] += r.spend
        b["orders"] += r.orders
        b["clicks"] += r.clicks
        b["impressions"] += r.impressions
        b["sales"] += r.sales

    by_campaign = []
    for (ad_type, name), b in camp_buckets.items():
        sp = b["spend"]
        od = b["orders"]
        cl = b["clicks"]
        im = b["impressions"]
        sa = b["sales"]
        by_campaign.append({
            "campaign": name,
            "ad_type": ad_type,
            "spend": round(sp, 2),
            "orders": od,
            "clicks": cl,
            "impressions": im,
            "sales": round(sa, 2),
            "ctr": round(cl / im, 4) if im else 0,
            "cvr": round(od / cl, 4) if cl else 0,
            "acos": round(sp / sa, 4) if sa else 0,
            "cpo": round(sp / od, 2) if od else 0,
            "spend_share": round(sp / total_spend, 4) if total_spend else 0,
            "order_share": round(od / total_orders, 4) if total_orders else 0,
        })
    by_campaign.sort(key=lambda x: x["spend"], reverse=True)

    # By keyword (rolled up across campaigns; keep campaign list)
    kw_buckets: dict[str, dict[str, Any]] = defaultdict(
        lambda: {"spend": 0.0, "orders": 0, "clicks": 0, "impressions": 0, "sales": 0.0,
                 "campaigns": set(), "match_types": set(), "ad_types": set()}
    )
    for r in rows:
        if not r.keyword:
            continue
        b = kw_buckets[r.keyword.lower()]
        b["keyword_display"] = r.keyword
        b["spend"] += r.spend
        b["orders"] += r.orders
        b["clicks"] += r.clicks
        b["impressions"] += r.impressions
        b["sales"] += r.sales
        b["campaigns"].add(r.campaign)
        if r.match_type:
            b["match_types"].add(r.match_type)
        b["ad_types"].add(r.ad_type)

    by_keyword = []
    for kw_lower, b in kw_buckets.items():
        sp = b["spend"]
        od = b["orders"]
        cl = b["clicks"]
        im = b["impressions"]
        sa = b["sales"]
        by_keyword.append({
            "keyword": b["keyword_display"],
            "campaigns": sorted(b["campaigns"]),
            "match_types": sorted(b["match_types"]),
            "ad_types": sorted(b["ad_types"]),
            "spend": round(sp, 2),
            "orders": od,
            "clicks": cl,
            "impressions": im,
            "sales": round(sa, 2),
            "ctr": round(cl / im, 4) if im else 0,
            "cvr": round(od / cl, 4) if cl else 0,
            "acos": round(sp / sa, 4) if sa else 0,
            "cpo": round(sp / od, 2) if od else 0,
        })
    by_keyword.sort(key=lambda x: x["spend"], reverse=True)

    return {"totals": totals, "by_campaign": by_campaign, "by_keyword": by_keyword}


def _top30_search_terms(rows: list[Row]) -> list[dict[str, Any]]:
    """For LLM context: raw search-term rows ordered by spend desc."""
    rows_sorted = sorted(rows, key=lambda r: r.spend, reverse=True)
    top = []
    for r in rows_sorted[:30]:
        if not r.keyword:
            continue
        top.append({
            "keyword": r.keyword,
            "campaign": r.campaign,
            "match_type": r.match_type,
            "ad_type": r.ad_type,
            "spend": round(r.spend, 2),
            "orders": r.orders,
            "clicks": r.clicks,
            "impressions": r.impressions,
            "ctr": round(r.ctr, 4),
            "cvr": round(r.cvr, 4),
            "acos": round(r.acos, 4),
            "cpo": round(r.cpo, 2),
            "sales": round(r.sales, 2),
            "source_file": r.source_file,
        })
    return top


# ---------------------------------------------------------------------------
# Entry
# ---------------------------------------------------------------------------
def build_aggregated(
    csv_paths: list[Path],
    asin: str,
    marketplace: str,
    start_date: str,
    end_date: str,
) -> dict[str, Any]:
    all_rows: list[Row] = []
    file_infos: list[dict[str, Any]] = []
    for p in csv_paths:
        if not p.exists():
            raise FileNotFoundError(p)
        rows, info = parse_csv(p)
        all_rows.extend(rows)
        file_infos.append(info)

    days = _days_between(start_date, end_date)
    aggregated = _aggregate(all_rows)
    aggregated["meta"] = {
        "asin": asin,
        "marketplace": marketplace,
        "start_date": start_date,
        "end_date": end_date,
        "date_range": _format_date_range(start_date, end_date),
        "days": days,
        "csv_files": file_infos,
    }
    aggregated["top30_search_terms"] = _top30_search_terms(all_rows)
    return aggregated


def _days_between(start: str, end: str) -> int:
    from datetime import date
    s = date.fromisoformat(start)
    e = date.fromisoformat(end)
    return (e - s).days + 1


def _format_date_range(start: str, end: str) -> str:
    """'2026-04-21'/'2026-05-11' -> '4.21 - 5.11' (跨月也只显示月.日)."""
    from datetime import date
    s = date.fromisoformat(start)
    e = date.fromisoformat(end)
    return f"{s.month}.{s.day} - {e.month}.{e.day}"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--csv", nargs="+", required=True, help="CSV report files")
    ap.add_argument("--asin", required=True)
    ap.add_argument("--marketplace", default="US")
    ap.add_argument("--start-date", required=True)
    ap.add_argument("--end-date", required=True)
    ap.add_argument("--out", default="aggregated.json")
    args = ap.parse_args()

    paths = [Path(c) for c in args.csv]
    aggregated = build_aggregated(
        paths, args.asin, args.marketplace, args.start_date, args.end_date,
    )
    Path(args.out).write_text(
        json.dumps(aggregated, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    totals = aggregated["totals"]
    print(f"✓ Wrote {args.out}")
    print(f"  files: {len(paths)} | rows aggregated: {sum(f['row_count'] for f in aggregated['meta']['csv_files'])}")
    print(f"  totals: spend=${totals['spend']} orders={totals['orders']} acos={totals['acos']*100:.1f}%")
    print(f"  campaigns: {len(aggregated['by_campaign'])} | keywords: {len(aggregated['by_keyword'])}")


if __name__ == "__main__":
    sys.exit(main())
