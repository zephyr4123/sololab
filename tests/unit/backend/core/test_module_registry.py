"""Unit tests for Module Registry."""

import pytest

from sololab.core.module_registry import ModuleBase, ModuleContext, ModuleManifest, ModuleRegistry, ModuleRequest


class DummyModule(ModuleBase):
    def manifest(self) -> ModuleManifest:
        return ModuleManifest(
            id="test", name="Test", version="0.1.0",
            description="Test module", icon="Test", entry_point="test",
        )

    async def execute(self, request, ctx):
        yield {"type": "text", "content": "hello"}


class TestModuleRegistry:

    @pytest.mark.unit
    async def test_load_and_list_module(self):
        """Loading a module should make it appear in list."""
        registry = ModuleRegistry()
        module = DummyModule()
        ctx = ModuleContext(llm_gateway=None, tool_registry=None, memory_manager=None, task_state_manager=None)
        await registry.load_module(module, ctx)
        modules = registry.list_modules()
        assert len(modules) == 1
        assert modules[0].id == "test"

    @pytest.mark.unit
    async def test_unload_module(self):
        """Unloading a module should remove it from the registry."""
        registry = ModuleRegistry()
        module = DummyModule()
        ctx = ModuleContext(llm_gateway=None, tool_registry=None, memory_manager=None, task_state_manager=None)
        await registry.load_module(module, ctx)
        await registry.unload_module("test")
        assert registry.list_modules() == []

    @pytest.mark.unit
    async def test_run_module_streams_results(self):
        """Running a module should yield results."""
        registry = ModuleRegistry()
        module = DummyModule()
        ctx = ModuleContext(llm_gateway=None, tool_registry=None, memory_manager=None, task_state_manager=None)
        await registry.load_module(module, ctx)
        results = []
        async for chunk in registry.run("test", ModuleRequest(input="test"), ctx):
            results.append(chunk)
        assert len(results) == 1
