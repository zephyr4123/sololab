"""模块管理与执行的 API 路由。"""

import json
from dataclasses import asdict
from typing import Any

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse

from sololab.core.module_registry import ModuleRequest
from sololab.models.module import ModuleRunRequest

router = APIRouter()


@router.get("/modules")
async def list_modules(request: Request) -> list[dict[str, Any]]:
    """列出所有已加载的模块。"""
    registry = request.app.state.module_registry
    return [asdict(m) for m in registry.list_modules()]


@router.post("/modules/{module_id}/load")
async def load_module(module_id: str, request: Request) -> dict:
    """根据 ID 加载模块（从文件系统发现）。"""
    from sololab.main import _build_module_context

    registry = request.app.state.module_registry
    existing = registry.get_module(module_id)
    if existing:
        return {"status": "already_loaded", "module_id": module_id}

    available = registry.discover_modules()
    if module_id not in available:
        raise HTTPException(404, f"Module '{module_id}' not found in available modules")

    info = available[module_id]
    try:
        cls = registry.load_module_class(info["entry_point"])
        ctx = _build_module_context(request.app)
        await registry.load_module(cls(), ctx)
        return {"status": "loaded", "module_id": module_id}
    except Exception as e:
        raise HTTPException(500, f"Failed to load module '{module_id}': {e}")


@router.delete("/modules/{module_id}/unload")
async def unload_module(module_id: str, request: Request) -> dict:
    """卸载模块。"""
    registry = request.app.state.module_registry
    if not registry.get_module(module_id):
        raise HTTPException(404, f"Module '{module_id}' not loaded")
    await registry.unload_module(module_id)
    return {"status": "unloaded", "module_id": module_id}


@router.get("/modules/{module_id}/config")
async def get_module_config(module_id: str, request: Request) -> dict:
    """获取模块配置。"""
    registry = request.app.state.module_registry
    module = registry.get_module(module_id)
    if not module:
        raise HTTPException(404, f"Module '{module_id}' not found")
    manifest = module.manifest()
    return asdict(manifest)


@router.post("/modules/{module_id}/run")
async def run_module(module_id: str, body: ModuleRunRequest, request: Request) -> dict:
    """同步模块执行（收集所有结果后返回）。"""
    from sololab.main import _build_module_context

    registry = request.app.state.module_registry
    if not registry.get_module(module_id):
        raise HTTPException(404, f"Module '{module_id}' not loaded")

    ctx = _build_module_context(request.app)
    mod_request = ModuleRequest(input=body.input, params=body.params or {})
    results = []
    async for chunk in registry.run(module_id, mod_request, ctx):
        results.append(chunk)
    return {"module_id": module_id, "results": results}


@router.post("/modules/{module_id}/stream")
async def stream_module(module_id: str, body: ModuleRunRequest, request: Request) -> StreamingResponse:
    """SSE 流式模块执行，带任务状态追踪。"""
    from sololab.main import _build_module_context

    registry = request.app.state.module_registry
    tsm = request.app.state.task_state_manager

    if not registry.get_module(module_id):
        raise HTTPException(404, f"Module '{module_id}' not loaded")

    task_id = await tsm.create_task(module_id, {"input": body.input})
    ctx = _build_module_context(request.app)
    mod_request = ModuleRequest(input=body.input, params=body.params or {})

    async def event_generator():
        yield f"data: {json.dumps({'type': 'task_created', 'task_id': task_id})}\n\n"
        try:
            async for chunk in registry.run(module_id, mod_request, ctx):
                event_data = chunk if isinstance(chunk, dict) else {"content": str(chunk)}
                await tsm.append_event(task_id, event_data.get("type", "text"), event_data)
                yield f"data: {json.dumps(event_data)}\n\n"
            await tsm.complete_task(task_id, {})
            yield f"data: {json.dumps({'type': 'done', 'task_id': task_id})}\n\n"
        except Exception as e:
            await tsm.fail_task(task_id, str(e))
            yield f"data: {json.dumps({'type': 'error', 'error': str(e)})}\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")


@router.post("/modules/{module_id}/stop")
async def stop_module(module_id: str, request: Request) -> dict:
    """停止正在运行的模块执行。"""
    # TODO: 通过 task_id 取消具体任务
    return {"status": "stopped", "module_id": module_id}
