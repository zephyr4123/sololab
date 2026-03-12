"""Task-related data models."""

from enum import Enum
from typing import List, Optional

from pydantic import BaseModel


class TaskStatus(str, Enum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class TaskEvent(BaseModel):
    """A single task event with sequence number."""

    event_id: int
    type: str  # text | agent | tool | status | done | error
    data: dict
    timestamp: float


class TaskState(BaseModel):
    """Task state snapshot."""

    task_id: str
    module_id: str
    status: TaskStatus
    events: List[TaskEvent] = []
    total_events: int = 0
    created_at: float
    updated_at: Optional[float] = None
