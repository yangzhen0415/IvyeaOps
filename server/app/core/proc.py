"""Cross-platform subprocess helpers.

On Windows, spawning a console program (hermes / codex / claude / gbrain / npm /
git …) pops a visible console window unless CREATE_NO_WINDOW is set. Merge
``no_window_kwargs()`` into every external-tool spawn so those calls run silently
in the background instead of flashing a black box on the user's desktop.

It is a no-op on Linux/macOS (returns {}), so it is always safe to add — even to
POSIX-only spawns that also pass ``start_new_session=True`` (Windows ignores that
flag, and on POSIX this helper contributes nothing).
"""
from __future__ import annotations

import subprocess
import sys

# subprocess.CREATE_NO_WINDOW exists only on the Windows build of the stdlib.
_CREATE_NO_WINDOW = getattr(subprocess, "CREATE_NO_WINDOW", 0x08000000)


def no_window_kwargs() -> dict:
    """kwargs to merge into subprocess.run / Popen / asyncio.create_subprocess_exec
    so the child process has no visible console window on Windows. {} elsewhere."""
    if sys.platform == "win32":
        return {"creationflags": _CREATE_NO_WINDOW}
    return {}
