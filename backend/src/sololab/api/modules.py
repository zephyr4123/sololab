"""模块管理与执行的 API 路由。"""

import json
from typing import Any

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse

from sololab.models.module import ModuleRunRequest

router = APIRouter()


@router.get("/modules")
async def list_modules() -> list[dict[str, Any]]:
    """列出所有已加载的模块。"""
    # TODO: 注入 ModuleRegistry 依赖
    return []


@router.post("/modules/{module_id}/load")
async def load_module(module_id: str) -> dict:
    """根据 ID 加载模块。"""
    # TODO: 通过 ModuleRegistry 从文件系统加载模块
    return {"status": "loaded", "module_id": module_id}


@router.delete("/modules/{module_id}/unload")
async def unload_module(module_id: str) -> dict:
    """卸载模块。"""
    # TODO: 通过 ModuleRegistry 卸载
    return {"status": "unloaded", "module_id": module_id}


@router.get("/modules/{module_id}/config")
async def get_module_config(module_id: str) -> dict:
    """获取模块配置。"""
    # TODO: 从注册表返回模块配置
    raise HTTPException(404, f"Module '{module_id}' not found")


@router.post("/modules/{module_id}/run")
async def run_module(module_id: str, request: ModuleRunRequest) -> dict:
    """同步模块执行。"""
    # TODO: 执行模块并收集所有结果
    raise HTTPException(501, "Not implemented")


@router.post("/modules/{module_id}/stream")
async def stream_module(module_id: str, request: ModuleRunRequest) -> StreamingResponse:
    """SSE 流式模块执行，带任务状态追踪。"""

    # TODO: 创建任务、执行模块、流式推送事件
    async def event_generator():
        # 占位 - 后续将产生 SSE 事件
        yield f"data: {json.dumps({'type': 'status', 'status': 'starting'})}\n\n"
        yield f"data: {json.dumps({'type': 'done'})}\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")


@router.post("/modules/{module_id}/stop")
async def stop_module(module_id: str) -> dict:
    """停止正在运行的模块执行。"""
    # TODO: 通过 TaskStateManager 取消任务
    return {"status": "stopped", "module_id": module_id}
