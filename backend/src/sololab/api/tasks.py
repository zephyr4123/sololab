"""任务状态管理的 API 路由（断线恢复）。"""

from fastapi import APIRouter, HTTPException, Request

router = APIRouter()


@router.get("/tasks/{task_id}/state")
async def get_task_state(task_id: str, request: Request) -> dict:
    """获取任务状态快照。"""
    tsm = request.app.state.task_state_manager
    state = await tsm.get_task_state(task_id)
    if not state:
        raise HTTPException(404, f"Task '{task_id}' not found")
    return state


@router.get("/tasks/{task_id}/events")
async def get_task_events(task_id: str, request: Request, after: int = 0) -> dict:
    """获取指定 event_id 之后的事件（用于断线恢复）。"""
    tsm = request.app.state.task_state_manager
    state = await tsm.get_task_state(task_id)
    if not state:
        raise HTTPException(404, f"Task '{task_id}' not found")
    events = await tsm.get_events_after(task_id, after)
    return {"task_id": task_id, "events": events}


@router.post("/tasks/{task_id}/resume")
async def resume_task(task_id: str, request: Request):
    """为运行中的任务重建 SSE 连接。"""
    # TODO: 从当前 event_id 恢复 SSE 流
    raise HTTPException(501, "Resume not yet implemented")


@router.delete("/tasks/{task_id}")
async def cancel_task(task_id: str, request: Request) -> dict:
    """取消正在运行的任务。"""
    tsm = request.app.state.task_state_manager
    state = await tsm.get_task_state(task_id)
    if not state:
        raise HTTPException(404, f"Task '{task_id}' not found")
    await tsm.cancel_task(task_id)
    return {"status": "cancelled", "task_id": task_id}
