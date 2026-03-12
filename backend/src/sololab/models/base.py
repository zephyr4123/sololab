"""Base models shared across the application."""

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class TimestampMixin(BaseModel):
    """Mixin providing created/updated timestamps."""

    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: Optional[datetime] = None


class APIResponse(BaseModel):
    """Standard API response envelope."""

    success: bool = True
    data: Optional[dict] = None
    error: Optional[str] = None
