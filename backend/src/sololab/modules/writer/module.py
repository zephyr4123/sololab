"""WriterAI module — AI-powered academic paper writing.

Single Agent with multiple tools, Cowork-style interaction:
left chat + right document canvas with real-time streaming preview.
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import AsyncGenerator

from sololab.core.module_registry import ModuleBase, ModuleContext, ModuleManifest, ModuleRequest
from sololab.modules.writer.document import DocumentManager
from sololab.modules.writer.templates.registry import TemplateRegistry


class WriterModule(ModuleBase):
    """WriterAI module entry point."""

    def __init__(self) -> None:
        self._manifest_data: dict | None = None
        self.document_manager: DocumentManager | None = None
        self.template_registry: TemplateRegistry | None = None

    def manifest(self) -> ModuleManifest:
        if self._manifest_data is None:
            manifest_path = Path(__file__).parent / "manifest.json"
            self._manifest_data = json.loads(manifest_path.read_text(encoding="utf-8"))
        d = self._manifest_data
        return ModuleManifest(
            id=d["id"],
            name=d["name"],
            version=d["version"],
            description=d["description"],
            icon=d.get("icon", "PenTool"),
            entry_point=d["entry_point"],
            required_tools=d.get("required_tools", []),
            required_models=d.get("required_models", []),
            config_schema=d.get("config_schema"),
        )

    async def on_load(self, ctx: ModuleContext) -> None:
        templates_dir = Path(__file__).parent / "templates"
        self.template_registry = TemplateRegistry(templates_dir)

        if hasattr(ctx, "db_session_factory") and ctx.db_session_factory is not None:
            self.document_manager = DocumentManager(ctx.db_session_factory)
        else:
            db_factory = getattr(ctx, "_db_session_factory", None)
            self.document_manager = DocumentManager(db_factory)

    async def execute(
        self, request: ModuleRequest, ctx: ModuleContext
    ) -> AsyncGenerator[dict, None]:
        """Execute a writing request.

        Phase 6.0: skeleton only — yields a placeholder response.
        Phase 6.1 will integrate the full WriterAgent with tool chain.
        """
        yield {
            "type": "status",
            "status": "initializing",
            "message": "WriterAI module loaded. Agent implementation in Phase 6.1.",
        }

        template_id = request.params.get("template", "nature") if request.params else "nature"
        template = self.template_registry.get(template_id) if self.template_registry else None

        yield {
            "type": "status",
            "status": "ready",
            "template": template.id if template else template_id,
            "sections": [s.type for s in template.sections] if template else [],
        }
