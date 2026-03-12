"""Task State Manager - Redis-based task state persistence for disconnect recovery."""

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
    """Task event with sequence number."""

    event_id: int
    type: str  # text | agent | tool | status | done | error
    data: dict
    timestamp: float


class TaskState(BaseModel):
    """Task state snapshot."""

    task_id: str
    module_id: str
    status: TaskStatus
    total_events: int = 0
    created_at: float
    updated_at: float = 0.0


class TaskStateManager:
    """
    Redis-based task state persistence.
    - Each SSE event written to Redis Stream with incremental event_id
    - Frontend reconnects via event_id cursor to fetch missed events
    - Completed tasks optionally persisted to PostgreSQL
    """

    TTL = 3600 * 24  # 24 hours

    def __init__(self, redis: aioredis.Redis) -> None:
        self.redis = redis

    async def create_task(self, module_id: str, request: dict) -> str:
        """Create a new task, return task_id."""
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
        """Append event to Redis Stream, return event_id."""
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
        """Get all events after a given event_id (for disconnect recovery)."""
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
        """Get current task state."""
        state = await self.redis.hgetall(f"task:{task_id}")
        if not state:
            return None
        return {k.decode(): v.decode() for k, v in state.items()}

    async def complete_task(self, task_id: str, final_result: dict) -> None:
        """Mark task as completed."""
        await self.redis.hset(
            f"task:{task_id}",
            mapping={"status": TaskStatus.COMPLETED.value, "updated_at": str(time.time())},
        )
        # TODO: Persist final_result to PostgreSQL

    async def fail_task(self, task_id: str, error: str) -> None:
        """Mark task as failed."""
        await self.redis.hset(
            f"task:{task_id}",
            mapping={
                "status": TaskStatus.FAILED.value,
                "error": error,
                "updated_at": str(time.time()),
            },
        )

    async def cancel_task(self, task_id: str) -> None:
        """Cancel a running task."""
        await self.redis.hset(
            f"task:{task_id}",
            mapping={"status": TaskStatus.CANCELLED.value, "updated_at": str(time.time())},
        )
