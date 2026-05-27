"""Lightweight single-ASIN pulse for the home monitoring dashboard.

Uses Sorftime's ``product_detail`` tool, which returns a plain-text
``字段：值`` block (NOT JSON, and NOT ``product_report`` — that one returns LLM
orchestration instructions). Field labels are Chinese; mappings below were
calibrated against live responses. ``product_variations`` (a list of text
lines) is fetched concurrently just for the variant count.
"""
from __future__ import annotations

import asyncio
import re
from typing import Any, Dict, List, Optional

from app.services.sorftime_service import _make_client, _safe_call

_NOT_FOUND = ("未查询到", "请检查")


def _parse_kv(text: str) -> Dict[str, str]:
    """Parse 'label：value' lines (full-width colon) into a dict."""
    kv: Dict[str, str] = {}
    for line in text.splitlines():
        line = line.strip()
        if "：" in line:
            k, v = line.split("：", 1)
            k = k.strip()
            if k and k not in kv:
                kv[k] = v.strip()
    return kv


def _num(s: Any) -> Optional[float]:
    """First numeric token in a value (handles '月销量：29746', '22.48', etc.)."""
    if s is None:
        return None
    if isinstance(s, (int, float)):
        return float(s)
    m = re.search(r"-?\d+\.?\d*", str(s).replace(",", ""))
    return float(m.group()) if m else None


def _rank(s: Any) -> Optional[float]:
    """Pull a rank number out of e.g. '所属大类：Sports & Outdoors（排名:23）'."""
    if not s:
        return None
    m = re.search(r"排名[:：]?\s*(\d+)", str(s))
    return float(m.group(1)) if m else None


def _cat_name(s: Any) -> Optional[str]:
    """Category name before the rank: 'Sports & Outdoors（排名:23）' -> 'Sports & Outdoors'."""
    if not s:
        return None
    name = re.split(r"[（(]", str(s))[0].strip()
    return name or None


def _normalize(detail: Any, variations: Any) -> Dict[str, Any]:
    if not isinstance(detail, str):
        return {"_not_found": False, "_unparsed": True}
    if any(tok in detail for tok in _NOT_FOUND) and "标题" not in detail:
        return {"_not_found": True}

    kv = _parse_kv(detail)

    var_count: Optional[int] = None
    sub = _num(kv.get("子体数"))
    if sub is not None:
        var_count = int(sub)
    elif isinstance(variations, list) and variations:
        var_count = len(variations)

    return {
        "title": kv.get("标题"),
        "brand": kv.get("品牌"),
        "image": kv.get("主图"),
        "price": _num(kv.get("价格")),
        # BSR = the main-category (大类) Best Sellers Rank shown on Amazon's page,
        # NOT the much-smaller subcategory rank. Subcategory kept separately.
        "bsr": _rank(kv.get("所属大类")) or _rank(kv.get("所属细分类目")),
        "bsr_category": _cat_name(kv.get("所属大类")),
        "sub_rank": _rank(kv.get("所属细分类目")),
        "sub_category": _cat_name(kv.get("所属细分类目")),
        "est_sales": _num(kv.get("月销量")),
        "rating": _num(kv.get("星级")),
        "review_count": _num(kv.get("评论数")),
        "variations": var_count,
        # Sorftime product_detail does not expose these — left N/A.
        "coupon": None,
        "deal": None,
        "inventory": None,
    }


async def fetch_asin_pulse(asin: str, marketplace: str) -> Dict[str, Any]:
    """Fetch + normalize one ASIN. ``error`` is set (and metric fields None)
    when product_detail failed or the ASIN isn't in Sorftime's library."""
    async with _make_client() as client:
        detail_task = _safe_call(client, "product_detail", {"asin": asin, "amzSite": marketplace}, 1)
        var_task = _safe_call(client, "product_variations", {"asin": asin, "amzSite": marketplace}, 2)
        (_, detail, detail_err), (_, variations, _var_err) = await asyncio.gather(detail_task, var_task)

    empty = {k: None for k in
             ("title", "brand", "image", "price", "bsr", "bsr_category",
              "sub_rank", "sub_category", "est_sales",
              "rating", "review_count", "variations", "coupon", "deal", "inventory")}

    if detail_err:
        return {"asin": asin, "marketplace": marketplace, "error": detail_err, **empty, "raw_report": detail}

    norm = _normalize(detail, variations)
    if norm.get("_not_found"):
        return {"asin": asin, "marketplace": marketplace,
                "error": "未查询到该 ASIN（可能不在 Sorftime 库中）", **empty, "raw_report": detail}
    if norm.get("_unparsed"):
        return {"asin": asin, "marketplace": marketplace,
                "error": "product_detail 返回格式异常", **empty, "raw_report": detail}

    return {
        "asin": asin, "marketplace": marketplace, "error": None,
        **{k: norm.get(k) for k in empty},
        "raw_report": detail,
    }


SNAPSHOT_METRICS: List[str] = [
    "price", "bsr", "est_sales", "rating", "review_count", "inventory",
]

# Full set persisted per snapshot so a cached card can render fully (title /
# image / category) without a fresh Sorftime call. Numeric deltas still use
# SNAPSHOT_METRICS only.
SNAPSHOT_FIELDS: List[str] = SNAPSHOT_METRICS + [
    "title", "brand", "image", "bsr_category", "sub_rank", "sub_category",
    "variations", "coupon", "deal",
]


def snapshot_payload(pulse: Dict[str, Any]) -> Dict[str, Any]:
    """Subset of a pulse result stored as a snapshot (renderable + metrics)."""
    return {k: pulse.get(k) for k in SNAPSHOT_FIELDS}
