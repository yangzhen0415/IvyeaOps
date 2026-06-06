"""Filesystem layout for Skill Studio.

Two roots are kept strictly separate:

  SKILLS_ROOT  = ~/.hermes/skills/
      The real skills the Hermes runtime loads. We only read/write actual
      skill directories here (no hidden metadata dirs). This keeps the
      Hermes skill scanner blind to our bookkeeping.

  STUDIO_ROOT  = ~/.hermes/skill-studio/
      All Studio state lives here — snapshots, trash, settings, audit log.
      Completely outside the scanner's path.

Both paths are override-able via env vars for tests; production just uses
the defaults.
"""
from __future__ import annotations

import os
from pathlib import Path


# --- Roots -----------------------------------------------------------------

# Allow overrides in tests; fall back to ~/.hermes/... in production.
_HERMES_HOME = Path(
    os.getenv("HERMES_HOME", str(Path.home() / ".hermes"))
).resolve()

SKILLS_ROOT: Path = Path(
    os.getenv("IVYEA_OPS_SKILLS_ROOT", str(_HERMES_HOME / "skills"))
).resolve()

STUDIO_ROOT: Path = Path(
    os.getenv("IVYEA_OPS_STUDIO_ROOT", str(_HERMES_HOME / "skill-studio"))
).resolve()


# --- Studio sub-paths ------------------------------------------------------

SNAPSHOTS_DIR: Path = STUDIO_ROOT / "snapshots"
TRASH_DIR: Path = STUDIO_ROOT / "trash"
SETTINGS_FILE: Path = STUDIO_ROOT / "settings.json"
AUDIT_LOG_FILE: Path = STUDIO_ROOT / "audit.log"


# Skills bundled with the repo (shipped so fresh installs have the Amazon
# audit / listing skills the boards depend on, even without a pre-existing
# Hermes skill library). server/app/core/skill_paths.py → parents[3] = repo root.
BUNDLED_SKILLS: Path = (Path(__file__).resolve().parents[3] / "skills").resolve()


def seed_bundled_skills() -> int:
    """Copy repo-bundled skills into SKILLS_ROOT, never overwriting an existing
    skill. Returns how many were newly seeded. Runs on every startup (cheap +
    idempotent), so install.sh / install.ps1 / Docker / manual all get them."""
    import shutil
    if not BUNDLED_SKILLS.is_dir():
        return 0
    SKILLS_ROOT.mkdir(parents=True, exist_ok=True)
    seeded = 0
    for skill_md in BUNDLED_SKILLS.rglob("SKILL.md"):
        rel = skill_md.parent.relative_to(BUNDLED_SKILLS)
        dest = SKILLS_ROOT / rel
        if dest.exists():
            continue
        dest.parent.mkdir(parents=True, exist_ok=True)
        try:
            shutil.copytree(skill_md.parent, dest)
            seeded += 1
        except Exception:
            pass
    return seeded


# --- Setup -----------------------------------------------------------------

def ensure_studio_dirs() -> None:
    """Create Studio directories on startup. Idempotent.

    Also seeds the repo-bundled skills into SKILLS_ROOT (no-clobber) so fresh
    installs have the skills the ASIN/ad audit + Listing boards require.
    """
    STUDIO_ROOT.mkdir(parents=True, exist_ok=True)
    SNAPSHOTS_DIR.mkdir(parents=True, exist_ok=True)
    TRASH_DIR.mkdir(parents=True, exist_ok=True)
    # settings.json and audit.log are created on first write.
    try:
        n = seed_bundled_skills()
        if n:
            import logging
            logging.getLogger(__name__).info("seeded %d bundled skill(s) into %s", n, SKILLS_ROOT)
    except Exception:
        pass


def studio_paths_summary() -> dict[str, str]:
    """Debug helper: return current path layout for logging."""
    return {
        "skills_root": str(SKILLS_ROOT),
        "skills_root_exists": str(SKILLS_ROOT.exists()),
        "studio_root": str(STUDIO_ROOT),
        "snapshots_dir": str(SNAPSHOTS_DIR),
        "trash_dir": str(TRASH_DIR),
        "settings_file": str(SETTINGS_FILE),
        "audit_log": str(AUDIT_LOG_FILE),
    }
