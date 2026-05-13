"""IdeaSpark 模块 - 多智能体创意生成。

执行模式（2026-05-13）：
- `fast`（默认）：单轮、Together iteration=1、跳过 SynthesizePhase、Tournament 6 对。
  约 22 个 LLM 调用，~4-6 分钟一轮。
- `deep`：3 轮、Together iteration=2、保留 SynthesizePhase、Tournament 10 对。
  约 114 个 LLM 调用，~20-30 分钟。用户主动选才走。

模式由前端通过 `request.params['mode']` 传入；orchestrator 按模式重建 phases。
"""

import logging
from typing import Any, AsyncGenerator, List

from sololab.core.module_registry import ModuleBase, ModuleContext, ModuleManifest, ModuleRequest
from sololab.modules.ideaspark.orchestrator import Orchestrator
from sololab.modules.ideaspark.phases import (
    SeparatePhase,
    SynthesizePhase,
    TogetherPhase,
    TournamentPhase,
)

logger = logging.getLogger(__name__)


def _build_phases_for_mode(mode: str) -> list:
    """根据模式构造 phases 列表。"""
    if mode == "deep":
        return [
            SeparatePhase(),
            TogetherPhase(iterations=2),
            SynthesizePhase(),
            TournamentPhase(num_pairs=10),
        ]
    # fast (default)
    return [
        SeparatePhase(),
        TogetherPhase(iterations=1),
        TournamentPhase(num_pairs=6),
    ]


def _max_rounds_for_mode(mode: str) -> int:
    return 3 if mode == "deep" else 1


class IdeaSparkModule(ModuleBase):
    """IdeaSpark：基于分离-汇聚协作的多智能体头脑风暴。
    使用多元化的角色智能体来生成、辩论和优化研究创意。
    """

    def __init__(self) -> None:
        # 保留一个 fast orchestrator 实例，deep 模式每次按需新建（构造成本极低）
        self._llm = None
        self._tools = None

    def manifest(self) -> ModuleManifest:
        return ModuleManifest(
            id="ideaspark",
            name="IdeaSpark",
            version="2.2.0",
            description="Multi-agent idea generation with Separate-Together collaboration",
            icon="Lightbulb",
            entry_point="sololab.modules.ideaspark.module:IdeaSparkModule",
            required_tools=["web_search", "arxiv_search", "scholar_search", "doc_parse"],
            required_models=["reasoning", "divergent"],
        )

    async def on_load(self, ctx: ModuleContext) -> None:
        """缓存依赖。orchestrator 在 execute 时按模式构造（成本可忽略）。"""
        self._llm = ctx.llm_gateway
        self._tools = ctx.tool_registry

    async def execute(
        self, request: ModuleRequest, ctx: ModuleContext
    ) -> AsyncGenerator[Any, None]:
        """运行分离-汇聚创意生成流程。"""
        if not self._llm:
            raise RuntimeError("Module not loaded")

        mode = request.params.get("mode", "fast")
        if mode not in ("fast", "deep"):
            mode = "fast"

        # 显式覆盖优先（高级用户/E2E 测试），否则按模式默认
        max_rounds = request.params.get("max_rounds") or _max_rounds_for_mode(mode)
        top_k = request.params.get("top_k", 5)
        doc_ids: List[str] = request.params.get("doc_ids", [])

        orchestrator = Orchestrator(
            llm_gateway=self._llm,
            tool_registry=self._tools,
            phases=_build_phases_for_mode(mode),
        )

        # 如果用户上传了文档，搜索相关分块作为参考文献上下文
        doc_context = ""
        if doc_ids and ctx.document_pipeline:
            doc_context = await self._build_doc_context(
                ctx.document_pipeline, request.input, doc_ids
            )

        logger.info(
            "[IdeaSpark] execute mode=%s max_rounds=%s top_k=%s docs=%d",
            mode,
            max_rounds,
            top_k,
            len(doc_ids),
        )

        async for event in orchestrator.run(
            user_input=request.input,
            max_rounds=max_rounds,
            top_k=top_k,
            doc_context=doc_context,
            cancel_event=ctx.cancel_event,
            history=ctx.history,
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
