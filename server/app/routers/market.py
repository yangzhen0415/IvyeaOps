"""Market research router — SSE streaming endpoint + history persistence."""
from __future__ import annotations

import asyncio
import json
import sqlite3
import time
import uuid
from pathlib import Path
from typing import AsyncGenerator, List

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from app.core.config import settings
from app.core.security import require_user
from app.services import sorftime_service, ai_synthesis_service

router = APIRouter()

# ── History DB ────────────────────────────────────────────────────────────────

_HISTORY_MAX = 60
_INITED: set = set()   # db paths whose schema has been ensured


def _history_db_path() -> str:
    from app.core.security import user_data_dir
    return str(user_data_dir() / "market_history.sqlite3")


def _history_connect() -> sqlite3.Connection:
    path = _history_db_path()
    conn = sqlite3.connect(path, isolation_level=None, timeout=10.0)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    if path not in _INITED:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS market_history (
                id          TEXT PRIMARY KEY,
                mode        TEXT NOT NULL,
                query       TEXT NOT NULL,
                marketplace TEXT NOT NULL,
                provider    TEXT NOT NULL DEFAULT '',
                elapsed_s   REAL NOT NULL DEFAULT 0,
                ts          INTEGER NOT NULL,
                report      TEXT NOT NULL DEFAULT ''
            )
        """)
        _INITED.add(path)
    return conn


def _init_history_db() -> None:
    # Initialize the admin (shared) DB at startup; per-user DBs are created
    # lazily on first access via _history_connect().
    _history_connect().close()


class HistoryEntryIn(BaseModel):
    id: str = ""
    mode: str
    query: str
    marketplace: str
    provider: str = ""
    elapsed_s: float = 0.0
    ts: int
    report: str = ""


@router.get("/history")
def get_history(_user: str = Depends(require_user)) -> List[dict]:
    with _history_connect() as conn:
        rows = conn.execute(
            "SELECT id,mode,query,marketplace,provider,elapsed_s,ts,report "
            "FROM market_history ORDER BY ts DESC LIMIT ?",
            (_HISTORY_MAX,),
        ).fetchall()
    return [dict(r) for r in rows]


@router.post("/history")
def add_history(entry: HistoryEntryIn, _user: str = Depends(require_user)) -> dict:
    entry_id = entry.id or str(int(entry.ts)) or uuid.uuid4().hex
    with _history_connect() as conn:
        conn.execute(
            "INSERT OR REPLACE INTO market_history "
            "(id,mode,query,marketplace,provider,elapsed_s,ts,report) "
            "VALUES (?,?,?,?,?,?,?,?)",
            (entry_id, entry.mode, entry.query, entry.marketplace,
             entry.provider, entry.elapsed_s, entry.ts, entry.report),
        )
        # Trim to max entries (keep most recent)
        conn.execute(
            "DELETE FROM market_history WHERE id NOT IN "
            "(SELECT id FROM market_history ORDER BY ts DESC LIMIT ?)",
            (_HISTORY_MAX,),
        )
    return {"id": entry_id}


@router.delete("/history/{entry_id}")
def delete_history_entry(entry_id: str, _user: str = Depends(require_user)) -> dict:
    with _history_connect() as conn:
        conn.execute("DELETE FROM market_history WHERE id=?", (entry_id,))
    return {"ok": True}


@router.delete("/history")
def clear_history(_user: str = Depends(require_user)) -> dict:
    with _history_connect() as conn:
        conn.execute("DELETE FROM market_history")
    return {"ok": True}


class ResearchReq(BaseModel):
    mode: str = "keyword"       # "keyword" | "asin"
    query: str
    marketplace: str = "US"


def _sse(event: dict) -> str:
    return f"data: {json.dumps(event, ensure_ascii=False)}\n\n"


def _compact_preview(value, limit: int = 700) -> str:
    try:
        text = json.dumps(value, ensure_ascii=False, indent=2)
    except Exception:
        text = str(value)
    text = text.strip()
    if len(text) <= limit:
        return text
    return text[:limit].rstrip() + "\n..."


def _count_items(value) -> int:
    if isinstance(value, list):
        return len(value)
    if isinstance(value, dict):
        for key in ("data", "items", "results", "list", "records", "rows"):
            items = value.get(key)
            if isinstance(items, list):
                return len(items)
    return 0


def _local_report(mode: str, query: str, marketplace: str, data: dict, errors: list[str]) -> str:
    """Deterministic report used when live data exists but no text AI is configured.

    This keeps the market workbench testable after Sorftime succeeds, while still
    making it clear that strategic prose needs a configured LLM provider.
    """
    title = "关键词" if mode == "keyword" else "ASIN"
    ok_tools = list(data.keys())
    lines: list[str] = [
        f"# 《{query}》市场调研报告（Amazon {marketplace}）",
        "",
        "> 当前未配置可用文本 AI，系统已切换为本地结构化报告模式。以下内容基于已采集到的 Sorftime 数据自动整理，可用于测试工作台流程、历史记录和导出。",
        "",
        "## 执行状态",
        "",
        f"- 分析对象：{title} `{query}`",
        f"- 数据源：Sorftime",
        f"- 成功采集：{len(ok_tools)} 个模块" + (f"（{', '.join(ok_tools)}）" if ok_tools else ""),
        f"- 失败/缺失：{len(errors)} 项",
    ]
    if errors:
        lines.extend(["", "### 采集提醒", ""])
        lines.extend(f"- {err}" for err in errors[:12])

    lines.extend(["", "## 数据模块概览", ""])
    if not data:
        lines.extend([
            "没有拿到可用的 Sorftime 数据。请检查 `系统配置 -> 数据源` 中的 Sorftime Key 是否有效，或该 key 是否拥有对应工具权限。",
            "",
            "页面本身已可运行；当前阻塞点是上游数据或 AI provider 配置。",
        ])
        return "\n".join(lines)

    lines.extend([
        "| 模块 | 记录数/结构 | 用途 |",
        "|---|---:|---|",
    ])
    usage = {
        "keyword_detail": "关键词搜索量、CPC、转化率等核心指标",
        "keyword_trend": "季节性与趋势判断",
        "keyword_extends": "长尾词机会池",
        "keyword_search_results": "首页竞品与坑位格局",
        "category_search_from_product_name": "类目节点识别",
        "similar_product_feature": "共性卖点和差异点",
        "potential_product": "潜力产品参考",
        "category_report": "类目容量与价格带",
        "product_detail_list": "头部竞品详情",
        "product_report": "ASIN 基础经营画像",
        "product_trend": "销量/价格趋势",
        "product_traffic_terms": "主要流量词",
        "product_reviews": "评论痛点",
        "product_variations": "变体结构",
        "competitor_product_keywords": "竞品关键词机会",
    }
    for key, value in data.items():
        count = _count_items(value)
        shape = f"{count} 条" if count else type(value).__name__
        lines.append(f"| `{key}` | {shape} | {usage.get(key, '原始数据模块')} |")

    lines.extend([
        "",
        "## 初步判断",
        "",
        "- 若 `keyword_detail` 可用，优先看搜索量、CPC、CVR 和竞争品数量，判断该词是否值得进入。",
        "- 若 `keyword_search_results` 或 `category_report` 可用，优先比较首页价格带、评论门槛、评分和头部集中度。",
        "- 若 `keyword_extends` 可用，把长尾词按搜索量、CPC、竞争强度拆成主攻词、测试词和否定观察词。",
        "- 若 `product_reviews` 或 `similar_product_feature` 可用，把高频差评转成 Listing、图片和产品差异化动作。",
        "",
        "## 下一步动作",
        "",
        "1. 在 `系统配置 -> AI 服务/全局兜底大模型` 配置一个文本模型后重新生成，可得到完整策略报告。",
        "2. 继续用当前报告测试历史记录、导出、页面交互和数据源链路。",
        "3. 如果采集提醒里出现 Authentication required，说明 Sorftime key 或该工具权限仍需在 Sorftime 后台确认。",
        "",
        "## 原始数据预览",
        "",
    ])
    for key, value in data.items():
        lines.extend([f"### {key}", "", "```json", _compact_preview(value), "```", ""])
    return "\n".join(lines).strip()


# SSE comment line; clients ignore it but it keeps proxy/browser idle
# timers from killing the connection while we wait on slow CLI runners.
_SSE_HEARTBEAT = ":hb\n\n"
_HEARTBEAT_INTERVAL_S = 10.0


async def _stream_synthesis(
    gen_factory,
    heartbeat_interval: float = _HEARTBEAT_INTERVAL_S,
) -> AsyncGenerator[tuple[str, str, str], None]:
    """Drive an async synthesis generator via a queue, interleaving SSE
    heartbeats.  Yields (kind, a, b) tuples where kind is 'chunk' or 'exc';
    the sentinel is signalled by StopAsyncIteration on the outer loop."""
    out_q: asyncio.Queue = asyncio.Queue()
    _SENTINEL = object()

    async def _producer() -> None:
        try:
            async for prov, chunk in gen_factory():
                await out_q.put(("chunk", prov, chunk))
        except Exception as exc:
            await out_q.put(("exc", exc, None))
        finally:
            await out_q.put((_SENTINEL, None, None))

    task = asyncio.create_task(_producer())
    try:
        while True:
            try:
                item = await asyncio.wait_for(out_q.get(), timeout=heartbeat_interval)
            except asyncio.TimeoutError:
                yield ("hb", None, None)
                continue
            kind, a, b = item
            if kind is _SENTINEL:
                return
            yield (kind, a, b)
    finally:
        if not task.done():
            task.cancel()
            try:
                await task
            except (asyncio.CancelledError, Exception):
                pass


async def _run_research(req: ResearchReq) -> AsyncGenerator[str, None]:
    start = time.time()
    chain = ai_synthesis_service._text_provider_chain()
    hermes_first = bool(chain) and chain[0] == "hermes"

    # ── Path A: hermes-native ─────────────────────────────────────────────────
    # hermes has sorftime MCP configured; give it tool-calling instructions so
    # it collects and synthesises in one pass — no sorftime pre-fetch needed.
    if hermes_first:
        yield _sse({"type": "phase", "phase": "synthesizing"})
        provider = "unknown"
        hermes_ok = False
        async for kind, a, b in _stream_synthesis(
            lambda: ai_synthesis_service.synthesize_native(req.mode, req.query, req.marketplace)
        ):
            if kind == "hb":
                yield _SSE_HEARTBEAT
            elif kind == "exc":
                yield _sse({"type": "error", "detail": f"AI 合成失败: {a}"})
                return
            else:
                prov, chunk = a, b
                if prov == "_attempt":
                    yield _sse({"type": "attempt", "provider": chunk})
                elif prov == "error":
                    # hermes failed — fall through to Path B below
                    break
                else:
                    provider = prov
                    hermes_ok = True
                    yield _sse({"type": "token", "text": chunk, "provider": prov})
        if hermes_ok:
            elapsed = round(time.time() - start, 1)
            yield _sse({"type": "done", "provider": provider, "elapsed_s": elapsed})
            return
        # hermes failed → fall back to Path B (sorftime pre-fetch + other providers)
        yield _sse({"type": "warn", "detail": "hermes 原生调用失败，回退到数据预采集模式"})

    # ── Path B: pre-fetch sorftime data, then synthesise ─────────────────────
    progress_queue: asyncio.Queue = asyncio.Queue()

    async def on_progress(step: str, done: int, total: int) -> None:
        await progress_queue.put({"type": "progress", "step": step, "done": done, "total": total})

    async def drain_progress() -> None:
        while not progress_queue.empty():
            evt = progress_queue.get_nowait()
            yield _sse(evt)

    yield _sse({"type": "phase", "phase": "collecting"})

    if req.mode == "keyword":
        pipeline_task = asyncio.create_task(
            sorftime_service.keyword_pipeline(req.query, req.marketplace, on_progress)
        )
    else:
        pipeline_task = asyncio.create_task(
            sorftime_service.asin_pipeline(req.query, req.marketplace, on_progress)
        )

    last_yield = time.time()
    while not pipeline_task.done():
        await asyncio.sleep(0.2)
        emitted = False
        async for chunk in drain_progress():
            yield chunk
            emitted = True
            last_yield = time.time()
        if not emitted and (time.time() - last_yield) >= _HEARTBEAT_INTERVAL_S:
            yield _SSE_HEARTBEAT
            last_yield = time.time()

    async for chunk in drain_progress():
        yield chunk

    try:
        data, pipe_errors = pipeline_task.result()
    except Exception as exc:
        yield _sse({"type": "error", "detail": f"数据采集失败: {exc}"})
        return

    for err in pipe_errors:
        yield _sse({"type": "warn", "detail": err})

    yield _sse({"type": "phase", "phase": "synthesizing"})

    # Determine provider chain for Path B: skip hermes (already failed in
    # Path A native mode, or hermes wasn't first so skip it here too since
    # it would just receive a 40KB dump without MCP benefit).
    provider = "unknown"
    async for kind, a, b in _stream_synthesis(
        lambda: ai_synthesis_service.synthesize(req.mode, req.query, req.marketplace, data)
    ):
        if kind == "hb":
            yield _SSE_HEARTBEAT
        elif kind == "exc":
            yield _sse({"type": "error", "detail": f"AI 合成失败: {a}"})
            return
        else:
            prov, chunk = a, b
            if prov == "_attempt":
                yield _sse({"type": "attempt", "provider": chunk})
                continue
            provider = prov
            if prov == "error":
                yield _sse({"type": "warn", "detail": "AI 合成不可用，已切换为本地结构化报告"})
                report = _local_report(req.mode, req.query, req.marketplace, data, pipe_errors)
                yield _sse({"type": "token", "text": report, "provider": "local-report"})
                elapsed = round(time.time() - start, 1)
                yield _sse({"type": "done", "provider": "local-report", "elapsed_s": elapsed})
                return
            yield _sse({"type": "token", "text": chunk, "provider": prov})

    elapsed = round(time.time() - start, 1)
    yield _sse({"type": "done", "provider": provider, "elapsed_s": elapsed})


@router.post("/research")
async def market_research(
    req: ResearchReq,
    _user: str = Depends(require_user),
) -> StreamingResponse:
    if not req.query.strip():
        from fastapi import HTTPException
        raise HTTPException(400, "query cannot be empty")
    if req.mode not in ("keyword", "asin"):
        from fastapi import HTTPException
        raise HTTPException(400, "mode must be keyword or asin")

    async def generator():
        async for chunk in _run_research(req):
            yield chunk

    return StreamingResponse(
        generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


@router.post("/research-sync")
async def market_research_sync(
    req: ResearchReq,
    _user: str = Depends(require_user),
) -> dict:
    """Non-streaming research endpoint for reverse proxies that buffer/cancel SSE.

    Netlify + temporary tunnel deployments are useful for quick previews, but
    they are not reliable for long-lived SSE responses. This endpoint keeps the
    same data path and returns one JSON payload at the end.
    """
    if not req.query.strip():
        raise HTTPException(400, "query cannot be empty")
    if req.mode not in ("keyword", "asin"):
        raise HTTPException(400, "mode must be keyword or asin")

    start = time.time()
    errors: list[str] = []
    if req.mode == "keyword":
        data, errors = await sorftime_service.keyword_pipeline(req.query, req.marketplace)
    else:
        data, errors = await sorftime_service.asin_pipeline(req.query, req.marketplace)

    report = _local_report(req.mode, req.query, req.marketplace, data, errors)
    return {
        "provider": "local-report",
        "elapsed_s": round(time.time() - start, 1),
        "report": report,
        "warnings": errors,
    }


# ── Pulse endpoint (lightweight: keyword_detail + keyword_trend only) ─────────

class PulseReq(BaseModel):
    keyword: str
    marketplace: str = "US"


@router.post("/pulse")
async def market_pulse(req: PulseReq, _user: str = Depends(require_user)) -> dict:
    """Fetch keyword_detail + keyword_trend for a single keyword.
    Returns a flat dict with the key metrics — fast (~2-4s, 2 concurrent calls).
    """
    if not req.keyword.strip():
        raise HTTPException(400, "keyword cannot be empty")

    from app.services.sorftime_service import _make_client, _safe_call
    import asyncio

    async with _make_client() as client:
        detail_task = _safe_call(
            client, "keyword_detail",
            {"keyword": req.keyword, "keywordSupportSite": req.marketplace}, 1,
        )
        trend_task = _safe_call(
            client, "keyword_trend",
            {"keyword": req.keyword, "keywordSupportSite": req.marketplace}, 2,
        )
        (_, detail, detail_err), (_, trend, trend_err) = await asyncio.gather(
            detail_task, trend_task
        )

    return {
        "keyword": req.keyword,
        "marketplace": req.marketplace,
        "detail": detail,
        "detail_error": detail_err,
        "trend": trend,
        "trend_error": trend_err,
    }
