"""Module-execution request schema (HTTP wire format)."""

from typing import Any, Dict, Optional

from pydantic import BaseModel


class ModuleRunRequest(BaseModel):
    """Run-a-module request body."""

    input: str
    params: Dict[str, Any] = {}
    session_id: Optional[str] = None
    model: Optional[str] = None
