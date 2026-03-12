"""Unit tests for Tool Registry."""

import pytest

from sololab.core.tool_registry import ToolBase, ToolRegistry, ToolResult


class DummyTool(ToolBase):
    @property
    def name(self) -> str:
        return "dummy"

    @property
    def description(self) -> str:
        return "A dummy tool for testing"

    async def execute(self, params: dict) -> ToolResult:
        return ToolResult(success=True, data={"echo": params})


class TestToolRegistry:

    @pytest.mark.unit
    def test_register_and_list(self):
        """Registering a tool should make it available in list."""
        registry = ToolRegistry()
        registry.register(DummyTool())
        tools = registry.list_tools()
        assert len(tools) == 1
        assert tools[0]["name"] == "dummy"

    @pytest.mark.unit
    def test_get_tool(self):
        """Getting a tool by name should return it."""
        registry = ToolRegistry()
        registry.register(DummyTool())
        tool = registry.get_tool("dummy")
        assert tool is not None
        assert tool.name == "dummy"

    @pytest.mark.unit
    def test_get_tools_for_module(self):
        """Getting tools by name list should return matching tools."""
        registry = ToolRegistry()
        registry.register(DummyTool())
        tools = registry.get_tools_for_module(["dummy", "nonexistent"])
        assert len(tools) == 1
