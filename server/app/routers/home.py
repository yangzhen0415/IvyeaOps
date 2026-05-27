"""Home dashboard router — competitor / own-ASIN watchlist + snapshots + alerts.

Live version: each ``/pulse`` fetches the ASIN now, stores a snapshot, and
returns the change vs the previous stored snapshot. The watchlist and snapshot
tables live server-side specifically so a future scheduled poller can reuse
them (read the watchlist, write snapshots) with zero client changes.
"""
from __future__ import annotations

import asyncio
import json
import math
import sqlite3
import time
from datetime import datetime
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.core.config import settings
from app.core.security import require_user
from app.services import asin_pulse_service, category_service, market_traffic_service
from app.services.asin_pulse_service import SNAPSHOT_METRICS

router = APIRouter()

_SNAPSHOT_MAX_PER_ASIN = 200
_INITED: set = set()


def _db_path() -> str:
    from app.core.security import user_data_dir
    return str(user_data_dir() / "home_monitor.sqlite3")


def _connect() -> sqlite3.Connection:
    path = _db_path()
    conn = sqlite3.connect(path, isolation_level=None, timeout=10.0)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    if path not in _INITED:
        _ensure_schema(conn)
        _INITED.add(path)
    return conn


def _init_db() -> None:
    # Initialize the admin (shared) DB at startup; per-user DBs are created
    # lazily on first connect.
    _connect().close()


