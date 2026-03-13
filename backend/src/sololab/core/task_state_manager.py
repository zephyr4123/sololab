"""任务状态管理器 - 基于 Redis 的任务状态持久化，支持断线恢复。"""

import json
import time
import uuid
from enum import Enum
from typing import Dict, List, Optional

import redis.asyncio as aioredis
from pydantic import BaseModel


class TaskStatus(str, Enum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class TaskEvent(BaseModel):
    """带序列号的任务事件。"""

    event_id: int
    type: str  # text | agent | tool | status | done | error
    data: dict
    timestamp: float


class TaskState(BaseModel):
    """任务状态快照。"""

    task_id: str
    module_id: str
    status: TaskStatus
    total_events: int = 0
    created_at: float
    updated_at: float = 0.0


class TaskStateManager:
    """基于 Redis 的任务状态持久化。
    - 每个 SSE 事件写入 Redis Stream，带递增 event_id
    - 前端通过 event_id 游标重连，获取错过的事件
    - 已完成任务可选持久化到 PostgreSQL
    """

    TTL = 3600 * 24  # 24 hours

    def __init__(self, redis: aioredis.Redis) -> None:
        self.redis = redis

    async def create_task(self, module_id: str, request: dict) -> str:
        """创建新任务，返回 task_id。"""
        task_id = str(uuid.uuid4())
        state = {
            "task_id": task_id,
            "module_id": module_id,
            "status": TaskStatus.PENDING.value,
            "request": json.dumps(request),
            "created_at": str(time.time()),
        }
        await self.redis.hset(f"task:{task_id}", mapping=state)
        await self.redis.expire(f"task:{task_id}", self.TTL)
        return task_id

    async def append_event(self, task_id: str, event_type: str, data: dict) -> int:
        """追加事件到 Redis Stream，返回 event_id。"""
        event_id = await self.redis.incr(f"task:{task_id}:seq")
        event = {
            "event_id": str(event_id),
            "type": event_type,
            "data": json.dumps(data),
            "timestamp": str(time.time()),
        }
        await self.redis.xadd(f"task:{task_id}:events", event)
        await self.redis.hset(f"task:{task_id}", "status", TaskStatus.RUNNING.value)
        return event_id

    async def get_events_after(self, task_id: str, after_event_id: int) -> List[dict]:
        """获取指定 event_id 之后的所有事件（用于断线恢复）。"""
        events = await self.redis.xrange(f"task:{task_id}:events")
        result = []
        for _stream_id, event_data in events:
            eid = int(event_data[b"event_id"])
            if eid > after_event_id:
                result.append({
                    "event_id": eid,
                    "type": event_data[b"type"].decode(),
                    "data": json.loads(event_data[b"data"]),
                    "timestamp": float(event_data[b"timestamp"]),
                })
        return result

    async def get_task_state(self, task_id: str) -> Optional[Dict[str, str]]:
        """获取当前任务状态。"""
        state = await self.redis.hgetall(f"task:{task_id}")
        if not state:
            return None
        return {k.decode(): v.decode() for k, v in state.items()}

    async def complete_task(self, task_id: str, final_result: dict) -> None:
        """标记任务为已完成。"""
        await self.redis.hset(
            f"task:{task_id}",
            mapping={"status": TaskStatus.COMPLETED.value, "updated_at": str(time.time())},
        )
        # TODO: 将最终结果持久化到 PostgreSQL

    async def fail_task(self, task_id: str, error: str) -> None:
        """标记任务为失败。"""
        await self.redis.hset(
            f"task:{task_id}",
            mapping={
                "status": TaskStatus.FAILED.value,
                "error": error,
                "updated_at": str(time.time()),
            },
        )

    async def cancel_task(self, task_id: str) -> None:
        """取消正在运行的任务。"""
        await self.redis.hset(
            f"task:{task_id}",
            mapping={"status": TaskStatus.CANCELLED.value, "updated_at": str(time.time())},
        )
