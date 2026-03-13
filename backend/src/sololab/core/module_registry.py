"""模块注册表 - 热插拔模块加载与管理。"""

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any, AsyncGenerator, Dict, List, Optional


@dataclass
class ModuleManifest:
    """模块元数据声明。"""

    id: str
    name: str
    version: str
    description: str
    icon: str
    entry_point: str
    required_tools: List[str] = field(default_factory=list)
    required_models: List[str] = field(default_factory=list)
    config_schema: Optional[dict] = None


@dataclass
class ModuleRequest:
    """模块执行请求。"""

    input: str
    params: Dict[str, Any] = field(default_factory=dict)
    session_id: Optional[str] = None


@dataclass
class ModuleContext:
    """传递给模块的运行时上下文。"""

    llm_gateway: Any  # LLMGateway
    tool_registry: Any  # ToolRegistry
    memory_manager: Any  # MemoryManager
    task_state_manager: Any  # TaskStateManager
    manifest: ModuleManifest = field(default_factory=lambda: ModuleManifest("", "", "", "", "", ""))


class ModuleBase(ABC):
    """所有功能模块的基类。"""

    @abstractmethod
    def manifest(self) -> ModuleManifest:
        """返回模块元数据。"""
        ...

    @abstractmethod
    async def execute(
        self, request: ModuleRequest, ctx: ModuleContext
    ) -> AsyncGenerator[Any, None]:
        """核心执行方法，流式返回结果。"""
        yield  # pragma: no cover

    async def on_load(self, ctx: ModuleContext) -> None:
        """模块加载时调用的钩子。"""

    async def on_unload(self) -> None:
        """模块卸载时调用的钩子。"""


class ModuleRegistry:
    """支持动态加载/卸载的模块注册表。"""

    def __init__(self) -> None:
        self._modules: Dict[str, ModuleBase] = {}

    async def load_module(self, module: ModuleBase, ctx: ModuleContext) -> None:
        """加载并初始化模块。"""
        manifest = module.manifest()
        await module.on_load(ctx)
        self._modules[manifest.id] = module

    async def unload_module(self, module_id: str) -> None:
        """卸载模块并执行清理。"""
        if module_id in self._modules:
            await self._modules[module_id].on_unload()
            del self._modules[module_id]

    def get_module(self, module_id: str) -> Optional[ModuleBase]:
        """根据 ID 获取已加载的模块。"""
        return self._modules.get(module_id)

    def list_modules(self) -> List[ModuleManifest]:
        """列出所有已加载模块的清单。"""
        return [m.manifest() for m in self._modules.values()]

    async def run(
        self, module_id: str, request: ModuleRequest, ctx: ModuleContext
    ) -> AsyncGenerator[Any, None]:
        """执行模块并流式返回结果。"""
        module = self._modules.get(module_id)
        if not module:
            raise ValueError(f"Module '{module_id}' not loaded")
        async for chunk in module.execute(request, ctx):
            yield chunk
