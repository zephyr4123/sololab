"""IdeaSpark Module - Multi-agent idea generation."""

from typing import Any, AsyncGenerator

from sololab.core.module_registry import ModuleBase, ModuleContext, ModuleManifest, ModuleRequest
from sololab.modules.ideaspark.orchestrator import Orchestrator


class IdeaSparkModule(ModuleBase):
    """
    IdeaSpark: Multi-agent brainstorming with Separate-Together collaboration.
    Uses diverse Persona Agents to generate, debate, and refine research ideas.
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
        """Initialize orchestrator with persona agents."""
        self._orchestrator = Orchestrator(
            llm_gateway=ctx.llm_gateway,
            tool_registry=ctx.tool_registry,
        )

    async def execute(
        self, request: ModuleRequest, ctx: ModuleContext
    ) -> AsyncGenerator[Any, None]:
        """Run the Separate-Together idea generation flow."""
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
