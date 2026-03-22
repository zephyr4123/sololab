"""Module Registry 单元测试。"""

import pytest

from sololab.core.module_registry import (
    ModuleBase,
    ModuleContext,
    ModuleManifest,
    ModuleRegistry,
    ModuleRequest,
    validate_manifest,
)


class DummyModule(ModuleBase):
    def manifest(self) -> ModuleManifest:
        return ModuleManifest(
            id="test", name="Test", version="0.1.0",
            description="Test module", icon="Test", entry_point="test",
        )

    async def execute(self, request, ctx):
        yield {"type": "text", "content": "hello"}


class InvalidModule(ModuleBase):
    """manifest 缺少必填字段的模块。"""
    def manifest(self) -> ModuleManifest:
        return ModuleManifest(id="", name="", version="", description="", icon="", entry_point="")

    async def execute(self, request, ctx):
        yield {}


def _make_ctx():
    return ModuleContext(llm_gateway=None, tool_registry=None, memory_manager=None, task_state_manager=None)


class TestModuleRegistry:

    @pytest.mark.unit
    async def test_load_and_list_module(self):
        """加载模块后应出现在列表中。"""
        registry = ModuleRegistry()
        await registry.load_module(DummyModule(), _make_ctx())
        modules = registry.list_modules()
        assert len(modules) == 1
        assert modules[0].id == "test"

    @pytest.mark.unit
    async def test_unload_module(self):
        """卸载后模块应从注册表中消失。"""
        registry = ModuleRegistry()
        await registry.load_module(DummyModule(), _make_ctx())
        await registry.unload_module("test")
        assert registry.list_modules() == []

    @pytest.mark.unit
    async def test_get_module_returns_none_for_missing(self):
        """获取不存在的模块应返回 None。"""
        registry = ModuleRegistry()
        assert registry.get_module("nonexistent") is None

    @pytest.mark.unit
    async def test_run_module_streams_results(self):
        """运行模块应流式返回结果。"""
        registry = ModuleRegistry()
        await registry.load_module(DummyModule(), _make_ctx())
        results = []
        async for chunk in registry.run("test", ModuleRequest(input="test"), _make_ctx()):
            results.append(chunk)
        assert len(results) == 1
        assert results[0]["content"] == "hello"

    @pytest.mark.unit
    async def test_run_missing_module_raises(self):
        """运行未加载的模块应抛出 ValueError。"""
        registry = ModuleRegistry()
        with pytest.raises(ValueError, match="not loaded"):
            async for _ in registry.run("missing", ModuleRequest(input=""), _make_ctx()):
                pass

    @pytest.mark.unit
    async def test_load_invalid_manifest_raises(self):
        """空 manifest 字段应校验失败。"""
        registry = ModuleRegistry()
        with pytest.raises(ValueError, match="missing required field"):
            await registry.load_module(InvalidModule(), _make_ctx())

    @pytest.mark.unit
    def test_validate_manifest_ok(self):
        """合法 manifest 不应抛异常。"""
        m = ModuleManifest(id="a", name="b", version="1", description="d", icon="e", entry_point="f")
        validate_manifest(m)

    @pytest.mark.unit
    def test_discover_modules(self):
        """应能发现 ideaspark 模块。"""
        available = ModuleRegistry.discover_modules()
        assert "ideaspark" in available
        assert available["ideaspark"]["entry_point"] == "sololab.modules.ideaspark.module:IdeaSparkModule"

    @pytest.mark.unit
    def test_load_module_class(self):
        """应能动态导入模块类。"""
        cls = ModuleRegistry.load_module_class("sololab.modules.ideaspark.module:IdeaSparkModule")
        assert cls.__name__ == "IdeaSparkModule"
