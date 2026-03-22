"""Tool Registry 单元测试。"""

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
        """注册工具后应出现在列表中。"""
        registry = ToolRegistry()
        registry.register(DummyTool())
        tools = registry.list_tools()
        assert len(tools) == 1
        assert tools[0]["name"] == "dummy"

    @pytest.mark.unit
    def test_get_tool(self):
        """按名称获取工具应返回正确实例。"""
        registry = ToolRegistry()
        registry.register(DummyTool())
        tool = registry.get_tool("dummy")
        assert tool is not None
        assert tool.name == "dummy"

    @pytest.mark.unit
    def test_get_tool_returns_none_for_missing(self):
        """获取不存在的工具应返回 None。"""
        registry = ToolRegistry()
        assert registry.get_tool("nonexistent") is None

    @pytest.mark.unit
    def test_get_tools_for_module(self):
        """按名称列表获取工具应过滤不存在的。"""
        registry = ToolRegistry()
        registry.register(DummyTool())
        tools = registry.get_tools_for_module(["dummy", "nonexistent"])
        assert len(tools) == 1

    @pytest.mark.unit
    async def test_execute_tool(self):
        """执行工具应返回正确结果。"""
        registry = ToolRegistry()
        registry.register(DummyTool())
        tool = registry.get_tool("dummy")
        result = await tool.execute({"q": "test"})
        assert result.success is True
        assert result.data["echo"] == {"q": "test"}

    @pytest.mark.unit
    def test_unregister_tool(self):
        """注销工具后不应再出现在列表中。"""
        registry = ToolRegistry()
        registry.register(DummyTool())
        registry.unregister("dummy")
        assert registry.list_tools() == []
        assert registry.get_tool("dummy") is None
