"""SIF MCP HTTP client — direct tool calls to sif.com MCP endpoint.

Follows the same JSON-RPC over HTTP pattern as sorftime_service.
Used by deep_analysis router for keyword/competitor/traffic diagnostics.
"""
from __future__ import annotations

import asyncio
import json as _json
import logging
import os
from contextlib import asynccontextmanager
from typing import Any, Dict, Optional, Tuple

import httpx

_log = logging.getLogger(__name__)

_SIF_BASE = "https://mcp.sif.com/mcp"

_HEADERS = {
    "Content-Type": "application/json",
    "Accept": "application/json, text/event-stream",
}

_TOOL_TIMEOUT = 60.0
_CONN_TIMEOUT = 15.0


def _auth_header() -> dict:
    """Read SIF MCP auth token from hermes config or env."""
    token = os.getenv("SIF_MCP_TOKEN", "")
    if not token:
        try:
            import yaml
            cfg_path = os.path.expanduser("~/.hermes/config.yaml")
            with open(cfg_path) as f:
                cfg = yaml.safe_load(f) or {}
            mcp_servers = cfg.get("mcp_servers", {})
            sif = mcp_servers.get("sif_mcp", {})
            headers = sif.get("headers", {})
            token = headers.get("Authorization", "").replace("Bearer ", "")
        except Exception:
            pass
    return {"Authorization": f"Bearer {token}"} if token else {}


async def _call_tool(
    client: httpx.AsyncClient,
    tool_name: str,
    arguments: Dict[str, Any],
    call_id: int = 1,
) -> Any:
    """Call a single SIF MCP tool. Returns parsed result content."""
    payload = {
        "jsonrpc": "2.0",
        "id": call_id,
        "method": "tools/call",
        "params": {"name": tool_name, "arguments": arguments},
    }
    headers = {**_HEADERS, **_auth_header()}
    resp = await client.post(_SIF_BASE, json=payload, headers=headers)
    resp.raise_for_status()

    body = None
    for line in resp.text.splitlines():
        line = line.strip()
        if line.startswith("data:"):
            raw = line[5:].strip()
            if raw:
                try:
                    body = _json.loads(raw)
                    break
                except Exception:
                    pass
    if body is None:
        # Try parsing as plain JSON
        try:
            body = resp.json()
        except Exception:
            raise RuntimeError(f"sif/{tool_name}: could not parse response")

    if "error" in body:
        raise RuntimeError(f"sif/{tool_name} error: {body['error']}")

    result = body.get("result", {})
    if result.get("isError"):
        content_list = result.get("content", [])
        msg = next(
            (c.get("text", "") for c in content_list
             if isinstance(c, dict) and c.get("type") == "text"),
            "unknown error",
        )
        raise RuntimeError(f"sif/{tool_name}: {msg}")

    content = result.get("content", [])
    if isinstance(content, list) and content:
        first = content[0]
        if isinstance(first, dict) and first.get("type") == "text":
            text = first.get("text", "")
            try:
                return _json.loads(text)
            except Exception:
                return text
    return result


async def _safe_call(
    client: httpx.AsyncClient,
    tool_name: str,
    arguments: Dict[str, Any],
    call_id: int = 1,
) -> Tuple[str, Any, Optional[str]]:
    """Wrapper: returns (tool_name, result_or_None, error_or_None)."""
    try:
        data = await asyncio.wait_for(
            _call_tool(client, tool_name, arguments, call_id),
            timeout=_TOOL_TIMEOUT,
        )
        return tool_name, data, None
    except asyncio.TimeoutError:
        _log.warning("sif/%s timed out", tool_name)
        return tool_name, None, f"{tool_name} 超时"
    except Exception as exc:
        _log.warning("sif/%s failed: %s", tool_name, exc)
        return tool_name, None, f"{tool_name}: {exc}"


@asynccontextmanager
async def _make_client():
    """Async context manager with MCP initialize handshake."""
    async with httpx.AsyncClient(
        timeout=httpx.Timeout(_TOOL_TIMEOUT, connect=_CONN_TIMEOUT),
        limits=httpx.Limits(max_connections=20),
    ) as client:
        try:
            init_payload = {
                "jsonrpc": "2.0", "id": 0, "method": "initialize",
                "params": {
                    "protocolVersion": "2024-11-05",
                    "capabilities": {},
                    "clientInfo": {"name": "ops-hub", "version": "1.0"},
                },
            }
            headers = {**_HEADERS, **_auth_header()}
            resp = await asyncio.wait_for(
                client.post(_SIF_BASE, json=init_payload, headers=headers),
                timeout=_CONN_TIMEOUT,
            )
            resp.raise_for_status()
            _log.debug("sif_mcp initialize ok")
        except Exception as exc:
            _log.warning("sif_mcp initialize failed: %s", exc)
        yield client


# ── High-level pipelines ─────────────────────────────────────────────────

async def keyword_competition(
    keyword: str,
    country: str = "US",
    asin: str = "",
) -> Dict[str, Any]:
    """Keyword competition analysis via market_get_keyword_competition."""
    args: Dict[str, Any] = {"keyword": keyword, "country": country}
    if asin:
        args["asin"] = asin
    async with _make_client() as client:
        _, data, err = await _safe_call(client, "market_get_keyword_competition", args, 1)
    if err:
        raise RuntimeError(err)
    return data


async def competitor_keyword_signals(
    asin: str,
    country: str = "US",
    time_type: str = "lately",
    time_value: str = "7",
) -> Dict[str, Any]:
    """Competitor reverse lookup via market_get_asin_keyword_signals."""
    args = {
        "asin": asin,
        "country": country,
        "time_type": time_type,
        "time_value": time_value,
    }
    async with _make_client() as client:
        _, data, err = await _safe_call(client, "market_get_asin_keyword_signals", args, 1)
    if err:
        raise RuntimeError(err)
    return data


async def traffic_anomaly(
    asin: str,
    country: str = "US",
) -> Dict[str, Any]:
    """Traffic anomaly diagnosis via analyze_traffic_anomaly."""
    args = {"asin": asin, "country": country}
    async with _make_client() as client:
        _, data, err = await _safe_call(client, "analyze_traffic_anomaly", args, 1)
    if err:
        raise RuntimeError(err)
    return data
