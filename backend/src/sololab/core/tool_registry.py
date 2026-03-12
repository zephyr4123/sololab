"""Tool Registry - Unified external API tool management."""

from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Any, Dict, List, Optional


@dataclass
class ToolResult:
    """Standardized tool execution result."""

    success: bool
    data: Dict[str, Any]
    error: Optional[str] = None
    token_count: int = 0


class ToolBase(ABC):
    """Base class for all external tools."""

    @property
    @abstractmethod
    def name(self) -> str:
        """Unique tool identifier."""
        ...

    @property
    @abstractmethod
    def description(self) -> str:
        """Tool description for LLM understanding."""
        ...

    @abstractmethod
    async def execute(self, params: dict) -> ToolResult:
        """Execute the tool with given parameters."""
        ...


class ToolRegistry:
    """Tool registry managing external API tools."""

    def __init__(self) -> None:
        self._tools: Dict[str, ToolBase] = {}

    def register(self, tool: ToolBase) -> None:
        """Register a tool."""
        self._tools[tool.name] = tool

    def unregister(self, tool_name: str) -> None:
        """Unregister a tool."""
        self._tools.pop(tool_name, None)

    def get_tool(self, name: str) -> Optional[ToolBase]:
        """Get a tool by name."""
        return self._tools.get(name)

    def get_tools_for_module(self, tool_names: List[str]) -> List[ToolBase]:
        """Get multiple tools by name list."""
        return [self._tools[n] for n in tool_names if n in self._tools]

    def list_tools(self) -> List[Dict[str, str]]:
        """List all registered tools."""
        return [{"name": t.name, "description": t.description} for t in self._tools.values()]
