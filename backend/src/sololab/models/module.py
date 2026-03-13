"""模块相关数据模型。"""

from typing import Any, Dict, List, Optional

from pydantic import BaseModel


class ModuleRunRequest(BaseModel):
    """模块运行请求。"""

    input: str
    params: Dict[str, Any] = {}
    session_id: Optional[str] = None
    model: Optional[str] = None


class ModuleConfig(BaseModel):
    """模块前端配置。"""

    id: str
    name: str
    description: str
    icon: str
    tabs: List[str] = ["chat", "board", "detail"]


class TextChunk(BaseModel):
    """模块执行的文本输出块。"""

    type: str = "text"
    content: str


class AgentAction(BaseModel):
    """智能体动作事件。"""

    type: str = "agent"
    agent: str
    action: str


class ToolCall(BaseModel):
    """工具调用事件。"""

    type: str = "tool"
    tool: str
    result: Any


class StatusUpdate(BaseModel):
    """状态变更事件。"""

    type: str = "status"
    status: str
