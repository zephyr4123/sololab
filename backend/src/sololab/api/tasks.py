"""任务状态管理的 API 路由（断线恢复）。"""

from fastapi import APIRouter, HTTPException

router = APIRouter()


@router.get("/tasks/{task_id}/state")
async def get_task_state(task_id: str) -> dict:
    """获取任务状态快照。"""
    # TODO: 注入 TaskStateManager 依赖
    raise HTTPException(404, f"Task '{task_id}' not found")


@router.get("/tasks/{task_id}/events")
async def get_task_events(task_id: str, after: int = 0) -> dict:
    """获取指定 event_id 之后的事件（用于断线恢复）。"""
    # TODO: 从 TaskStateManager 获取事件
    return {"task_id": task_id, "events": []}


@router.post("/tasks/{task_id}/resume")
async def resume_task(task_id: str):
    """为运行中的任务重建 SSE 连接。"""
    # TODO: 从当前 event_id 恢复 SSE 流
    raise HTTPException(501, "Not implemented")


@router.delete("/tasks/{task_id}")
async def cancel_task(task_id: str) -> dict:
    """取消正在运行的任务。"""
    # TODO: 通过 TaskStateManager 取消
    return {"status": "cancelled", "task_id": task_id}
