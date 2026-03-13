"""智能体相关数据模型。"""

from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class MessageType(str, Enum):
    """黑板消息类型。"""

    IDEA = "idea"
    CRITIQUE = "critique"
    SYNTHESIS = "synthesis"
    VOTE = "vote"


class Message(BaseModel):
    """黑板消息 - 智能体之间的共享通信单元。"""

    id: str
    sender: str
    content: str
    msg_type: MessageType
    references: List[str] = []
    timestamp: datetime = Field(default_factory=datetime.utcnow)


class AgentConfig(BaseModel):
    """角色智能体的配置。"""

    name: str
    persona: str
    model: Optional[str] = None
    temperature: float = 0.7
    tools: List[str] = []
    max_tokens: int = 4096


class AgentState(BaseModel):
    """智能体的运行时状态。"""

    name: str
    status: str = "idle"  # 空闲 | 思考中 | 执行中 | 完成
    messages_sent: int = 0
    tokens_used: int = 0
    cost_usd: float = 0.0
    last_action: Optional[str] = None
    metadata: Dict[str, Any] = {}
