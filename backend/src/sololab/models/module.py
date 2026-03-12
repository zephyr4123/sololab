"""Module-related data models."""

from typing import Any, Dict, List, Optional

from pydantic import BaseModel


class ModuleRunRequest(BaseModel):
    """Request to run a module."""

    input: str
    params: Dict[str, Any] = {}
    session_id: Optional[str] = None
    model: Optional[str] = None


class ModuleConfig(BaseModel):
    """Module frontend configuration."""

    id: str
    name: str
    description: str
    icon: str
    tabs: List[str] = ["chat", "board", "detail"]


class TextChunk(BaseModel):
    """Text output chunk from module execution."""

    type: str = "text"
    content: str


class AgentAction(BaseModel):
    """Agent action event."""

    type: str = "agent"
    agent: str
    action: str


class ToolCall(BaseModel):
    """Tool call event."""

    type: str = "tool"
    tool: str
    result: Any


class StatusUpdate(BaseModel):
    """Status change event."""

    type: str = "status"
    status: str