def _ensure_schema(conn: sqlite3.Connection) -> None:
    if True:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS home_watch (
                id          TEXT PRIMARY KEY,
                asin        TEXT NOT NULL,
                marketplace TEXT NOT NULL,
                kind        TEXT NOT NULL DEFAULT 'competitor',
                label       TEXT NOT NULL DEFAULT '',
                ts          INTEGER NOT NULL
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS home_snapshot (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                asin        TEXT NOT NULL,
                marketplace TEXT NOT NULL,
                ts          INTEGER NOT NULL,
                metrics     TEXT NOT NULL DEFAULT '{}'
            )
        """)
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_snapshot_asin "
            "ON home_snapshot(asin, marketplace, ts DESC)"
        )
        conn.execute("""
            CREATE TABLE IF NOT EXISTS home_category_snapshot (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                node_id     TEXT NOT NULL,
                marketplace TEXT NOT NULL,
                ts          INTEGER NOT NULL,
                ranks       TEXT NOT NULL DEFAULT '{}'
            )
        """)
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_cat_snapshot "
            "ON home_category_snapshot(node_id, marketplace, ts DESC)"
        )
        conn.execute("""
            CREATE TABLE IF NOT EXISTS home_market_watch (
                id          TEXT PRIMARY KEY,
                query       TEXT NOT NULL,
                marketplace TEXT NOT NULL,
                label       TEXT NOT NULL DEFAULT '',
                ts          INTEGER NOT NULL
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS home_market_snapshot (
                query_key     TEXT NOT NULL,
                marketplace   TEXT NOT NULL,
                day           TEXT NOT NULL,
                ts            INTEGER NOT NULL,
                search_volume REAL,
                total_sales   REAL,
                avg_price     REAL,
                PRIMARY KEY (query_key, marketplace, day)
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS home_category_result (
                query_key   TEXT NOT NULL,
                marketplace TEXT NOT NULL,
                ts          INTEGER NOT NULL,
                data        TEXT NOT NULL DEFAULT '',
                PRIMARY KEY (query_key, marketplace)
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS home_market_node (
                mid           TEXT PRIMARY KEY,
                node_id       TEXT NOT NULL,
                category_name TEXT NOT NULL DEFAULT '',
                ts            INTEGER NOT NULL
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS home_keyword (
                id          TEXT PRIMARY KEY,
                keyword     TEXT NOT NULL,
                marketplace TEXT NOT NULL,
                label       TEXT NOT NULL DEFAULT '',
                ts          INTEGER NOT NULL,
                data        TEXT NOT NULL DEFAULT '',
                data_ts     INTEGER
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS home_keyword_extends (
                id          TEXT PRIMARY KEY,
                keyword     TEXT NOT NULL,
                marketplace TEXT NOT NULL,
                ts          INTEGER NOT NULL,
                data        TEXT NOT NULL DEFAULT '[]'
            )
        """)


def _today_key() -> str:
    return datetime.now().strftime("%Y-%m-%d")


def _day_of(ts_ms: int) -> str:
    return datetime.fromtimestamp(ts_ms / 1000).strftime("%Y-%m-%d")


# ── Watchlist CRUD ────────────────────────────────────────────────────────────

class WatchIn(BaseModel):
    asin: str
    marketplace: str = "US"
    kind: str = "competitor"          # "competitor" | "own"
    label: str = ""


@router.get("/watch")
def list_watch(_user: str = Depends(require_user)) -> List[dict]:
    with _connect() as conn:
        rows = conn.execute(
            "SELECT id,asin,marketplace,kind,label,ts FROM home_watch ORDER BY ts ASC"
        ).fetchall()
    return [dict(r) for r in rows]


@router.post("/watch")
def add_watch(item: WatchIn, _user: str = Depends(require_user)) -> dict:
    asin = item.asin.strip().upper()
    if not asin:
        raise HTTPException(400, "asin cannot be empty")
    if item.kind not in ("competitor", "own"):
        raise HTTPException(400, "kind must be competitor or own")
    wid = f"{item.kind}:{item.marketplace}:{asin}"
    with _connect() as conn:
        conn.execute(
            "INSERT OR REPLACE INTO home_watch (id,asin,marketplace,kind,label,ts) "
            "VALUES (?,?,?,?,?,?)",
            (wid, asin, item.marketplace, item.kind, item.label.strip(), int(time.time() * 1000)),
        )
    return {"id": wid}


@router.delete("/watch/{wid}")
def delete_watch(wid: str, _user: str = Depends(require_user)) -> dict:
    with _connect() as conn:
        conn.execute("DELETE FROM home_watch WHERE id=?", (wid,))
    return {"ok": True}


# ── Snapshots + delta ─────────────────────────────────────────────────────────

def _latest_metrics(conn: sqlite3.Connection, asin: str, marketplace: str) -> Optional[Dict[str, Any]]:
    row = conn.execute(
        "SELECT metrics FROM home_snapshot WHERE asin=? AND marketplace=? ORDER BY ts DESC LIMIT 1",
        (asin, marketplace),
    ).fetchone()
    if not row:
        return None
    try:
        return json.loads(row["metrics"])
    except Exception:
        return None


def _compute_delta(curr: Dict[str, Any], prev: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    """Per-metric numeric delta (curr - prev). Missing/None on either side → None."""
    out: Dict[str, Any] = {}
    if not prev:
        return out
    for m in SNAPSHOT_METRICS:
        c, p = curr.get(m), prev.get(m)
        if isinstance(c, (int, float)) and isinstance(p, (int, float)):
            out[m] = round(c - p, 4)
    return out


def _trim_snapshots(conn: sqlite3.Connection, asin: str, marketplace: str) -> None:
    conn.execute(
        "DELETE FROM home_snapshot WHERE asin=? AND marketplace=? AND id NOT IN "
        "(SELECT id FROM home_snapshot WHERE asin=? AND marketplace=? ORDER BY ts DESC LIMIT ?)",
        (asin, marketplace, asin, marketplace, _SNAPSHOT_MAX_PER_ASIN),
    )


class PulseReq(BaseModel):
    asin: str
    marketplace: str = "US"


@router.post("/pulse")
async def pulse(req: PulseReq, _user: str = Depends(require_user)) -> dict:
    asin = req.asin.strip().upper()
    if not asin:
        raise HTTPException(400, "asin cannot be empty")

    pulse_data = await asin_pulse_service.fetch_asin_pulse(asin, req.marketplace)

    # Persist a snapshot only when the core fetch succeeded.
    metrics = asin_pulse_service.snapshot_payload(pulse_data)

    delta: Dict[str, Any] = {}
    prev_ts: Optional[int] = None
    if not pulse_data.get("error"):
        with _connect() as conn:
            prev = _latest_metrics(conn, asin, req.marketplace)
            delta = _compute_delta(metrics, prev)
            now = int(time.time() * 1000)
            conn.execute(
                "INSERT INTO home_snapshot (asin,marketplace,ts,metrics) VALUES (?,?,?,?)",
                (asin, req.marketplace, now, json.dumps(metrics, ensure_ascii=False)),
            )
            _trim_snapshots(conn, asin, req.marketplace)
            prow = conn.execute(
                "SELECT ts FROM home_snapshot WHERE asin=? AND marketplace=? ORDER BY ts DESC LIMIT 1 OFFSET 1",
                (asin, req.marketplace),
            ).fetchone()
            prev_ts = prow["ts"] if prow else None

    return {"current": pulse_data, "delta": delta, "prev_ts": prev_ts}


@router.get("/watch-snapshots")
def watch_snapshots(_user: str = Depends(require_user)) -> List[dict]:
    """Latest stored snapshot per watched ASIN — no Sorftime call. Powers the
    cache-first card render so opening a tab costs zero API quota."""
    out: List[dict] = []
    with _connect() as conn:
        watch = conn.execute(
            "SELECT id,asin,marketplace,kind,label FROM home_watch ORDER BY ts ASC"
        ).fetchall()
        for w in watch:
            row = conn.execute(
                "SELECT ts,metrics FROM home_snapshot WHERE asin=? AND marketplace=? ORDER BY ts DESC LIMIT 1",
                (w["asin"], w["marketplace"]),
            ).fetchone()
            metrics = {}
            ts = None
            if row:
                try:
                    metrics = json.loads(row["metrics"])
                except Exception:
                    metrics = {}
                ts = row["ts"]
            out.append({
                "id": w["id"], "asin": w["asin"], "marketplace": w["marketplace"],
                "kind": w["kind"], "label": w["label"], "ts": ts, "metrics": metrics,
            })
    return out


# ── Alerts (recent significant changes across the watchlist) ──────────────────

# Minimum absolute change for a metric to count as an alert-worthy move.
_ALERT_THRESHOLD = {
    "price": 0.01,
    "bsr": 1,
    "est_sales": 1,
    "review_count": 1,
    "rating": 0.1,
    "inventory": 1,
}


@router.get("/alerts")
def alerts(_user: str = Depends(require_user)) -> List[dict]:
    """For each watched ASIN, diff its two most recent snapshots and surface
    metrics that moved beyond their threshold. Sparse until ≥2 snapshots
    exist per ASIN — that's expected in the live (no background poller) mode."""
    out: List[dict] = []
    with _connect() as conn:
        watch = conn.execute(
            "SELECT asin,marketplace,kind,label FROM home_watch"
        ).fetchall()
        for w in watch:
            rows = conn.execute(
                "SELECT ts,metrics FROM home_snapshot WHERE asin=? AND marketplace=? "
                "ORDER BY ts DESC LIMIT 2",
                (w["asin"], w["marketplace"]),
            ).fetchall()
            if len(rows) < 2:
                continue
            try:
                curr = json.loads(rows[0]["metrics"])
                prev = json.loads(rows[1]["metrics"])
            except Exception:
                continue
            for m in SNAPSHOT_METRICS:
                c, p = curr.get(m), prev.get(m)
                if not (isinstance(c, (int, float)) and isinstance(p, (int, float))):
                    continue
                diff = c - p
                if abs(diff) < _ALERT_THRESHOLD.get(m, 0):
                    continue
                out.append({
                    "asin": w["asin"],
                    "marketplace": w["marketplace"],
                    "kind": w["kind"],
                    "label": w["label"],
                    "metric": m,
                    "from": p,
                    "to": c,
                    "diff": round(diff, 4),
                    "ts": rows[0]["ts"],
                })
            # Coupon / deal appearing or disappearing.
            for flag in ("coupon", "deal"):
                cf, pf = bool(curr.get(flag)), bool(prev.get(flag))
                if cf != pf:
                    out.append({
                        "asin": w["asin"], "marketplace": w["marketplace"],
                        "kind": w["kind"], "label": w["label"],
                        "metric": flag, "from": pf, "to": cf, "diff": None,
                        "ts": rows[0]["ts"],
                    })
    out.sort(key=lambda a: a["ts"], reverse=True)
    return out[:30]


# ── Category dashboard ────────────────────────────────────────────────────────

_MOVER_THRESHOLD = 5          # min rank positions changed to count as a mover
_CAT_SNAPSHOT_MAX = 60


class CategoryReq(BaseModel):
    query: str
    marketplace: str = "US"
    mode: str = "category"        # "category" | "keyword"


def _category_movers(
    conn: sqlite3.Connection, node_id: str, marketplace: str, curr: Dict[str, int],
) -> Dict[str, Any]:
    """Diff current {asin: rank} against the last stored snapshot."""
    row = conn.execute(
        "SELECT ranks FROM home_category_snapshot WHERE node_id=? AND marketplace=? "
        "ORDER BY ts DESC LIMIT 1",
        (node_id, marketplace),
    ).fetchone()
    if not row:
        return {"new_entrants": [], "movers": [], "has_baseline": False}
    try:
        prev: Dict[str, int] = json.loads(row["ranks"])
    except Exception:
        return {"new_entrants": [], "movers": [], "has_baseline": False}

    new_entrants = [a for a in curr if a not in prev][:15]
    movers: List[Dict[str, Any]] = []
    for asin, rank in curr.items():
        if asin in prev:
            diff = rank - prev[asin]          # negative = climbed (lower rank #)
            if abs(diff) >= _MOVER_THRESHOLD:
                movers.append({"asin": asin, "from": prev[asin], "to": rank, "diff": diff})
    movers.sort(key=lambda m: abs(m["diff"]), reverse=True)
    return {"new_entrants": new_entrants, "movers": movers[:15], "has_baseline": True}


@router.post("/category")
async def category(req: CategoryReq, _user: str = Depends(require_user)) -> dict:
    if not req.query.strip():
        raise HTTPException(400, "query cannot be empty")

    mode = req.mode if req.mode in ("category", "keyword") else "category"
    data = await category_service.fetch_category(req.query, req.marketplace, mode)

    # Rank movers only make sense for a stable category node (category mode).
    changes: Dict[str, Any] = {"new_entrants": [], "movers": [], "has_baseline": False}
    if mode == "category" and not data.get("error") and data.get("top") and data.get("node_id"):
        node_id = data["node_id"]
        curr = category_service.rank_map(data["top"])
        with _connect() as conn:
            changes = _category_movers(conn, node_id, req.marketplace, curr)
            conn.execute(
                "INSERT INTO home_category_snapshot (node_id,marketplace,ts,ranks) VALUES (?,?,?,?)",
                (node_id, req.marketplace, int(time.time() * 1000), json.dumps(curr, ensure_ascii=False)),
            )
            conn.execute(
                "DELETE FROM home_category_snapshot WHERE node_id=? AND marketplace=? AND id NOT IN "
                "(SELECT id FROM home_category_snapshot WHERE node_id=? AND marketplace=? ORDER BY ts DESC LIMIT ?)",
                (node_id, req.marketplace, node_id, req.marketplace, _CAT_SNAPSHOT_MAX),
            )

    result = {**data, "changes": changes}
    # Cache per (mode, query) so reopening shows it without re-analyzing.
    if not data.get("error"):
        with _connect() as conn:
            conn.execute(
                "INSERT OR REPLACE INTO home_category_result (query_key,marketplace,ts,data) VALUES (?,?,?,?)",
                (f"{mode}:{req.query.strip().lower()}", req.marketplace, int(time.time() * 1000),
                 json.dumps(result, ensure_ascii=False)),
            )
    return result


@router.get("/category-result")
def category_result(query: str, marketplace: str = "US", mode: str = "category", _user: str = Depends(require_user)) -> dict:
    """Last cached category analysis — no Sorftime call."""
    with _connect() as conn:
        row = conn.execute(
            "SELECT ts,data FROM home_category_result WHERE query_key=? AND marketplace=?",
            (f"{mode}:{query.strip().lower()}", marketplace),
        ).fetchone()
    if not row:
        return {"cached": None, "ts": None}
    try:
        return {"cached": json.loads(row["data"]), "ts": row["ts"]}
    except Exception:
        return {"cached": None, "ts": None}


# ── Market (大盘) traffic: watchlist + daily series + recording ───────────────

class MarketWatchIn(BaseModel):
    query: str
    marketplace: str = "US"
    label: str = ""


@router.get("/market-watch")
def list_market_watch(_user: str = Depends(require_user)) -> List[dict]:
    with _connect() as conn:
        rows = conn.execute(
            "SELECT id,query,marketplace,label,ts FROM home_market_watch ORDER BY ts ASC"
        ).fetchall()
    return [dict(r) for r in rows]


@router.post("/market-watch")
async def add_market_watch(item: MarketWatchIn, _user: str = Depends(require_user)) -> dict:
    query = item.query.strip()
    if not query:
        raise HTTPException(400, "query cannot be empty")
    mid = f"{item.marketplace}:{query.lower()}"
    with _connect() as conn:
        conn.execute(
            "INSERT OR REPLACE INTO home_market_watch (id,query,marketplace,label,ts) VALUES (?,?,?,?,?)",
            (mid, query, item.marketplace, item.label.strip(), int(time.time() * 1000)),
        )
    # Record an initial point immediately so the chart isn't empty on day one.
    try:
        await _record_market_one(query, item.marketplace)
    except Exception:
        pass
    return {"id": mid}


@router.delete("/market-watch/{mid}")
def delete_market_watch(mid: str, _user: str = Depends(require_user)) -> dict:
    with _connect() as conn:
        conn.execute("DELETE FROM home_market_watch WHERE id=?", (mid,))
    return {"ok": True}


def _asin_daily_series(conn: sqlite3.Connection, asins: List[str], marketplace: str) -> List[dict]:
    """Daily series = average est_sales across the given ASINs, one point per
    day (using each ASIN's last snapshot that day)."""
    if not asins:
        return []
    placeholders = ",".join("?" * len(asins))
    rows = conn.execute(
        f"SELECT asin,ts,metrics FROM home_snapshot "
        f"WHERE marketplace=? AND asin IN ({placeholders}) ORDER BY ts ASC",
        (marketplace, *asins),
    ).fetchall()
    # day -> asin -> est_sales (last wins because rows are ts-ascending)
    by_day: Dict[str, Dict[str, float]] = {}
    for r in rows:
        try:
            m = json.loads(r["metrics"])
        except Exception:
            continue
        es = m.get("est_sales")
        if not isinstance(es, (int, float)):
            continue
        by_day.setdefault(_day_of(r["ts"]), {})[r["asin"]] = float(es)
    out: List[dict] = []
    for day in sorted(by_day):
        vals = list(by_day[day].values())
        if vals:
            out.append({"day": day, "value": round(sum(vals) / len(vals), 1)})
    return out


@router.get("/market-series")
def market_series(query: str, marketplace: str = "US", _user: str = Depends(require_user)) -> dict:
    qk = query.strip().lower()
    with _connect() as conn:
        mrows = conn.execute(
            "SELECT day,search_volume,total_sales,avg_price FROM home_market_snapshot "
            "WHERE query_key=? AND marketplace=? ORDER BY day ASC",
            (qk, marketplace),
        ).fetchall()
        own_asins = [r["asin"] for r in conn.execute(
            "SELECT asin FROM home_watch WHERE kind='own' AND marketplace=?", (marketplace,)
        ).fetchall()]
        comp_asins = [r["asin"] for r in conn.execute(
            "SELECT asin FROM home_watch WHERE kind='competitor' AND marketplace=?", (marketplace,)
        ).fetchall()]
        own = _asin_daily_series(conn, own_asins, marketplace)
        competitor = _asin_daily_series(conn, comp_asins, marketplace)
    return {
        "query": query,
        "marketplace": marketplace,
        "market": [dict(r) for r in mrows],
        "own": own,
        "competitor": competitor,
    }


# ── Recording (used by the daily scheduler + manual / external trigger) ───────

async def _record_market_one(query: str, marketplace: str) -> bool:
    m = await market_traffic_service.fetch_market_metrics(query, marketplace)
    if m.get("search_volume") is None and m.get("total_sales") is None and m.get("avg_price") is None:
        return False
    with _connect() as conn:
        conn.execute(
            "INSERT OR REPLACE INTO home_market_snapshot "
            "(query_key,marketplace,day,ts,search_volume,total_sales,avg_price) VALUES (?,?,?,?,?,?,?)",
            (query.strip().lower(), marketplace, _today_key(), int(time.time() * 1000),
             m.get("search_volume"), m.get("total_sales"), m.get("avg_price")),
        )
    return True


async def _record_asin_one(asin: str, marketplace: str) -> bool:
    pulse_data = await asin_pulse_service.fetch_asin_pulse(asin, marketplace)
    if pulse_data.get("error"):
        return False
    metrics = asin_pulse_service.snapshot_payload(pulse_data)
    with _connect() as conn:
        conn.execute(
            "INSERT INTO home_snapshot (asin,marketplace,ts,metrics) VALUES (?,?,?,?)",
            (asin, marketplace, int(time.time() * 1000), json.dumps(metrics, ensure_ascii=False)),
        )
        _trim_snapshots(conn, asin, marketplace)
    return True


async def run_due_recordings() -> dict:
    """Record today's point for any market baseline / watched ASIN that doesn't
    have one yet. Best-effort: individual failures are swallowed. Returns a
    small summary for logging / the manual-trigger response."""
    day = _today_key()
    recorded_market = 0
    recorded_asin = 0

    with _connect() as conn:
        baselines = [(r["query"], r["marketplace"]) for r in
                     conn.execute("SELECT query,marketplace FROM home_market_watch").fetchall()]
        watched = [(r["asin"], r["marketplace"]) for r in
                   conn.execute("SELECT asin,marketplace FROM home_watch").fetchall()]

    for query, mkt in baselines:
        with _connect() as conn:
            done = conn.execute(
                "SELECT 1 FROM home_market_snapshot WHERE query_key=? AND marketplace=? AND day=?",
                (query.strip().lower(), mkt, day),
            ).fetchone()
        if done:
            continue
        try:
            if await _record_market_one(query, mkt):
                recorded_market += 1
        except Exception:
            pass

    for asin, mkt in watched:
        with _connect() as conn:
            row = conn.execute(
                "SELECT ts FROM home_snapshot WHERE asin=? AND marketplace=? ORDER BY ts DESC LIMIT 1",
                (asin, mkt),
            ).fetchone()
        if row and _day_of(row["ts"]) == day:
            continue
        try:
            if await _record_asin_one(asin, mkt):
                recorded_asin += 1
        except Exception:
            pass

    return {"day": day, "recorded_market": recorded_market, "recorded_asin": recorded_asin}


@router.post("/market-record")
async def market_record(_user: str = Depends(require_user)) -> dict:
    """Manual 'record now' — also suitable for an external cron / systemd timer."""
    return await run_due_recordings()


# ── Historical backfill via trend tools (monthly points) ──────────────────────

def _ts_for_day(day: str) -> int:
    return int(datetime.strptime(day, "%Y-%m-%d").timestamp() * 1000)


async def backfill_history(query: str, marketplace: str) -> dict:
    """Seed monthly history for one baseline: keyword_trend → market search
    volume; product_trend → est_sales for each watched ASIN (for attribution).
    Idempotent: replaces market points by (key,day) and re-inserts ASIN history
    after clearing pre-today snapshots."""
    qk = query.strip().lower()
    today = _today_key()

    sv_series, sv_err = await market_traffic_service.fetch_keyword_trend_series(query, marketplace)
    market_points = 0
    with _connect() as conn:
        for day, sv in sv_series:
            if day == today:
                continue
            conn.execute(
                "INSERT OR REPLACE INTO home_market_snapshot "
                "(query_key,marketplace,day,ts,search_volume,total_sales,avg_price) VALUES (?,?,?,?,?,?,?)",
                (qk, marketplace, day, _ts_for_day(day), sv, None, None),
            )
            market_points += 1

    with _connect() as conn:
        watched = [r["asin"] for r in conn.execute(
            "SELECT asin FROM home_watch WHERE marketplace=?", (marketplace,)).fetchall()]

    start_today = _ts_for_day(today)
    asin_points = 0
    asin_errors = 0
    for asin in watched:
        series, err = await market_traffic_service.fetch_product_trend_series(asin, marketplace)
        if err or not series:
            asin_errors += 1
            continue
        with _connect() as conn:
            conn.execute(
                "DELETE FROM home_snapshot WHERE asin=? AND marketplace=? AND ts < ?",
                (asin, marketplace, start_today),
            )
            for day, sales in series:
                if day == today:
                    continue
                conn.execute(
                    "INSERT INTO home_snapshot (asin,marketplace,ts,metrics) VALUES (?,?,?,?)",
                    (asin, marketplace, _ts_for_day(day), json.dumps({"est_sales": sales}, ensure_ascii=False)),
                )
                asin_points += 1

    return {"market_points": market_points, "asin_points": asin_points,
            "asin_errors": asin_errors, "sv_error": sv_err}


class BackfillReq(BaseModel):
    query: str
    marketplace: str = "US"


def _hist_day_metrics(report: Any) -> tuple:
    """From a single-day category_report_from_history → (total_sales, avg_price)."""
    root = report if isinstance(report, dict) else {}
    rep = root.get("类目统计报告") or {}
    total = _kx_num(rep.get("top100产品月销量")) if isinstance(rep, dict) else None
    lst = root.get("Top100产品") or []
    prices = [_kx_num(p.get("价格")) for p in lst if isinstance(p, dict)]
    prices = [x for x in prices if x]
    avg = round(sum(prices) / len(prices), 2) if prices else None
    return total, avg


class DailyBackfillReq(BaseModel):
    query: str
    marketplace: str = "US"
    category: str = ""          # ASIN / nodeId / category name to resolve the node
    days: int = 31


@router.post("/market-daily-backfill")
async def market_daily_backfill(req: DailyBackfillReq, _user: str = Depends(require_user)) -> dict:
    """Backfill the last N days (≤31) of *daily* category total-sales / avg-price
    via category_report_from_history (per-day snapshots). Requires resolving the
    category node from `category` (ASIN reverse-lookup recommended). Search volume
    has no daily equivalent on Sorftime, so only sales/price get daily points."""
    from datetime import date, timedelta
    from app.services import category_service as CS
    from app.services.sorftime_service import _make_client, _safe_call

    qk = req.query.strip().lower()
    days = max(1, min(req.days, 31))
    async with _make_client() as client:
        node, name, source, rerr = await CS._resolve_node(client, (req.category or req.query), req.marketplace)
        if not node:
            return {"error": rerr or "无法解析类目节点（请提供该品类真实 ASIN 或 nodeId）",
                    "filled": 0, "node_id": "", "category_name": name}
        with _connect() as conn:
            conn.execute(
                "INSERT OR REPLACE INTO home_market_node (mid,node_id,category_name,ts) VALUES (?,?,?,?)",
                (f"{req.marketplace}:{qk}", node, name or "", int(time.time() * 1000)),
            )
            # Watched ASINs (own + competitor) in this marketplace — we'll fill
            # their daily sales from the same per-day Top100 (no extra calls).
            watched = {r["asin"] for r in conn.execute(
                "SELECT asin FROM home_watch WHERE marketplace=?", (req.marketplace,)).fetchall()}
        filled = 0
        asin_daily = 0
        today = date.today()
        for i in range(days):
            d = (today - timedelta(days=i)).isoformat()
            _, rep, e = await _safe_call(client, "category_report_from_history",
                                         {"nodeId": node, "startDate": d, "endDate": d, "amzSite": req.marketplace}, 1)
            if e or not isinstance(rep, dict):
                continue
            total, avg = _hist_day_metrics(rep)
            ts_d = _ts_for_day(d)
            with _connect() as conn:
                if total is not None or avg is not None:
                    row = conn.execute(
                        "SELECT search_volume FROM home_market_snapshot WHERE query_key=? AND marketplace=? AND day=?",
                        (qk, req.marketplace, d)).fetchone()
                    sv = row["search_volume"] if row else None
                    conn.execute(
                        "INSERT OR REPLACE INTO home_market_snapshot "
                        "(query_key,marketplace,day,ts,search_volume,total_sales,avg_price) VALUES (?,?,?,?,?,?,?)",
                        (qk, req.marketplace, d, int(time.time() * 1000), sv, total, avg))
                    filled += 1
                # Per-ASIN daily sales for any watched ASIN present in the Top100.
                if watched:
                    for p in (rep.get("Top100产品") or []):
                        if not isinstance(p, dict):
                            continue
                        a = p.get("ASIN") or p.get("asin")
                        if a in watched:
                            es = _kx_num(p.get("月销量"))
                            if es is not None:
                                conn.execute(
                                    "DELETE FROM home_snapshot WHERE asin=? AND marketplace=? AND ts>=? AND ts<?",
                                    (a, req.marketplace, ts_d, ts_d + 86400000))
                                conn.execute(
                                    "INSERT INTO home_snapshot (asin,marketplace,ts,metrics) VALUES (?,?,?,?)",
                                    (a, req.marketplace, ts_d, json.dumps({"est_sales": es}, ensure_ascii=False)))
                                asin_daily += 1
    return {"error": None, "filled": filled, "asin_daily": asin_daily,
            "node_id": node, "category_name": name, "days": days}


@router.post("/market-backfill")
async def market_backfill(req: BackfillReq, _user: str = Depends(require_user)) -> dict:
    if not req.query.strip():
        raise HTTPException(400, "query cannot be empty")
    return await backfill_history(req.query, req.marketplace)


# ── Keyword watchlist (server-side, synced across devices, cache-first) ───────

class KeywordIn(BaseModel):
    keyword: str
    marketplace: str = "US"
    label: str = ""


def _kw_id(keyword: str, marketplace: str) -> str:
    return f"{marketplace}:{keyword.strip().lower()}"


@router.get("/keywords")
def list_keywords(_user: str = Depends(require_user)) -> List[dict]:
    out: List[dict] = []
    with _connect() as conn:
        rows = conn.execute(
            "SELECT id,keyword,marketplace,label,ts,data,data_ts FROM home_keyword ORDER BY ts ASC"
        ).fetchall()
    for r in rows:
        data = None
        if r["data"]:
            try:
                data = json.loads(r["data"])
            except Exception:
                data = None
        out.append({
            "id": r["id"], "keyword": r["keyword"], "marketplace": r["marketplace"],
            "label": r["label"], "ts": r["ts"], "data": data, "data_ts": r["data_ts"],
        })
    return out


@router.post("/keyword")
def add_keyword(item: KeywordIn, _user: str = Depends(require_user)) -> dict:
    kw = item.keyword.strip()
    if not kw:
        raise HTTPException(400, "keyword cannot be empty")
    kid = _kw_id(kw, item.marketplace)
    with _connect() as conn:
        # Don't clobber existing cached data on re-add.
        exists = conn.execute("SELECT 1 FROM home_keyword WHERE id=?", (kid,)).fetchone()
        if not exists:
            conn.execute(
                "INSERT INTO home_keyword (id,keyword,marketplace,label,ts,data,data_ts) "
                "VALUES (?,?,?,?,?,?,?)",
                (kid, kw, item.marketplace, item.label.strip(), int(time.time() * 1000), "", None),
            )
    return {"id": kid}


@router.delete("/keyword/{kid}")
def delete_keyword(kid: str, _user: str = Depends(require_user)) -> dict:
    with _connect() as conn:
        conn.execute("DELETE FROM home_keyword WHERE id=?", (kid,))
    return {"ok": True}


class KeywordPulseReq(BaseModel):
    keyword: str
    marketplace: str = "US"


@router.post("/keyword-pulse")
async def keyword_pulse(req: KeywordPulseReq, _user: str = Depends(require_user)) -> dict:
    """Live keyword_detail + keyword_trend, cached server-side so subsequent
    tab opens read from cache (GET /keywords) without spending API quota."""
    kw = req.keyword.strip()
    if not kw:
        raise HTTPException(400, "keyword cannot be empty")

    from app.services.sorftime_service import _make_client, _safe_call
    async with _make_client() as client:
        detail_task = _safe_call(client, "keyword_detail",
                                 {"keyword": kw, "keywordSupportSite": req.marketplace}, 1)
        trend_task = _safe_call(client, "keyword_trend",
                                {"keyword": kw, "keywordSupportSite": req.marketplace}, 2)
        (_, detail, detail_err), (_, trend, trend_err) = await asyncio.gather(detail_task, trend_task)

    result = {
        "keyword": kw, "marketplace": req.marketplace,
        "detail": detail, "detail_error": detail_err,
        "trend": trend, "trend_error": trend_err,
    }
    # Cache only when we actually got the core detail.
    if detail and not detail_err:
        with _connect() as conn:
            kid = _kw_id(kw, req.marketplace)
            now = int(time.time() * 1000)
            exists = conn.execute("SELECT 1 FROM home_keyword WHERE id=?", (kid,)).fetchone()
            if exists:
                conn.execute("UPDATE home_keyword SET data=?, data_ts=? WHERE id=?",
                             (json.dumps(result, ensure_ascii=False), now, kid))
            else:
                conn.execute(
                    "INSERT INTO home_keyword (id,keyword,marketplace,label,ts,data,data_ts) "
                    "VALUES (?,?,?,?,?,?,?)",
                    (kid, kw, req.marketplace, "", now, json.dumps(result, ensure_ascii=False), now),
                )
    return result


# ── Expanded keywords (拓展词): related keywords + opportunity score ──────────

def _kx_num(v: Any) -> Optional[float]:
    if v is None:
        return None
    if isinstance(v, (int, float)):
        return float(v)
    try:
        s = str(v).replace(",", "").replace("$", "").replace("%", "").strip()
        return float(s) if s else None
    except Exception:
        return None


def _kx_pick(d: Dict[str, Any], *keys: str) -> Any:
    for k in keys:
        if isinstance(d, dict) and d.get(k) not in (None, "", []):
            return d[k]
    return None


def _score_extends(items: List[dict], base: str) -> None:
    """Opportunity score 0-100 = 0.7·demand(log) + 0.3·CPC intent (relative to set).
    Marks `related` = shares a token with the base keyword."""
    vols = [i["monthly_search"] for i in items if isinstance(i.get("monthly_search"), (int, float))]
    cpcs = [i["cpc"] for i in items if isinstance(i.get("cpc"), (int, float))]
    maxv = max(vols) if vols else 1.0
    maxc = max(cpcs) if cpcs else 1.0
    base_tokens = {t for t in base.lower().split() if t}
    for i in items:
        v = i.get("monthly_search") or 0
        c = i.get("cpc") or 0
        voln = (math.log10(v + 1) / math.log10(maxv + 1)) if maxv > 1 else 0.0
        cpcn = (c / maxc) if maxc else 0.0
        i["score"] = round(100 * (0.7 * voln + 0.3 * cpcn))
        i["related"] = bool(base_tokens & {t for t in str(i.get("keyword", "")).lower().split() if t})


@router.post("/keyword-extends")
async def keyword_extends(req: KeywordPulseReq, _user: str = Depends(require_user)) -> dict:
    """Fetch related/extended keywords (keyword_extends) + compute opportunity
    score. Cached server-side so reopening costs no quota."""
    kw = req.keyword.strip()
    if not kw:
        raise HTTPException(400, "keyword cannot be empty")
    from app.services.sorftime_service import _make_client, _safe_call
    async with _make_client() as client:
        _, res, err = await _safe_call(client, "keyword_extends",
                                       {"keyword": kw, "keywordSupportSite": req.marketplace}, 1)
    if err or not isinstance(res, list):
        return {"keyword": kw, "marketplace": req.marketplace, "error": err or "无拓展词", "items": [], "ts": None}

    items: List[dict] = []
    for x in res:
        if not isinstance(x, dict):
            continue
        k = _kx_pick(x, "关键词", "keyword")
        if not k or str(k).strip().lower() == kw.lower():
            continue
        items.append({
            "keyword": k,
            "monthly_search": _kx_num(_kx_pick(x, "月搜索量", "monthlySearches")),
            "cpc": _kx_num(_kx_pick(x, "cpc推荐竞价", "推荐cpc竞价", "cpc")),
            "seasonality": _kx_pick(x, "季节性"),
            "evidence_sales": None,
        })
    _score_extends(items, kw)
    items.sort(key=lambda i: i.get("score", 0), reverse=True)

    now = int(time.time() * 1000)
    with _connect() as conn:
        conn.execute(
            "INSERT OR REPLACE INTO home_keyword_extends (id,keyword,marketplace,ts,data) VALUES (?,?,?,?,?)",
            (_kw_id(kw, req.marketplace), kw, req.marketplace, now, json.dumps(items, ensure_ascii=False)),
        )
    return {"keyword": kw, "marketplace": req.marketplace, "error": None, "items": items, "ts": now}


@router.get("/keyword-extends")
def keyword_extends_cached(keyword: str, marketplace: str = "US", _user: str = Depends(require_user)) -> dict:
    """Cached extended keywords — no Sorftime call."""
    with _connect() as conn:
        row = conn.execute(
            "SELECT ts,data FROM home_keyword_extends WHERE id=?",
            (_kw_id(keyword, marketplace),),
        ).fetchone()
    if not row:
        return {"keyword": keyword, "marketplace": marketplace, "items": [], "ts": None}
    try:
        return {"keyword": keyword, "marketplace": marketplace, "items": json.loads(row["data"]), "ts": row["ts"]}
    except Exception:
        return {"keyword": keyword, "marketplace": marketplace, "items": [], "ts": None}


@router.post("/keyword-extends-sales")
async def keyword_extends_sales(req: KeywordPulseReq, _user: str = Depends(require_user)) -> dict:
    """Deep order-evidence: for the top extended keywords (by score) lacking it,
    pull keyword_search_results and record the median monthly sales of the top
    products — an evidence that the keyword actually drives orders. Up to 8
    extra Sorftime calls."""
    kw = req.keyword.strip()
    kid = _kw_id(kw, req.marketplace)
    with _connect() as conn:
        row = conn.execute("SELECT data FROM home_keyword_extends WHERE id=?", (kid,)).fetchone()
    if not row:
        raise HTTPException(400, "先拉取拓展词")
    try:
        items: List[dict] = json.loads(row["data"])
    except Exception:
        items = []

    targets = [i for i in sorted(items, key=lambda x: x.get("score", 0), reverse=True)
               if i.get("evidence_sales") is None][:8]

    from app.services.sorftime_service import _make_client, _safe_call
    async with _make_client() as client:
        for it in targets:
            try:
                _, sr, err = await _safe_call(client, "keyword_search_results",
                                              {"keyword": it["keyword"], "keywordSupportSite": req.marketplace}, 1)
                if isinstance(sr, list):
                    sales = sorted(
                        [s for s in (_kx_num(p.get("本产品月销量")) for p in sr if isinstance(p, dict)) if s],
                        reverse=True)[:10]
                    if sales:
                        mid = sales[len(sales) // 2] if len(sales) % 2 else (sales[len(sales) // 2 - 1] + sales[len(sales) // 2]) / 2
                        it["evidence_sales"] = round(mid)
            except Exception:
                pass

    now = int(time.time() * 1000)
    with _connect() as conn:
        conn.execute("UPDATE home_keyword_extends SET data=?, ts=? WHERE id=?",
                     (json.dumps(items, ensure_ascii=False), now, kid))
    return {"keyword": kw, "marketplace": req.marketplace, "error": None, "items": items, "ts": now}
