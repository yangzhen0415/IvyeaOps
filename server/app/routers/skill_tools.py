"""Skill Tools router — auto-generated visual panels from Skill SKILL.md.

Endpoints:
  GET  /api/skill-tools/list   → all executable skills with parsed inputs schema
  POST /api/skill-tools/run    → execute a skill with user-provided params
"""
from __future__ import annotations

import json
import re
import time
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from app.core.security import require_user
from app.services import skill_repo

router = APIRouter(dependencies=[Depends(require_user)])


# ── Models ────────────────────────────────────────────────────────────────

class SkillToolMeta(BaseModel):
    """A skill exposed as an executable tool."""
    name: str
    category: str | None
    description: str | None
    description_zh: str | None = None
    icon: str = "⊞"
    inputs: list[dict[str, Any]] = Field(default_factory=list)
    has_execution: bool = False  # whether the skill has a clear execution flow


class SkillToolListResponse(BaseModel):
    tools: list[SkillToolMeta]
    categories: dict[str, int]  # category → count


class RunToolBody(BaseModel):
    skill_name: str = Field(..., description="skill name")
    params: dict[str, Any] = Field(default_factory=dict, description="user-provided parameters")


# ── Input schema parsing ─────────────────────────────────────────────────

def _parse_inputs_from_body(body: str) -> list[dict[str, Any]]:
    """Extract input definitions from SKILL.md body.

    Looks for patterns like:
      - `{{asin}}` or `{{asin:placeholder}}` template variables
      - Explicit `inputs:` YAML block in frontmatter (preferred)

    Returns list of {name, type, label, required, placeholder, default, options}.
    """
    inputs = []
    seen = set()

    # Pattern 1: {{var}} or {{var:default}} template variables
    for m in re.finditer(r'\{\{(\w+)(?::([^}]*))?\}\}', body):
        name = m.group(1)
        default = m.group(2) or ""
        if name in seen or name in ("end", "else", "endif"):
            continue
        seen.add(name)
        inputs.append({
            "name": name,
            "type": "text",
            "label": name.replace("_", " ").title(),
            "required": not bool(default),
            "placeholder": default or f"Enter {name}",
            "default": default,
        })

    return inputs


def _parse_inputs_from_frontmatter(fm: dict) -> list[dict[str, Any]]:
    """Parse inputs from frontmatter 'inputs' key if present."""
    raw = fm.get("inputs")
    if not isinstance(raw, list):
        return []
    inputs = []
    for item in raw:
        if not isinstance(item, dict):
            continue
        inputs.append({
            "name": item.get("name", ""),
            "type": item.get("type", "text"),
            "label": item.get("label", item.get("name", "")),
            "required": bool(item.get("required", False)),
            "placeholder": item.get("placeholder", ""),
            "default": item.get("default", ""),
            "options": item.get("options", []),
        })
    return [i for i in inputs if i.get("name")]


def _detect_icon(fm: dict, category: str | None) -> str:
    """Pick an icon based on category or frontmatter."""
    if fm.get("icon"):
        return str(fm["icon"])
    cat = (category or "").lower()
    if "amazon" in cat:
        return "◈"
    if "research" in cat:
        return "◎"
    if "creative" in cat:
        return "◇"
    if "devops" in cat or "software" in cat:
        return "⚙"
    if "data" in cat:
        return "▦"
    if "media" in cat:
        return "◉"
    if "mlops" in cat or "inference" in cat:
        return "▣"
    return "⊞"


# ── Endpoints ─────────────────────────────────────────────────────────────

@router.get("/list", response_model=SkillToolListResponse)
def list_tools(
    category: str | None = None,
    q: str | None = None,
) -> SkillToolListResponse:
    """List all skills as executable tools, with parsed input schemas."""
    metas = skill_repo.list_skills()
    tools: list[SkillToolMeta] = []

    for m in metas:
        # Filter
        if category and (m.category or "") != category:
            continue
        if q:
            needle = q.lower()
            if (needle not in m.name.lower()
                and needle not in (m.description or "").lower()
                and needle not in (m.description_zh or "").lower()):
                continue

        # Load full detail to parse inputs
        try:
            detail = skill_repo.get_skill(m.name)
        except Exception:
            continue

        fm = detail.frontmatter
        inputs = _parse_inputs_from_frontmatter(fm)
        if not inputs:
            inputs = _parse_inputs_from_body(detail.content_body)

        has_execution = bool(
            fm.get("inputs")
            or re.search(r'\{\{\w+', detail.content_body)
            or "step" in detail.content_body.lower()[:500]
        )

        tools.append(SkillToolMeta(
            name=m.name,
            category=m.category,
            description=m.description,
            description_zh=m.description_zh,
            icon=_detect_icon(fm, m.category),
            inputs=inputs,
            has_execution=has_execution,
        ))

    # Build category counts
    cats: dict[str, int] = {}
    for t in tools:
        key = t.category or "(uncategorized)"
        cats[key] = cats.get(key, 0) + 1

    return SkillToolListResponse(
        tools=tools,
        categories=dict(sorted(cats.items(), key=lambda kv: (-kv[1], kv[0]))),
    )


@router.post("/run")
async def run_tool(body: RunToolBody) -> StreamingResponse:
    """Execute a skill with user-provided parameters via hermes agent."""
    # Load skill
    try:
        detail = skill_repo.get_skill(body.skill_name)
    except Exception as exc:
        raise HTTPException(404, f"Skill not found: {exc}")

    # Build prompt from skill body + user params
    skill_body = detail.content_body
    params_section = "\n".join(
        f"- {k}: {v}" for k, v in body.params.items() if v
    )

    prompt = f"""请执行以下 Skill：

## Skill: {detail.name}
{skill_body}

## 用户提供的参数
{params_section if params_section else "（无额外参数）"}

请按照 Skill 中的步骤执行，输出结果。"""

    # Stream via hermes agent
    from app.services import ai_synthesis_service

    async def generator():
        start = time.time()
        yield f'data: {json.dumps({"type": "phase", "phase": "executing"}, ensure_ascii=False)}\n\n'
        try:
            async for prov, chunk in ai_synthesis_service.synthesize_native(
                "keyword", prompt, "US"
            ):
                if prov == "_attempt":
                    yield f'data: {json.dumps({"type": "attempt", "provider": chunk}, ensure_ascii=False)}\n\n'
                elif prov == "error":
                    yield f'data: {json.dumps({"type": "error", "detail": chunk}, ensure_ascii=False)}\n\n'
                    return
                else:
                    yield f'data: {json.dumps({"type": "token", "text": chunk, "provider": prov}, ensure_ascii=False)}\n\n'
            elapsed = round(time.time() - start, 1)
            yield f'data: {json.dumps({"type": "done", "provider": "hermes", "elapsed_s": elapsed}, ensure_ascii=False)}\n\n'
        except Exception as exc:
            yield f'data: {json.dumps({"type": "error", "detail": str(exc)}, ensure_ascii=False)}\n\n'

    return StreamingResponse(
        generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
