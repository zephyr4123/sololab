"""CodeLab session proxy — backend owns session metadata, forwards to OpenCode.

Flow:
  Frontend → Backend (this file) → OpenCode (HTTP) + PostgreSQL (metadata)
  SSE streaming runs frontend-direct to OpenCode and does not pass through here.
"""

import logging
from typing import Optional

import httpx
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from sololab.api._deps import AuthDep
from sololab.config.settings import get_settings

logger = logging.getLogger(__name__)
router = APIRouter(dependencies=[AuthDep])

settings = get_settings()
OPENCODE_URL = settings.opencode_url  # docker-compose 中为 http://opencode:3100
WORKSPACE_DIR = settings.workspace_dir  # 宿主机路径，如 /Users/xxx/coding


def _to_container_path(host_path: str) -> str:
    """宿主机路径 → 容器 /workspace/ 路径（本地开发时原样返回）。"""
    if WORKSPACE_DIR and host_path.startswith(WORKSPACE_DIR):
        return "/workspace" + host_path[len(WORKSPACE_DIR):]
    return host_path


async def _oc_request(method: str, path: str, **kwargs) -> dict | list | bool:
    """调用 OpenCode HTTP API。"""
    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.request(method, f"{OPENCODE_URL}{path}", **kwargs)
        resp.raise_for_status()
        return resp.json()


# ─── GET /api/codelab/sessions ────────────────────────────────────────────────

@router.get("/codelab/sessions")
async def list_codelab_sessions(
    request: Request,
    directory: Optional[str] = None,
) -> list[dict]:
    """列出 CodeLab 会话（从 OpenCode 拉取，同步元数据到 PG）。"""
    # 1) 调 OpenCode 获取 sessions
    params = {"roots": "true"}
    if directory:
        params["directory"] = _to_container_path(directory)
    try:
        oc_sessions = await _oc_request("GET", "/session", params=params)
    except httpx.HTTPError as e:
        logger.warning("OpenCode session 列表失败: %s", e)
        raise HTTPException(502, f"OpenCode unreachable: {e}")

    if not isinstance(oc_sessions, list):
        return []

    # 2) 同步到 PG（upsert）
    session_mgr = request.app.state.session_manager
    if session_mgr:
        for s in oc_sessions:
            try:
                await session_mgr.upsert_codelab_session(
                    opencode_session_id=s["id"],
                    title=s.get("title", "Untitled"),
                )
            except Exception as e:
                logger.warning("PG 同步失败 oc_id=%s: %s", s.get("id"), e)

    # 3) 返回统一格式
    return [
        {
            "id": s["id"],
            "title": s.get("title", "Untitled"),
            "directory": s.get("directory"),
            "createdAt": s.get("time", {}).get("created"),
            "updatedAt": s.get("time", {}).get("updated"),
        }
        for s in oc_sessions
    ]


# ─── POST /api/codelab/sessions ──────────────────────────────────────────────

class CreateSessionBody(BaseModel):
    directory: str


@router.post("/codelab/sessions")
async def create_codelab_session(
    request: Request,
    body: CreateSessionBody,
) -> dict:
    """创建 CodeLab 会话（OpenCode + PG 双写）。"""
    # 1) 调 OpenCode 创建 session
    try:
        container_dir = _to_container_path(body.directory)
        oc_session = await _oc_request(
            "POST",
            f"/session?directory={container_dir}",
            json={},
        )
    except httpx.HTTPError as e:
        raise HTTPException(502, f"OpenCode session creation failed: {e}")

    # 2) PG 创建元数据
    session_mgr = request.app.state.session_manager
    if session_mgr:
        await session_mgr.upsert_codelab_session(
            opencode_session_id=oc_session["id"],
            title=oc_session.get("title", "New session"),
        )

    return {
        "id": oc_session["id"],
        "title": oc_session.get("title"),
        "directory": oc_session.get("directory"),
    }


# ─── DELETE /api/codelab/sessions/{oc_session_id} ────────────────────────────

@router.delete("/codelab/sessions/{oc_session_id}")
async def delete_codelab_session(
    request: Request,
    oc_session_id: str,
) -> dict:
    """删除 CodeLab 会话（OpenCode + PG 双删）。

    返回真实的双删状态供前端判断：
    - status='ok'      —— OpenCode + PG 都成功（404 视为 OpenCode 已删）
    - status='partial' —— OpenCode 删除失败（非 404），PG 此时**不动**，
                          因为下次 GET 会从 OpenCode 把这条 upsert 回 PG，
                          删 PG 会造成"删除成功 → 刷新复活"的幽灵体验。
                          前端应当 toast 提示"OpenCode 暂时不可达，稍后重试"。
    """
    # 1) 调 OpenCode 删除；404 视为已删除（容器重建后 session 自然不在）
    opencode_deleted = False
    opencode_error: Optional[str] = None
    try:
        await _oc_request("DELETE", f"/session/{oc_session_id}")
        opencode_deleted = True
    except httpx.HTTPStatusError as e:
        if e.response.status_code == 404:
            opencode_deleted = True  # idempotent: already gone
        else:
            opencode_error = f"HTTP {e.response.status_code}"
            logger.warning("OpenCode session 删除失败: %s", e)
    except httpx.HTTPError as e:
        opencode_error = str(e) or type(e).__name__
        logger.warning("OpenCode session 删除失败: %s", e)

    # 2) 只在 OpenCode 已删的前提下才删 PG。否则保留 PG 行让用户重试看到。
    pg_deleted = False
    if opencode_deleted:
        session_mgr = request.app.state.session_manager
        if session_mgr:
            pg_deleted = await session_mgr.delete_by_opencode_id(oc_session_id)

    return {
        "id": oc_session_id,
        "status": "ok" if opencode_deleted else "partial",
        "opencode_deleted": opencode_deleted,
        "pg_deleted": pg_deleted,
        "opencode_error": opencode_error,
    }


# ─── GET /api/codelab/skills ─────────────────────────────────────────────────

@router.get("/codelab/skills")
async def list_codelab_skills() -> list[dict]:
    """列出 CodeLab 可用的 Skills（从 OpenCode 拉取）。"""
    try:
        skills = await _oc_request("GET", "/skill")
    except httpx.HTTPError as e:
        logger.warning("OpenCode skills 列表失败: %s", e)
        return []

    if not isinstance(skills, list):
        return []

    return [
        {
            "name": s.get("name", ""),
            "description": s.get("description", ""),
        }
        for s in skills
    ]
