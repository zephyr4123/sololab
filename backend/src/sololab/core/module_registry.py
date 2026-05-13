"""Module plugin framework — manifest validation, dynamic loading, runtime context."""

from __future__ import annotations

import asyncio
import importlib
import json
import logging
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from pathlib import Path
from typing import TYPE_CHECKING, Any, AsyncGenerator, Dict, List, Optional

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import async_sessionmaker

    from sololab.core.cost_tracker import CostTracker
    from sololab.core.document_pipeline import DocumentPipeline
    from sololab.core.llm_gateway import LLMGateway
    from sololab.core.memory_manager import MemoryManager
    from sololab.core.observability import BudgetAlert, LLMCallTracer
    from sololab.core.task_state_manager import TaskStateManager
    from sololab.core.tool_registry import ToolRegistry

logger = logging.getLogger(__name__)

_REQUIRED_MANIFEST_FIELDS = ("id", "name", "version", "description", "icon", "entry_point")


@dataclass
class ModuleManifest:
    """Module metadata declared in the per-module manifest.json."""

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
    """Single module-execution request."""

    input: str
    params: Dict[str, Any] = field(default_factory=dict)
    session_id: Optional[str] = None
    cancel_event: Optional[asyncio.Event] = None


@dataclass
class ModuleContext:
    """Runtime context handed to a module on every execution.

    Built per-request (or once at startup for `on_load`) by the API layer's
    `build_module_context`. Modules should treat this as read-only state.
    """

    llm_gateway: "LLMGateway"
    tool_registry: "ToolRegistry"
    memory_manager: "MemoryManager"
    task_state_manager: "TaskStateManager"
    document_pipeline: Optional["DocumentPipeline"] = None
    db_session_factory: Optional["async_sessionmaker"] = None
    # Observability dependencies — modules that build their own LLMGateway must
    # forward these so their calls stay budgeted and traced.
    cost_tracker: Optional["CostTracker"] = None
    llm_tracer: Optional["LLMCallTracer"] = None
    budget_alert: Optional["BudgetAlert"] = None
    manifest: ModuleManifest = field(
        default_factory=lambda: ModuleManifest("", "", "", "", "", "")
    )
    cancel_event: Optional[asyncio.Event] = None
    task_id: Optional[str] = None
    session_id: Optional[str] = None
    history: Optional[List[Dict[str, Any]]] = None


def validate_manifest(manifest: ModuleManifest) -> None:
    """Raise ValueError if any required manifest field is missing/blank."""
    for field_name in _REQUIRED_MANIFEST_FIELDS:
        value = getattr(manifest, field_name, None)
        if not value or not str(value).strip():
            raise ValueError(f"Module manifest missing required field: '{field_name}'")


class ModuleBase(ABC):
    """Base class for hot-pluggable functional modules."""

    @abstractmethod
    def manifest(self) -> ModuleManifest:
        """Return the module's metadata."""

    @abstractmethod
    async def execute(
        self, request: ModuleRequest, ctx: ModuleContext
    ) -> AsyncGenerator[Any, None]:
        """Run the module, streaming events out as they happen."""
        yield  # pragma: no cover

    async def on_load(self, ctx: ModuleContext) -> None:
        """Hook called once when the module is loaded into the registry."""

    async def on_unload(self) -> None:
        """Hook called when the module is unloaded."""


class ModuleRegistry:
    """In-memory module registry supporting dynamic load/unload."""

    def __init__(self) -> None:
        self._modules: Dict[str, ModuleBase] = {}

    async def load_module(self, module: ModuleBase, ctx: ModuleContext) -> None:
        manifest = module.manifest()
        validate_manifest(manifest)
        await module.on_load(ctx)
        self._modules[manifest.id] = module

    async def unload_module(self, module_id: str) -> None:
        if module_id in self._modules:
            await self._modules[module_id].on_unload()
            del self._modules[module_id]

    def get_module(self, module_id: str) -> Optional[ModuleBase]:
        return self._modules.get(module_id)

    def list_modules(self) -> List[ModuleManifest]:
        return [m.manifest() for m in self._modules.values()]

    async def run(
        self, module_id: str, request: ModuleRequest, ctx: ModuleContext
    ) -> AsyncGenerator[Any, None]:
        module = self._modules.get(module_id)
        if not module:
            raise ValueError(f"Module '{module_id}' not loaded")
        async for chunk in module.execute(request, ctx):
            yield chunk

    @staticmethod
    def discover_modules() -> Dict[str, dict]:
        """Scan `sololab/modules/*/manifest.json` and return discoverable modules."""
        modules_dir = Path(__file__).parent.parent / "modules"
        available: Dict[str, dict] = {}
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
                logger.warning("invalid_manifest_skipped path=%s error=%s", manifest_path, e)
        return available

    @staticmethod
    def load_module_class(entry_point: str) -> type:
        """Dynamic import — `module.path:ClassName`."""
        module_path, class_name = entry_point.rsplit(":", 1)
        mod = importlib.import_module(module_path)
        return getattr(mod, class_name)
