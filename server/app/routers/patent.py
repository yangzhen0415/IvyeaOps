"""Ruiguan patent lookup endpoints."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Literal

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, validator

from app.core import hub_settings
from app.core.security import require_user

router = APIRouter(dependencies=[Depends(require_user)])

RUIGUAN_BASE = "https://saas.eric-bot.com/v1.0/eric-api"
INVENTION_URL = f"{RUIGUAN_BASE}/patent/utility/v1/detection"
DESIGN_URL = f"{RUIGUAN_BASE}/patent/design/v1/detection"

DESIGN_REGIONS = {
    "SE", "EU", "CH", "IE", "BR", "MX", "US", "WO", "GB", "IL", "JP", "IN",
    "DK", "DE", "AU", "IT", "NZ", "AT", "CA", "BX", "FI", "FR", "CN", "KR",
    "TH", "MY", "ES", "TR", "RU",
}


class PatentStatus(BaseModel):
    configured: bool


class InventionSearchBody(BaseModel):
    product_title: str = Field(..., min_length=1, max_length=500)
    product_description: str = Field(..., min_length=1, max_length=30000)
    top_number: int = Field(default=50, ge=1, le=500)

    @validator("product_title", "product_description")
    def _strip_required(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("required")
        return value


class DesignSearchBody(BaseModel):
    product_title: str = Field(default="", max_length=500)
    product_description: str = Field(default="", max_length=30000)
    regions: list[str] = Field(default_factory=lambda: ["US"])
    image_base64: str = Field(..., min_length=1)
    top_number: int = Field(default=50, ge=1, le=500)
    enable_tro: bool = True
    query_mode: Literal["physical", "line", "hybrid"] = "hybrid"
    enable_radar: bool = False
    top_loc: list[str] | None = None
    patent_status: list[str] | None = None
    source_language: str = ""

    @validator("product_title", "product_description", "source_language", pre=True)
    def _strip_optional(cls, value: Any) -> str:
        return str(value or "").strip()

    @validator("image_base64")
    def _strip_image(cls, value: str) -> str:
        value = value.strip()
        if value.startswith("data:image/") and "," in value:
            value = value.split(",", 1)[1].strip()
        if not value:
            raise ValueError("image_base64 is required")
        return value

    @validator("regions")
    def _validate_regions(cls, value: list[str]) -> list[str]:
        normalized = [str(v).strip().upper() for v in value if str(v).strip()]
        if not normalized:
            raise ValueError("regions is required")
        invalid = [v for v in normalized if v not in DESIGN_REGIONS]
        if invalid:
            raise ValueError(f"unsupported region: {', '.join(invalid)}")
        return normalized


def _token() -> str:
    token = str(hub_settings.get("ruiguan_token") or "").strip()
    if not token:
        raise HTTPException(status_code=400, detail="Ruiguan Token is not configured")
    return token


async def _post_ruiguan(url: str, payload: dict[str, Any]) -> dict[str, Any]:
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(90, connect=10)) as client:
            resp = await client.post(url, json=payload, headers={"Token": _token()})
    except httpx.TimeoutException:
        raise HTTPException(status_code=504, detail="Ruiguan request timed out")
    except httpx.ConnectError:
        raise HTTPException(status_code=502, detail="Cannot connect to Ruiguan API")
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Ruiguan request failed: {str(exc)[:160]}")

    if resp.status_code in (401, 403):
        raise HTTPException(status_code=502, detail=f"Ruiguan authentication failed (HTTP {resp.status_code})")
    if resp.status_code >= 400:
        raise HTTPException(status_code=502, detail=f"Ruiguan API returned HTTP {resp.status_code}: {resp.text[:200]}")
    try:
        data = resp.json()
    except ValueError:
        raise HTTPException(status_code=502, detail="Ruiguan API returned non-JSON response")
    if data.get("success") is False:
        raise HTTPException(status_code=502, detail=str(data.get("message") or data.get("code") or "Ruiguan API error")[:200])
    return data


def _items_from_response(data: dict[str, Any]) -> list[Any]:
    payload = data.get("data")
    if isinstance(payload, dict):
        items = payload.get("data")
        if isinstance(items, list):
            return items
    if isinstance(payload, list):
        return payload
    return []


def _wrap_response(patent_type: str, data: dict[str, Any]) -> dict[str, Any]:
    items = _items_from_response(data)
    return {
        "success": bool(data.get("success", True)),
        "code": data.get("code"),
        "message": data.get("message"),
        "request_id": data.get("request_id"),
        "patent_type": patent_type,
        "count": len(items),
        "called_at": datetime.now(timezone.utc).isoformat(),
        "data": data.get("data"),
        "items": items,
    }


@router.get("/status", response_model=PatentStatus)
def patent_status() -> PatentStatus:
    return PatentStatus(configured=bool(str(hub_settings.get("ruiguan_token") or "").strip()))


@router.post("/invention/search")
async def search_invention(body: InventionSearchBody) -> dict[str, Any]:
    payload = {
        "product_title": body.product_title,
        "product_description": body.product_description,
        "regions": ["US"],
        "top_number": body.top_number,
    }
    return _wrap_response("invention", await _post_ruiguan(INVENTION_URL, payload))


@router.post("/design/search")
async def search_design(body: DesignSearchBody) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "product_title": body.product_title,
        "product_description": body.product_description,
        "regions": body.regions,
        "img_64lis": [body.image_base64],
        "top_number": body.top_number,
        "enable_tro": body.enable_tro,
        "query_mode": body.query_mode,
        "enable_radar": body.enable_radar,
        "source_language": body.source_language,
    }
    if body.top_loc is not None:
        payload["top_loc"] = body.top_loc
    if body.patent_status is not None:
        payload["patent_status"] = body.patent_status
    return _wrap_response("design", await _post_ruiguan(DESIGN_URL, payload))
