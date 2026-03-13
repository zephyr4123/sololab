"""工具注册表 - 统一的外部 API 工具管理。"""

from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Any, Dict, List, Optional


@dataclass
class ToolResult:
    """标准化的工具执行结果。"""

    success: bool
    data: Dict[str, Any]
    error: Optional[str] = None
    token_count: int = 0


class ToolBase(ABC):
    """所有外部工具的基类。"""

    @property
    @abstractmethod
    def name(self) -> str:
        """工具唯一标识符。"""
        ...

    @property
    @abstractmethod
    def description(self) -> str:
        """供 LLM 理解的工具描述。"""
        ...

    @abstractmethod
    async def execute(self, params: dict) -> ToolResult:
        """使用给定参数执行工具。"""
        ...


class ToolRegistry:
    """管理外部 API 工具的工具注册表。"""

    def __init__(self) -> None:
        self._tools: Dict[str, ToolBase] = {}

    def register(self, tool: ToolBase) -> None:
        """注册工具。"""
        self._tools[tool.name] = tool

    def unregister(self, tool_name: str) -> None:
        """注销工具。"""
        self._tools.pop(tool_name, None)

    def get_tool(self, name: str) -> Optional[ToolBase]:
        """根据名称获取工具。"""
        return self._tools.get(name)

    def get_tools_for_module(self, tool_names: List[str]) -> List[ToolBase]:
        """根据名称列表获取多个工具。"""
        return [self._tools[n] for n in tool_names if n in self._tools]

    def list_tools(self) -> List[Dict[str, str]]:
        """列出所有已注册的工具。"""
        return [{"name": t.name, "description": t.description} for t in self._tools.values()]
