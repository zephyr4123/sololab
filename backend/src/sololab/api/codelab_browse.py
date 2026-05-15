"""CodeLab directory browsing — standalone endpoint (no module-system dependency).

Browses the workspace mount (``/workspace`` inside the container, mapped to the
host ``WORKSPACE_DIR``). All paths sent in or out are the host-shaped form so
the browser can hand them straight back to the OpenCode SSE client.
"""

import os

from fastapi import APIRouter
from pydantic import BaseModel

from sololab.api._deps import AuthDep
from sololab.core.path_mapper import MOUNT_ROOT, to_container, to_host

router = APIRouter(prefix="/modules/codelab", dependencies=[AuthDep])

PROJECT_MARKERS = (
    ".git", "package.json", "pyproject.toml",
    "Cargo.toml", "go.mod", "pom.xml", "Makefile",
)


class BrowseRequest(BaseModel):
    path: str = "~"


def _resolve_target(raw_path: str) -> str:
    """Map an inbound path (host shape, ``~``, or already-container) to a
    container path, then clamp it inside ``MOUNT_ROOT``.

    The three matching arms cover:
      - the sentinel ``~`` for "workspace root"
      - a host path that lives under ``WORKSPACE_DIR`` → translate via mapper
      - any other path that happens to exist (manual entry, sub-traversal)

    Anything escaping ``MOUNT_ROOT`` after ``os.path.abspath`` is reset to the
    mount root — the sandbox is non-negotiable.
    """
    if raw_path == "~":
        target = MOUNT_ROOT
    else:
        mapped = to_container(raw_path)
        if mapped.startswith(MOUNT_ROOT):
            target = mapped
        elif os.path.exists(raw_path):
            target = raw_path
        else:
            target = MOUNT_ROOT

    target = os.path.abspath(target)
    if not target.startswith(MOUNT_ROOT):
        target = MOUNT_ROOT
    return target


@router.post("/browse")
async def browse_directories(body: BrowseRequest) -> dict:
    """Browse workspace directories (mounted at /workspace from WORKSPACE_DIR)."""
    try:
        target = _resolve_target(body.path)

        entries = []
        for name in sorted(os.listdir(target)):
            if name.startswith("."):
                continue
            full = os.path.join(target, name)
            if not os.path.isdir(full):
                continue
            is_project = any(
                os.path.exists(os.path.join(full, m)) for m in PROJECT_MARKERS
            )
            entries.append({
                "name": name,
                "path": to_host(full),
                "type": "directory",
                "isProject": is_project,
            })

        parent = os.path.dirname(target) if target not in ("/", MOUNT_ROOT) else None

        return {
            "type": "browse",
            "path": to_host(target),
            "parent": to_host(parent),
            "entries": entries,
        }
    except (OSError, PermissionError) as e:
        return {"type": "browse", "path": body.path, "parent": None, "entries": [], "error": str(e)}
