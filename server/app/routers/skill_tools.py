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
    pinned: bool = False         # pinned skills get their own sidebar entry


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
            pinned=bool(getattr(m, "pinned", False)),
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


@router.get("/pinned", response_model=list[SkillToolMeta])
def list_pinned_tools() -> list[SkillToolMeta]:
    """Pinned skills only — drives the dynamic sidebar entries. Cheap: no body parse."""
    out: list[SkillToolMeta] = []
    for m in skill_repo.list_skills():
        if not getattr(m, "pinned", False):
            continue
        try:
            detail = skill_repo.get_skill(m.name)
            fm = detail.frontmatter
            inputs = _parse_inputs_from_frontmatter(fm) or _parse_inputs_from_body(detail.content_body)
            icon = _detect_icon(fm, m.category)
        except Exception:
            fm, inputs, icon = {}, [], "⊞"
        out.append(SkillToolMeta(
            name=m.name, category=m.category, description=m.description,
            description_zh=m.description_zh, icon=icon, inputs=inputs,
            has_execution=True, pinned=True,
        ))
    return out


class PinBody(BaseModel):
    skill_name: str
    pinned: bool


@router.post("/pin", response_model=SkillToolMeta)
def pin_tool(body: PinBody) -> SkillToolMeta:
    """Pin/unpin a skill so it shows (or hides) as a dedicated sidebar tool."""
    try:
        skill_repo.set_pinned(body.skill_name, body.pinned)
        detail = skill_repo.get_skill(body.skill_name)
    except Exception as exc:
        raise HTTPException(404, f"Skill not found: {exc}")
    fm = detail.frontmatter
    inputs = _parse_inputs_from_frontmatter(fm) or _parse_inputs_from_body(detail.content_body)
    return SkillToolMeta(
        name=detail.name, category=detail.category, description=detail.description,
        description_zh=detail.description_zh, icon=_detect_icon(fm, detail.category),
        inputs=inputs, has_execution=True, pinned=bool(body.pinned),
    )


_ANSI_RE = re.compile(r"\x1B\[[0-?]*[ -/]*[@-~]")


async def _run_skill_agent(skill_basename: str, params: dict, skill_body: str):
    """Execute a skill through a real hermes agent (`hermes -z --skills <name>`).

    Unlike the old path (which fed the SKILL.md as a plain prompt to the
    market-research synthesizer), this preloads the actual skill so hermes can
    follow its steps and use its tools. Streams stdout token-by-token.
    """
    import asyncio
    from app.services.runners import _find_bin, build_child_env

    binary = _find_bin("hermes")
    if not binary:
        yield ("error", "hermes CLI 不可用")
        return

    params_section = "\n".join(f"- {k}: {v}" for k, v in params.items() if v)
    prompt = (
        f"请执行 skill「{skill_basename}」。\n\n"
        f"## 用户提供的参数\n{params_section or '（无额外参数）'}\n\n"
        "按该 skill 定义的步骤执行并输出结果。"
    )

    env = build_child_env(binary)
    env.setdefault("TERM", "dumb")
    env.setdefault("NO_COLOR", "1")
    env["HERMES_ACCEPT_HOOKS"] = "1"

    # -z one-shot, --skills preloads the skill, --yolo auto-approves tool use
    # so an interactive prompt never blocks the web request.
    argv = [binary, "-z", prompt, "--skills", skill_basename, "--yolo"]
    proc = await asyncio.create_subprocess_exec(
        *argv, stdin=asyncio.subprocess.DEVNULL,
        stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.DEVNULL,
        cwd="/root", env=env,
    )

    loop = asyncio.get_running_loop()
    deadline = loop.time() + 600
    read_task = asyncio.create_task(proc.stdout.read(4096))
    got = False
    try:
        while True:
            remaining = deadline - loop.time()
            if remaining <= 0:
                yield ("error", "执行超时（>600s）")
                break
            done, _ = await asyncio.wait([read_task], timeout=min(remaining, 30))
            if not done:
                if proc.returncode is not None:
                    read_task.cancel()
                    break
                continue
            chunk = read_task.result()
            if not chunk:
                break
            text = _ANSI_RE.sub("", chunk.decode("utf-8", errors="replace"))
            if text:
                got = True
                yield ("hermes", text)
            read_task = asyncio.create_task(proc.stdout.read(4096))
    finally:
        if not read_task.done():
            read_task.cancel()
        if proc.returncode is None:
            proc.kill()
            try:
                await asyncio.wait_for(proc.communicate(), timeout=5)
            except Exception:
                pass
    if not got:
        yield ("error", "skill 执行无输出（可能 skill 名不匹配或 hermes 配置异常）")


@router.post("/run")
async def run_tool(body: RunToolBody) -> StreamingResponse:
    """Execute a skill with user-provided parameters via a real hermes agent."""
    try:
        detail = skill_repo.get_skill(body.skill_name)
    except Exception as exc:
        raise HTTPException(404, f"Skill not found: {exc}")

    # hermes --skills expects the skill's basename (last path segment).
    skill_basename = detail.name.rsplit("/", 1)[-1]

    async def generator():
        start = time.time()
        yield f'data: {json.dumps({"type": "phase", "phase": "executing"}, ensure_ascii=False)}\n\n'
        try:
            async for prov, chunk in _run_skill_agent(skill_basename, body.params, detail.content_body):
                if prov == "error":
                    yield f'data: {json.dumps({"type": "error", "detail": chunk}, ensure_ascii=False)}\n\n'
                    return
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
