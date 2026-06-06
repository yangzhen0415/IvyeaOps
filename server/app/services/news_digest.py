"""On-demand Amazon + AI news digest generator.

Open-source replacement for the old Hermes ``ai-amazon-daily-digest`` cron: it
fetches a (configurable) set of RSS feeds, then uses the standard AI fallback
chain (Hermes → 全局兜底 → Codex → Claude) to summarise / classify / translate
each item into the NewsItem schema, stored as ``news/YYYY-MM-DD.json``.

No external project or cron required — works out of the box; users can override
the feed list via the ``news_feeds`` setting (one ``url|source|category`` per line).
"""
from __future__ import annotations

import asyncio
import json
import re
from datetime import datetime
from pathlib import Path
from typing import Any, Optional

import feedparser

from app.core import hub_settings
from app.core.config import settings

_NEWS_DIR = settings.data_dir / "news"

# (rss_url, source_label, category)  — category ∈ {ai_industry, amazon_seller}
_DEFAULT_FEEDS: list[tuple[str, str, str]] = [
    ("https://openai.com/blog/rss.xml",                                  "OpenAI",            "ai_industry"),
    ("https://www.anthropic.com/rss.xml",                                "Anthropic",         "ai_industry"),
    ("https://venturebeat.com/category/ai/feed/",                        "VentureBeat AI",    "ai_industry"),
    ("https://techcrunch.com/category/artificial-intelligence/feed/",    "TechCrunch AI",     "ai_industry"),
    ("https://www.theverge.com/rss/ai-artificial-intelligence/index.xml", "The Verge AI",     "ai_industry"),
    ("https://www.ecommercebytes.com/feed/",                             "EcommerceBytes",    "amazon_seller"),
    ("https://www.marketplacepulse.com/rss",                             "Marketplace Pulse", "amazon_seller"),
    ("https://www.junglescout.com/blog/feed/",                           "Jungle Scout",      "amazon_seller"),
]

# Source labels that count as 大厂官方 (pinned section) even without AI judgement.
_OFFICIAL_HINTS = ("openai", "anthropic", "amazon", "google", "meta", "microsoft", "aws")

# Module state for the single background generation.
_state: dict[str, Any] = {"generating": False, "last_error": ""}
_bg_task: Optional["asyncio.Task[Any]"] = None


def _news_dir() -> Path:
    _NEWS_DIR.mkdir(parents=True, exist_ok=True)
    return _NEWS_DIR


def _feeds() -> list[tuple[str, str, str]]:
    """Configured feeds (``news_feeds`` setting) or the curated defaults.

    User format, one per line: ``url | source | category`` (category optional)."""
    raw = str(hub_settings.get("news_feeds") or "").strip()
    if not raw:
        return _DEFAULT_FEEDS
    out: list[tuple[str, str, str]] = []
    for line in raw.splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        parts = [p.strip() for p in line.split("|")]
        url = parts[0]
        src = parts[1] if len(parts) > 1 and parts[1] else url
        cat = parts[2] if len(parts) > 2 and parts[2] in ("ai_industry", "amazon_seller") else "ai_industry"
        if url:
            out.append((url, src, cat))
    return out or _DEFAULT_FEEDS


def _fetch_raw_items(max_per_feed: int = 8) -> list[dict[str, Any]]:
    """Blocking RSS fetch (run via asyncio.to_thread). Best-effort per feed."""
    items: list[dict[str, Any]] = []
    for url, src, cat in _feeds():
        try:
            parsed = feedparser.parse(url)
        except Exception:
            continue
        for e in (getattr(parsed, "entries", None) or [])[:max_per_feed]:
            title = (getattr(e, "title", "") or "").strip()
            link = (getattr(e, "link", "") or "").strip()
            if not title or not link:
                continue
            summary = re.sub(r"<[^>]+>", "", getattr(e, "summary", "") or "")[:500].strip()
            published = getattr(e, "published", "") or getattr(e, "updated", "")
            items.append({
                "title": title, "url": link, "source": src, "category": cat,
                "raw_summary": summary, "published_at": str(published)[:40],
            })
    return items


def _build_prompt(items: list[dict[str, Any]]) -> str:
    compact = [
        {"i": idx, "title": it["title"], "source": it["source"],
         "category": it["category"], "summary": it["raw_summary"]}
        for idx, it in enumerate(items)
    ]
    return (
        "你是亚马逊跨境电商 + AI 行业的资讯主编。下面是今天抓取的若干条英文资讯"
        "（含序号 i / 标题 / 来源 / 分类 / 摘要）。请为每一条生成中文要点，输出一个 JSON 数组，"
        "每个元素形如：\n"
        '{"i": 序号, "summary_zh": "40-80字客观中文摘要", '
        '"importance": 0到5的整数（对亚马逊卖家或AI从业者的重要度）, '
        '"is_official": true/false（是否OpenAI/Anthropic/Amazon/Google/Meta/Microsoft等大厂官方消息）, '
        '"tags": ["中文标签1","中文标签2"]}\n'
        "要求：只输出 JSON 数组，不要任何解释或代码块标记；保持 i 与输入一致；"
        "不确定 importance 时给 3。\n\n输入：\n"
        + json.dumps(compact, ensure_ascii=False)
    )


