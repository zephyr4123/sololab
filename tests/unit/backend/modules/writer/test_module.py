"""WriterModule 单元测试。

测试模块注册、manifest 加载、基本执行。
"""
import pytest

from sololab.modules.writer.module import WriterModule


class TestWriterModuleManifest:
    """测试模块 manifest 加载。"""

    def test_manifest_loads(self):
        module = WriterModule()
        manifest = module.manifest()
        assert manifest.id == "writer"
        assert manifest.name == "WriterAI"
        assert manifest.version == "1.0.0"
        assert manifest.icon == "PenTool"
        assert "web_search" in manifest.required_tools
        assert "arxiv_search" in manifest.required_tools
        assert "scholar_search" in manifest.required_tools
        assert "reasoning" in manifest.required_models

    def test_manifest_config_schema(self):
        module = WriterModule()
        manifest = module.manifest()
        schema = manifest.config_schema
        assert schema is not None
        props = schema["properties"]
        assert "default_template" in props
        assert props["default_template"]["default"] == "nature"
        assert "sandbox_timeout" in props
        assert "budget_limit_usd" in props

    def test_manifest_cached(self):
        module = WriterModule()
        m1 = module.manifest()
        m2 = module.manifest()
        assert m1.id == m2.id  # 读取两次不报错


class TestWriterModuleExecution:
    """测试模块执行。"""

    @pytest.mark.asyncio
    async def test_execute_without_agent_yields_error(self):
        """未初始化 agent 时应返回错误事件。"""
        module = WriterModule()

        from unittest.mock import MagicMock
        request = MagicMock()
        request.input = "Write a paper"
        request.params = {"template": "nature"}
        context = MagicMock()

        events = []
        async for event in module.execute(request, context):
            events.append(event)

        assert len(events) == 1
        assert events[0]["type"] == "error"
        assert "not initialized" in events[0]["message"]
