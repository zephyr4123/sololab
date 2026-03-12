"""Module Registry - Hot-pluggable module loading and management."""

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any, AsyncGenerator, Dict, List, Optional


@dataclass
class ModuleManifest:
    """Module metadata declaration."""

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
    """Request to execute a module."""

    input: str
    params: Dict[str, Any] = field(default_factory=dict)
    session_id: Optional[str] = None


@dataclass
class ModuleContext:
    """Runtime context passed to modules."""

    llm_gateway: Any  # LLMGateway
    tool_registry: Any  # ToolRegistry
    memory_manager: Any  # MemoryManager
    task_state_manager: Any  # TaskStateManager
    manifest: ModuleManifest = field(default_factory=lambda: ModuleManifest("", "", "", "", "", ""))


class ModuleBase(ABC):
    """Base class for all feature modules."""

    @abstractmethod
    def manifest(self) -> ModuleManifest:
        """Return module metadata."""
        ...

    @abstractmethod
    async def execute(
        self, request: ModuleRequest, ctx: ModuleContext
    ) -> AsyncGenerator[Any, None]:
        """Core execution method, streams results."""
        yield  # pragma: no cover

    async def on_load(self, ctx: ModuleContext) -> None:
        """Hook called when module is loaded."""

    async def on_unload(self) -> None:
        """Hook called when module is unloaded."""


class ModuleRegistry:
    """Module registry supporting dynamic load/unload."""

    def __init__(self) -> None:
        self._modules: Dict[str, ModuleBase] = {}

    async def load_module(self, module: ModuleBase, ctx: ModuleContext) -> None:
        """Load and initialize a module."""
        manifest = module.manifest()
        await module.on_load(ctx)
        self._modules[manifest.id] = module

    async def unload_module(self, module_id: str) -> None:
        """Unload a module and run cleanup."""
        if module_id in self._modules:
            await self._modules[module_id].on_unload()
            del self._modules[module_id]

    def get_module(self, module_id: str) -> Optional[ModuleBase]:
        """Get a loaded module by ID."""
        return self._modules.get(module_id)

    def list_modules(self) -> List[ModuleManifest]:
        """List all loaded module manifests."""
        return [m.manifest() for m in self._modules.values()]

    async def run(
        self, module_id: str, request: ModuleRequest, ctx: ModuleContext
    ) -> AsyncGenerator[Any, None]:
        """Execute a module and stream results."""
        module = self._modules.get(module_id)
        if not module:
            raise ValueError(f"Module '{module_id}' not loaded")
        async for chunk in module.execute(request, ctx):
            yield chunk
