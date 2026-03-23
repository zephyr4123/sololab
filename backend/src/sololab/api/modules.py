"""模块管理与执行的 API 路由。"""

import json
from dataclasses import asdict
from typing import Any, List, Optional

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from sololab.core.module_registry import ModuleRequest
from sololab.models.module import ModuleRunRequest

router = APIRouter()


class ReportIdea(BaseModel):
    """报告中的创意条目。"""
    content: str
    author: str = "unknown"
    elo_score: float = 1500
    rank: int = 0


class ReportRequest(BaseModel):
    """报告生成请求 — 接收已有的 top ideas，无需重跑模块。"""
    topic: str
    ideas: List[ReportIdea]
    cost_usd: float = 0.0


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


@router.post("/modules/{module_id}/report")
async def export_report(module_id: str, body: ReportRequest, request: Request) -> dict:
    """将已生成的 top ideas 导出为 Markdown 报告。

    接收前端传来的 ideas 列表，通过 LLM 生成结构化报告。
    不会重新执行模块流程。
    """
    from sololab.main import _build_module_context

    registry = request.app.state.module_registry
    if not registry.get_module(module_id):
        raise HTTPException(404, f"Module '{module_id}' not loaded")

    if not body.ideas:
        raise HTTPException(400, "No ideas provided. Run the module first and submit top ideas.")

    if not body.topic.strip():
        raise HTTPException(400, "Topic cannot be empty.")

    ctx = _build_module_context(request.app)
    llm = ctx.llm_gateway

    # 构建创意文本
    ideas_text = "\n".join(
        f"### Rank #{idea.rank}: (Elo {round(idea.elo_score)})\n"
        f"**Author:** {idea.author}\n\n"
        f"{idea.content}\n"
        for idea in sorted(body.ideas, key=lambda x: x.rank)
    )

    report_prompt = (
        f"Generate a comprehensive research ideation report in Markdown format.\n\n"
        f"## Topic\n{body.topic}\n\n"
        f"## Top Ideas\n{ideas_text}\n\n"
        f"Write a well-structured report with:\n"
        f"1. Executive Summary\n"
        f"2. Methodology (multi-agent collaborative ideation)\n"
        f"3. Top Research Ideas (with analysis)\n"
        f"4. Recommended Next Steps\n"
        f"5. References & Further Reading\n\n"
        f"Use proper Markdown formatting with headers, bullet points, and emphasis."
    )

    result = await llm.generate(
        messages=[{"role": "user", "content": report_prompt}],
        temperature=0.3,
        max_tokens=4096,
    )

    return {
        "module_id": module_id,
        "topic": body.topic,
        "report_markdown": result["content"],
        "idea_count": len(body.ideas),
        "cost_usd": body.cost_usd + result["usage"].get("cost_usd", 0),
    }
