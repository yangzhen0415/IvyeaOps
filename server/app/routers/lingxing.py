"""领星 (LingXing) gateway API (mounted at ``/api/lingxing``, admin-only).

P0 surface:
* ``GET /status``  — config/switch snapshot (no secrets) for the UI.
* ``POST /probe``  — live ``tools/list`` against LingXing, classified read/write.
                     This is the step that resolves whether ad-write tools exist.
* ``GET /audit``   — recent gateway call log.

The write-execution endpoints (operate switch toggle, op tickets, triple
review, human confirm) land in P3.
"""
from __future__ import annotations

from typing import Any, Dict

from fastapi import APIRouter, HTTPException

from app.services import lingxing_service as lx

router = APIRouter()


@router.get("/status")
async def status() -> Dict[str, Any]:
    return lx.status()


@router.post("/probe")
async def probe() -> Dict[str, Any]:
    """Verify both backends end-to-end: OpenAPI (token + signed read) and, if an
    X-Mcp-Key is configured, MCP (tools/list classified read/write)."""
    out: Dict[str, Any] = {"openapi": None, "mcp": None}
    from app.services import lingxing_openapi as lo
    if lo.is_configured():
        try:
            out["openapi"] = await lx.openapi_verify(caller="probe")
        except lx.LingXingError as e:
            out["openapi"] = {"ok": False, "error": str(e)}
    if lx._key():
        try:
            out["mcp"] = await lx.probe(caller="probe")
        except lx.LingXingError as e:
            out["mcp"] = {"ok": False, "error": str(e)}
    if out["openapi"] is None and out["mcp"] is None:
        raise HTTPException(status_code=400, detail="未配置任何领星后端（OpenAPI 凭证或 MCP key）")
    return out


@router.get("/audit")
async def audit(limit: int = 100) -> Dict[str, Any]:
    return {"rows": lx.recent_audit(limit=max(1, min(limit, 500)))}
