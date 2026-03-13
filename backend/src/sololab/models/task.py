"""任务相关数据模型。"""

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
    """带序列号的单个任务事件。"""

    event_id: int
    type: str  # 文本 | 智能体 | 工具 | 状态 | 完成 | 错误
    data: dict
    timestamp: float


class TaskState(BaseModel):
    """任务状态快照。"""

    task_id: str
    module_id: str
    status: TaskStatus
    events: List[TaskEvent] = []
    total_events: int = 0
    created_at: float
    updated_at: Optional[float] = None
