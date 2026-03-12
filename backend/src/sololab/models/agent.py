"""Agent-related data models."""

from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class MessageType(str, Enum):
    """Blackboard message types."""

    IDEA = "idea"
    CRITIQUE = "critique"
    SYNTHESIS = "synthesis"
    VOTE = "vote"


class Message(BaseModel):
    """Blackboard message - shared communication unit between agents."""

    id: str
    sender: str
    content: str
    msg_type: MessageType
    references: List[str] = []
    timestamp: datetime = Field(default_factory=datetime.utcnow)


class AgentConfig(BaseModel):
    """Configuration for a Persona Agent."""

    name: str
    persona: str
    model: Optional[str] = None
    temperature: float = 0.7
    tools: List[str] = []
    max_tokens: int = 4096


class AgentState(BaseModel):
    """Runtime state of an agent."""

    name: str
    status: str = "idle"  # idle | thinking | acting | done
    messages_sent: int = 0
    tokens_used: int = 0
    cost_usd: float = 0.0
    last_action: Optional[str] = None
    metadata: Dict[str, Any] = {}
