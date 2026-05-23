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

_HISTORY_DB = settings.data_dir / "market_history.sqlite3"
_HISTORY_MAX = 60


def _history_connect() -> sqlite3.Connection:
    conn = sqlite3.connect(str(_HISTORY_DB), isolation_level=None, timeout=10.0)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


def _init_history_db() -> None:
    with _history_connect() as conn:
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
                yield _sse({"type": "error", "detail": chunk})
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
