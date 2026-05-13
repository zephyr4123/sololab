"""Tool registry for external-API tools (search, document parsing, ...).

Each tool declares its own OpenAI function-calling schema via
`parameters_schema` so the registry can build the LLM-facing tool list
without guessing parameter names.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Any, ClassVar, Dict, List, Optional


@dataclass
class ToolResult:
    """Uniform tool result envelope."""

    success: bool
    data: Dict[str, Any]
    error: Optional[str] = None
    token_count: int = 0


class ToolBase(ABC):
    """Base for external-API tools.

    Subclasses must declare:
      - `name` (str property): unique tool identifier
      - `description` (str property): LLM-facing description
      - `parameters_schema` (ClassVar[dict]): JSON-Schema for parameters,
        in the shape OpenAI function-calling expects.

    Example::

        class TavilySearchTool(ToolBase):
            parameters_schema = {
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "Search query"},
                    "max_results": {"type": "integer", "default": 5},
                },
                "required": ["query"],
            }
    """

    parameters_schema: ClassVar[Dict[str, Any]]

    @property
    @abstractmethod
    def name(self) -> str:
        """Unique tool identifier."""

    @property
    @abstractmethod
    def description(self) -> str:
        """Description shown to the LLM during function calling."""

    @abstractmethod
    async def execute(self, params: dict) -> ToolResult:
        """Execute the tool with the given params dict."""

    def to_openai_function(self) -> Dict[str, Any]:
        """Build the OpenAI function-calling descriptor for this tool."""
        schema = getattr(type(self), "parameters_schema", None)
        if schema is None:
            raise NotImplementedError(
                f"{type(self).__name__} must declare a `parameters_schema` "
                "ClassVar (see ToolBase docstring)."
            )
        return {
            "type": "function",
            "function": {
                "name": self.name,
                "description": self.description,
                "parameters": schema,
            },
        }


class ToolRegistry:
    """In-memory registry of external-API tools."""

    def __init__(self) -> None:
        self._tools: Dict[str, ToolBase] = {}

    def register(self, tool: ToolBase) -> None:
        self._tools[tool.name] = tool

    def unregister(self, tool_name: str) -> None:
        self._tools.pop(tool_name, None)

    def get_tool(self, name: str) -> Optional[ToolBase]:
        return self._tools.get(name)

    def get_tools_for_module(self, tool_names: List[str]) -> List[ToolBase]:
        return [self._tools[n] for n in tool_names if n in self._tools]

    def get_openai_tools(self, tool_names: List[str]) -> List[Dict[str, Any]]:
        return [
            self._tools[n].to_openai_function()
            for n in tool_names
            if n in self._tools
        ]

    def list_tools(self) -> List[Dict[str, str]]:
        return [
            {"name": t.name, "description": t.description}
            for t in self._tools.values()
        ]
