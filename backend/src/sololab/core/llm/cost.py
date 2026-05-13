"""CostTrackingProvider — provider decorator that owns the *hook point*.

A single seam in the provider chain that:
  - enforces per-task budgets before each call (raises BudgetExceededError),
  - times the call via LLMCallTracer,
  - fills `usage.cost_usd` from the pricing table,
  - persists a CostRecord row,
  - fires graduated budget alerts.

All five steps are optional — pass `None` for any dependency to skip it.
This keeps unit tests light (no DB, no tracer required) while production
gets full instrumentation via main.py wiring.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any, AsyncGenerator, Dict, List, Optional

from sololab.core.llm.pricing import PricingTable
from sololab.core.llm.provider_base import (
    ChatChunk,
    ChatResponse,
    LLMProviderBase,
    ProviderQuirks,
)
from sololab.core.observability import get_logger, get_task_id

if TYPE_CHECKING:
    from sololab.core.cost_tracker import CostTracker
    from sololab.core.observability import BudgetAlert, LLMCallTracer

logger = get_logger("llm.cost")


class CostTrackingProvider(LLMProviderBase):
    """Wrap any provider so every chat/embed call is metered, budgeted, and traced."""

    name = "cost_tracking_decorator"
    quirks = ProviderQuirks(name="cost_tracking_decorator")

    def __init__(
        self,
        inner: LLMProviderBase,
        pricing: PricingTable,
        *,
        cost_tracker: Optional["CostTracker"] = None,
        tracer: Optional["LLMCallTracer"] = None,
        budget_alert: Optional["BudgetAlert"] = None,
        module_id: Optional[str] = None,
    ) -> None:
        # Intentionally skip super().__init__ — this is a decorator, not a real provider.
        self._inner = inner
        self._pricing = pricing
        self._cost_tracker = cost_tracker
        self._tracer = tracer
        self._budget_alert = budget_alert
        self._module_id = module_id
        # Expose the inner provider's identity so callers reflecting on `name` /
        # `quirks` see through the decorator.
        self.name = inner.name  # type: ignore[misc]
        self.quirks = inner.quirks  # type: ignore[misc]

    @property
    def default_model(self) -> str:
        return self._inner.default_model

    # ── public LLMProviderBase API ────────────────────────────────────────

    async def chat(
        self,
        messages: List[Dict[str, Any]],
        *,
        model: Optional[str] = None,
        temperature: float = 0.7,
        max_tokens: int = 4096,
        tools: Optional[List[Dict[str, Any]]] = None,
        response_format: Optional[Dict[str, Any]] = None,
        **opts: Any,
    ) -> ChatResponse:
        task_id = get_task_id()
        self._enforce_budget(task_id)
        trace = self._begin_trace(model)

        try:
            resp = await self._inner.chat(
                messages,
                model=model,
                temperature=temperature,
                max_tokens=max_tokens,
                tools=tools,
                response_format=response_format,
                **opts,
            )
        except Exception as e:
            self._end_trace(trace, error=str(e))
            raise

        resolved_model = resp.model or model or self._inner.default_model
        self._fill_cost(resp.usage, resolved_model)
        self._end_trace(trace, usage=resp.usage)
        await self._record_and_alert(resp.usage, resolved_model, task_id)
        return resp

    async def chat_stream(
        self,
        messages: List[Dict[str, Any]],
        *,
        model: Optional[str] = None,
        temperature: float = 0.7,
        max_tokens: int = 4096,
        tools: Optional[List[Dict[str, Any]]] = None,
        **opts: Any,
    ) -> AsyncGenerator[ChatChunk, None]:
        task_id = get_task_id()
        self._enforce_budget(task_id)
        trace = self._begin_trace(model)

        try:
            async for chunk in self._inner.chat_stream(
                messages,
                model=model,
                temperature=temperature,
                max_tokens=max_tokens,
                tools=tools,
                **opts,
            ):
                if chunk.type == "done" and chunk.final is not None:
                    resolved_model = (
                        chunk.final.model or model or self._inner.default_model
                    )
                    self._fill_cost(chunk.final.usage, resolved_model)
                    self._end_trace(trace, usage=chunk.final.usage)
                    await self._record_and_alert(chunk.final.usage, resolved_model, task_id)
                yield chunk
        except Exception as e:
            self._end_trace(trace, error=str(e))
            raise

    async def embed(
        self, texts: List[str], *, model: Optional[str] = None
    ) -> List[List[float]]:
        task_id = get_task_id()
        self._enforce_budget(task_id)
        trace = self._begin_trace(model, kind="embed")

        try:
            vectors = await self._inner.embed(texts, model=model)
        except Exception as e:
            self._end_trace(trace, error=str(e))
            raise

        resolved_model = model or self._inner.default_model
        prompt_tokens = sum(len(t) // 4 for t in texts)  # rough heuristic
        usage = {
            "prompt_tokens": prompt_tokens,
            "completion_tokens": 0,
            "cost_usd": self._pricing.estimate(resolved_model, prompt_tokens, 0),
        }
        self._end_trace(trace, usage=usage)
        await self._record_and_alert(usage, resolved_model, task_id)
        return vectors

    # ── hook helpers ─────────────────────────────────────────────────────

    def _fill_cost(self, usage: Dict[str, Any], model: str) -> None:
        cost = self._pricing.estimate(
            model,
            usage.get("prompt_tokens", 0) or 0,
            usage.get("completion_tokens", 0) or 0,
        )
        usage["cost_usd"] = cost

    def _enforce_budget(self, task_id: str) -> None:
        if not task_id or self._cost_tracker is None:
            return
        # Raises BudgetExceededError up the call stack.
        self._cost_tracker.check_budget(task_id)

    def _begin_trace(
        self, model: Optional[str], kind: str = "chat"
    ) -> Optional[Dict[str, Any]]:
        if self._tracer is None:
            return None
        return self._tracer.start_trace(
            agent_name=kind,
            model=model or self._inner.default_model,
        )

    def _end_trace(
        self,
        trace: Optional[Dict[str, Any]],
        *,
        usage: Optional[Dict[str, Any]] = None,
        error: Optional[str] = None,
    ) -> None:
        if trace is None or self._tracer is None:
            return
        self._tracer.end_trace(trace, usage=usage, error=error)

    async def _record_and_alert(
        self,
        usage: Dict[str, Any],
        model: str,
        task_id: str,
    ) -> None:
        if self._cost_tracker is None:
            return
        try:
            await self._cost_tracker.record(
                model=model,
                prompt_tokens=int(usage.get("prompt_tokens", 0) or 0),
                completion_tokens=int(usage.get("completion_tokens", 0) or 0),
                cost_usd=float(usage.get("cost_usd", 0) or 0),
                task_id=task_id or None,
                module_id=self._module_id,
            )
        except Exception:  # noqa: BLE001 — cost persistence must never fail the call
            logger.exception("cost_record_failed", model=model, task_id=task_id)

        if self._budget_alert is not None and task_id:
            running_cost = self._cost_tracker.get_runtime_cost(task_id)
            self._budget_alert.check(task_id, running_cost)
