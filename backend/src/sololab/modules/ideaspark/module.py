"""IdeaSpark 模块 - 多智能体创意生成。"""

import logging
from typing import Any, AsyncGenerator, List

from sololab.core.module_registry import ModuleBase, ModuleContext, ModuleManifest, ModuleRequest
from sololab.modules.ideaspark.orchestrator import Orchestrator

logger = logging.getLogger(__name__)


class IdeaSparkModule(ModuleBase):
    """IdeaSpark：基于分离-汇聚协作的多智能体头脑风暴。
    使用多元化的角色智能体来生成、辩论和优化研究创意。
    """

    def __init__(self) -> None:
        self._orchestrator: Orchestrator | None = None

    def manifest(self) -> ModuleManifest:
        return ModuleManifest(
            id="ideaspark",
            name="IdeaSpark",
            version="2.1.0",
            description="Multi-agent idea generation with Separate-Together collaboration",
            icon="Lightbulb",
            entry_point="sololab.modules.ideaspark.module:IdeaSparkModule",
            required_tools=["web_search", "arxiv_search", "scholar_search", "doc_parse"],
            required_models=["reasoning", "divergent"],
        )

    async def on_load(self, ctx: ModuleContext) -> None:
        """使用角色智能体初始化编排器。"""
        self._orchestrator = Orchestrator(
            llm_gateway=ctx.llm_gateway,
            tool_registry=ctx.tool_registry,
        )

    async def execute(
        self, request: ModuleRequest, ctx: ModuleContext
    ) -> AsyncGenerator[Any, None]:
        """运行分离-汇聚创意生成流程。"""
        if not self._orchestrator:
            raise RuntimeError("Module not loaded")

        max_rounds = request.params.get("max_rounds", 3)
        top_k = request.params.get("top_k", 5)
        doc_ids: List[str] = request.params.get("doc_ids", [])

        # 如果用户上传了文档，搜索相关分块作为参考文献上下文
        doc_context = ""
        if doc_ids and ctx.document_pipeline:
            doc_context = await self._build_doc_context(
                ctx.document_pipeline, request.input, doc_ids
            )

        async for event in self._orchestrator.run(
            user_input=request.input,
            max_rounds=max_rounds,
            top_k=top_k,
            doc_context=doc_context,
        ):
            yield event

    async def _build_doc_context(
        self, pipeline, topic: str, doc_ids: List[str]
    ) -> str:
        """从上传的文档中搜索与主题相关的分块，组装为参考文献上下文。"""
        try:
            chunks = await pipeline.search(topic, top_k=10, doc_ids=doc_ids)
            if not chunks:
                return ""

            parts = []
            for i, chunk in enumerate(chunks, 1):
                source = chunk.get("document_title") or chunk.get("document_filename", "")
                content = chunk.get("content", "")
                parts.append(f"[参考文献 {i}] 来源: {source}\n{content}")

            return "\n\n---\n\n".join(parts)
        except Exception as e:
            logger.warning("文档上下文构建失败: %s", e)
            return ""