def _extract_json_array(text: str) -> Optional[list]:
    t = (text or "").strip()
    t = re.sub(r"^```(?:json)?", "", t).strip()
    t = re.sub(r"```$", "", t).strip()
    start, end = t.find("["), t.rfind("]")
    if start >= 0 and end > start:
        try:
            v = json.loads(t[start:end + 1])
            return v if isinstance(v, list) else None
        except Exception:
            return None
    return None


def _is_official(source: str, ai_flag: Any) -> bool:
    if isinstance(ai_flag, bool):
        return ai_flag
    s = (source or "").lower()
    return any(h in s for h in _OFFICIAL_HINTS)


def _stats(items: list[dict[str, Any]]) -> dict[str, int]:
    return {
        "total": len(items),
        "ai_industry": sum(1 for i in items if i.get("category") == "ai_industry"),
        "amazon_seller": sum(1 for i in items if i.get("category") == "amazon_seller"),
        "official": sum(1 for i in items if i.get("is_official")),
    }


async def generate_digest(target_date: Optional[str] = None) -> dict[str, Any]:
    """Fetch feeds, synthesise via the standard chain, and write the day file."""
    from app.services import ai_synthesis_service

    d = target_date or datetime.now().strftime("%Y-%m-%d")
    raw = await asyncio.to_thread(_fetch_raw_items)

    # De-dup by URL, cap the batch sent to the model.
    seen: set[str] = set()
    inputs: list[dict[str, Any]] = []
    for it in raw:
        if it["url"] in seen:
            continue
        seen.add(it["url"])
        inputs.append(it)
    inputs = inputs[:25]

    out_items: list[dict[str, Any]] = []
    note: Optional[str] = None

    if not inputs:
        note = "未抓取到任何资讯——请检查服务器网络是否能访问 RSS 源，或在「系统配置」用 news_feeds 自定义可用的 RSS。"
    else:
        enriched: Optional[list] = None
        try:
            _prov, text = await ai_synthesis_service.run_text_chain(_build_prompt(inputs))
            enriched = _extract_json_array(text)
        except Exception as e:  # noqa: BLE001
            note = f"AI 汇总失败（{e}），已展示原始资讯标题。可在「系统配置 → 全局兜底大模型」配置一个可用模型后重试。"

        by_idx = {int(x["i"]): x for x in (enriched or []) if isinstance(x, dict) and "i" in x}
        for idx, it in enumerate(inputs):
            ai = by_idx.get(idx, {})
            summary_zh = str(ai.get("summary_zh") or "").strip() or it["raw_summary"] or it["title"]
            try:
                importance = int(ai.get("importance", 3))
            except (TypeError, ValueError):
                importance = 3
            importance = max(0, min(5, importance))
            tags = [str(t).strip() for t in (ai.get("tags") or []) if str(t).strip()][:3]
            out_items.append({
                "title": it["title"], "source": it["source"], "url": it["url"],
                "summary_zh": summary_zh, "category": it["category"],
                "importance": importance, "is_official": _is_official(it["source"], ai.get("is_official")),
                "published_at": it["published_at"], "tags": tags,
            })

    day = {
        "date": d,
        "generated_at": datetime.now().isoformat(timespec="seconds"),
        "items": out_items,
        "stats": _stats(out_items),
        "notes": note,
    }
    (_news_dir() / f"{d}.json").write_text(json.dumps(day, ensure_ascii=False, indent=2), encoding="utf-8")
    return day


def is_generating() -> bool:
    return bool(_state["generating"])


def start_generation() -> str:
    """Kick off a single background digest generation. Returns a status message."""
    global _bg_task
    if _state["generating"]:
        return "正在生成今日资讯，请稍候 1-2 分钟后刷新查看…"

    async def _run() -> None:
        _state["generating"] = True
        _state["last_error"] = ""
        try:
            await generate_digest()
        except Exception as e:  # noqa: BLE001
            _state["last_error"] = str(e)
        finally:
            _state["generating"] = False

    _bg_task = asyncio.create_task(_run())
    return "已开始生成今日资讯（抓取 RSS + AI 汇总），约 1-2 分钟后刷新查看"
