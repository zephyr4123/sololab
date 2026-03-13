"""应用共享的基础模型。"""

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class TimestampMixin(BaseModel):
    """提供创建/更新时间戳的混入类。"""

    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: Optional[datetime] = None


class APIResponse(BaseModel):
    """标准 API 响应封装。"""

    success: bool = True
    data: Optional[dict] = None
    error: Optional[str] = None
