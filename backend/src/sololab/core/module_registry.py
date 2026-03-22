"""模块注册表 - 热插拔模块加载与管理。"""

import importlib
import json
import logging
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, AsyncGenerator, Dict, List, Optional

logger = logging.getLogger(__name__)

# 必填字段列表
_REQUIRED_MANIFEST_FIELDS = ("id", "name", "version", "description", "icon", "entry_point")


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


def validate_manifest(manifest: ModuleManifest) -> None:
    """校验模块清单必填字段。"""
    for field_name in _REQUIRED_MANIFEST_FIELDS:
        value = getattr(manifest, field_name, None)
        if not value or not str(value).strip():
            raise ValueError(f"Module manifest missing required field: '{field_name}'")


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
        """加载并初始化模块（含 manifest 校验）。"""
        manifest = module.manifest()
        validate_manifest(manifest)
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

    @staticmethod
    def discover_modules() -> Dict[str, dict]:
        """扫描 sololab/modules/*/manifest.json，返回可用模块信息。"""
        modules_dir = Path(__file__).parent.parent / "modules"
        available = {}
        if not modules_dir.exists():
            return available
        for manifest_path in modules_dir.glob("*/manifest.json"):
            try:
                with open(manifest_path) as f:
                    data = json.load(f)
                module_id = data.get("id")
                if module_id:
                    data["_manifest_path"] = str(manifest_path)
                    available[module_id] = data
            except (json.JSONDecodeError, KeyError) as e:
                logger.warning("跳过无效 manifest: %s (%s)", manifest_path, e)
        return available

    @staticmethod
    def load_module_class(entry_point: str) -> type:
        """从 entry_point（如 'sololab.modules.ideaspark.module:IdeaSparkModule'）动态导入模块类。"""
        module_path, class_name = entry_point.rsplit(":", 1)
        mod = importlib.import_module(module_path)
        return getattr(mod, class_name)
