"""Agent-related transport schemas — wire format for blackboard, runtime state."""

from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class MessageType(str, Enum):
    """Blackboard message type."""

    IDEA = "idea"
    CRITIQUE = "critique"
    SYNTHESIS = "synthesis"
    VOTE = "vote"


class Message(BaseModel):
    """A single blackboard message — the shared communication unit between agents."""

    id: str
    sender: str
    content: str
    msg_type: MessageType
    references: List[str] = []
    timestamp: datetime = Field(default_factory=datetime.utcnow)


class AgentConfig(BaseModel):
    """Persona-agent configuration."""

    name: str
    persona: str
    model: Optional[str] = None
    temperature: float = 0.7
    tools: List[str] = []
    max_tokens: int = 4096


class AgentState(BaseModel):
    """Agent runtime state snapshot."""

    name: str
    status: str = "idle"  # idle | thinking | running | done
    messages_sent: int = 0
    tokens_used: int = 0
    cost_usd: float = 0.0
    last_action: Optional[str] = None
    metadata: Dict[str, Any] = {}
