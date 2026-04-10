"""WriterAI module — AI-powered academic paper writing.

Single Agent with multiple tools, Cowork-style interaction:
left chat + right document canvas with real-time streaming preview.
"""
from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import AsyncGenerator

from sololab.config.settings import get_settings
from sololab.core.module_registry import ModuleBase, ModuleContext, ModuleManifest, ModuleRequest
from sololab.modules.writer.agent import WriterAgent
from sololab.modules.writer.document import DocumentManager
from sololab.modules.writer.sandbox.executor import SandboxExecutor
from sololab.modules.writer.templates.registry import TemplateRegistry

logger = logging.getLogger(__name__)


class WriterModule(ModuleBase):
    """WriterAI module entry point."""

    def __init__(self) -> None:
        self._manifest_data: dict | None = None
        self.document_manager: DocumentManager | None = None
        self.template_registry: TemplateRegistry | None = None
        self.sandbox_executor: SandboxExecutor | None = None
        self.agent: WriterAgent | None = None

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
        settings = get_settings()

        # Template registry
        templates_dir = Path(__file__).parent / "templates"
        self.template_registry = TemplateRegistry(templates_dir)

        # Document manager — 直接从 settings 创建 DB 连接
        # ModuleContext 不包含 db_session_factory，Writer 模块自建连接池
        db_factory = None
        try:
            from sololab.models.orm import create_db_engine, create_session_factory
            engine = create_db_engine(settings.database_url)
            db_factory = create_session_factory(engine)
            logger.info("WriterAI DB connection pool initialized")
        except Exception as e:
            logger.warning("WriterAI DB initialization failed (will retry lazily): %s", e)
        self.document_manager = DocumentManager(db_factory)

        # Sandbox executor
        self.sandbox_executor = SandboxExecutor(
            storage_path=settings.storage_path,
            timeout=settings.writer_sandbox_timeout,
            memory=settings.writer_sandbox_memory,
        )

        # Writer agent
        self.agent = WriterAgent(
            settings=settings,
            document_manager=self.document_manager,
            template_registry=self.template_registry,
            sandbox_executor=self.sandbox_executor,
            tool_registry=ctx.tool_registry if hasattr(ctx, "tool_registry") else None,
            document_pipeline=ctx.document_pipeline if hasattr(ctx, "document_pipeline") else None,
        )

        logger.info("WriterAI module loaded (templates: %s)", self.template_registry.list_ids())

    async def execute(
        self, request: ModuleRequest, ctx: ModuleContext
    ) -> AsyncGenerator[dict, None]:
        """Execute a writing request via the WriterAgent.

        Params (in request.params):
            template: Template ID (default "nature").
            language: Target language — "en", "zh", or "auto" (default "auto").
            doc_id: Existing document ID for multi-turn editing.
        """
        if not self.agent:
            yield {"type": "error", "message": "WriterAI agent not initialized."}
            return

        params = request.params or {}
        template_id = params.get("template", "nature")
        language = params.get("language", "auto")
        doc_id = params.get("doc_id", "")
        session_id = ctx.session_id or request.session_id or ""

        yield {"type": "status", "status": "starting", "template": template_id}

        async for event in self.agent.run(
            prompt=request.input,
            session_id=session_id,
            template_id=template_id,
            language=language,
            doc_id=doc_id,
            cancel_event=ctx.cancel_event,
        ):
            yield event
