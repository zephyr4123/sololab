"""CodeLab 目录浏览 — 独立端点（不依赖模块系统）。"""

import os

from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter(prefix="/modules/codelab")

MOUNT_ROOT = "/workspace"
PROJECT_MARKERS = [
    ".git", "package.json", "pyproject.toml",
    "Cargo.toml", "go.mod", "pom.xml", "Makefile",
]


class BrowseRequest(BaseModel):
    path: str = "~"


@router.post("/browse")
async def browse_directories(body: BrowseRequest) -> dict:
    """Browse workspace directories (mounted at /workspace from WORKSPACE_DIR)."""
    workspace_dir = os.environ.get("WORKSPACE_DIR", "")
    raw_path = body.path

    try:
        if raw_path == "~" or raw_path == workspace_dir:
            target = MOUNT_ROOT
        elif workspace_dir and raw_path.startswith(workspace_dir):
            target = MOUNT_ROOT + raw_path[len(workspace_dir):]
        elif raw_path.startswith(MOUNT_ROOT):
            target = raw_path
        elif os.path.exists(raw_path):
            target = raw_path
        else:
            target = MOUNT_ROOT

        target = os.path.abspath(target)
        if not target.startswith(MOUNT_ROOT):
            target = MOUNT_ROOT

        def to_host_path(cp: str) -> str:
            if cp.startswith(MOUNT_ROOT):
                return (workspace_dir + cp[len(MOUNT_ROOT):]) if workspace_dir else cp
            return cp

        entries = []
        for name in sorted(os.listdir(target)):
            if name.startswith("."):
                continue
            full = os.path.join(target, name)
            if os.path.isdir(full):
                is_project = any(
                    os.path.exists(os.path.join(full, m)) for m in PROJECT_MARKERS
                )
                entries.append({
                    "name": name,
                    "path": to_host_path(full),
                    "type": "directory",
                    "isProject": is_project,
                })

        parent = os.path.dirname(target) if target not in ("/", MOUNT_ROOT) else None

        return {
            "type": "browse",
            "path": to_host_path(target),
            "parent": to_host_path(parent) if parent else None,
            "entries": entries,
        }
    except (OSError, PermissionError) as e:
        return {"type": "browse", "path": raw_path, "parent": None, "entries": [], "error": str(e)}
