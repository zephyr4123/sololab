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
    """测试模块执行（Phase 6.0 骨架）。"""

    @pytest.mark.asyncio
    async def test_execute_yields_status(self):
        """验证 execute 生成器能正常 yield 事件。"""
        module = WriterModule()

        # 模拟 on_load（不需要数据库）
        from pathlib import Path
        from sololab.modules.writer.templates.registry import TemplateRegistry
        templates_dir = Path(__file__).resolve().parents[5] / "backend" / "src" / "sololab" / "modules" / "writer" / "templates"
        module.template_registry = TemplateRegistry(templates_dir)

        # 模拟 request 和 context
        from unittest.mock import MagicMock
        request = MagicMock()
        request.input = "Write a paper about transformers"
        request.params = {"template": "nature"}
        context = MagicMock()

        events = []
        async for event in module.execute(request, context):
            events.append(event)

        assert len(events) == 2
        assert events[0]["type"] == "status"
        assert events[1]["type"] == "status"
        assert events[1]["template"] == "nature"
        assert "abstract" in events[1]["sections"]
