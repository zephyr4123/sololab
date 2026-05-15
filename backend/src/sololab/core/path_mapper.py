"""Workspace path mapping — bridge between host and Docker container.

Two directions, both anchored on ``settings.workspace_dir`` (the host directory
mounted at ``/workspace`` inside the OpenCode and backend containers):

    to_container(host) →  /workspace/...   # forward
    to_host(container) →  /Users/.../...   # reverse, for display

When ``workspace_dir`` is empty (local dev without bind-mounts) both functions
return the input unchanged — production and CI go through the mapped form,
local hacking just passes through.

Two callers share this module:
- ``api/codelab.py`` proxies session CRUD to OpenCode (forward only)
- ``api/codelab_browse.py`` browses /workspace and reports host paths back (both)

Keeping the logic here lets either route be tweaked without two-place edits.
"""

from __future__ import annotations

from sololab.config.settings import get_settings

MOUNT_ROOT = "/workspace"


def _workspace_dir() -> str:
    """Read ``WORKSPACE_DIR`` fresh each call — settings is cached, but tests
    occasionally monkey-patch it; honouring that beats a module-level constant."""
    return get_settings().workspace_dir or ""


def to_container(host_path: str) -> str:
    """Translate a host filesystem path to its container-visible counterpart.

    If ``workspace_dir`` is unset or the path doesn't fall inside it, the path
    is returned untouched — the caller is responsible for any further checks.
    """
    ws = _workspace_dir()
    if ws and host_path.startswith(ws):
        return MOUNT_ROOT + host_path[len(ws):]
    return host_path


def to_host(container_path: str | None) -> str | None:
    """Reverse of :func:`to_container` for display back to the browser.

    Returns ``None`` unchanged so callers can treat "no parent" uniformly.
    """
    if container_path is None:
        return None
    ws = _workspace_dir()
    if ws and container_path.startswith(MOUNT_ROOT):
        return ws + container_path[len(MOUNT_ROOT):]
    return container_path
