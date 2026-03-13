"""IdeaSpark 模块 - 多智能体创意生成。"""

from typing import Any, AsyncGenerator

from sololab.core.module_registry import ModuleBase, ModuleContext, ModuleManifest, ModuleRequest
from sololab.modules.ideaspark.orchestrator import Orchestrator


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
            version="2.0.0",
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

        async for event in self._orchestrator.run(
            user_input=request.input,
            max_rounds=max_rounds,
            top_k=top_k,
        ):
            yield event
