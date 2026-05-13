"""Structured logging, request context, LLM tracing, and budget alerts.

The request context exports two ContextVars — `request_id` and `task_id` —
that flow through structlog and downstream services (LLM provider wrappers,
cost tracker) without needing to thread them through every call site.
"""

from __future__ import annotations

import logging
import time
import uuid
from contextlib import contextmanager
from contextvars import ContextVar
from typing import Any, Dict, Iterator, List, Optional

import structlog
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import Response

# ── Request-scoped context ────────────────────────────────────────────────────
# These ContextVars are read by the LLM provider wrapper and the cost tracker
# to associate observability data with the originating request/task.

_request_id: ContextVar[str] = ContextVar("request_id", default="")
_task_id: ContextVar[str] = ContextVar("task_id", default="")


def get_request_id() -> str:
    return _request_id.get("")


def get_task_id() -> str:
    return _task_id.get("")


@contextmanager
def task_context(task_id: str) -> Iterator[None]:
    """Bind `task_id` for the duration of the `with` block.

    Used by streaming module routes to scope LLM calls (and their cost
    records / traces) to a specific task id.
    """
    token = _task_id.set(task_id)
    try:
        yield
    finally:
        _task_id.reset(token)


# ── Logging setup ─────────────────────────────────────────────────────────────


def setup_logging(log_level: str = "INFO", json_output: bool = True) -> None:
    """Configure structlog with request_id/task_id propagation."""
    processors = [
        structlog.contextvars.merge_contextvars,
        structlog.processors.add_log_level,
        structlog.processors.StackInfoRenderer(),
        structlog.dev.set_exc_info,
        structlog.processors.TimeStamper(fmt="iso"),
    ]

    if json_output:
        processors.append(structlog.processors.JSONRenderer())
    else:
        processors.append(structlog.dev.ConsoleRenderer())

    structlog.configure(
        processors=processors,
        wrapper_class=structlog.make_filtering_bound_logger(
            getattr(logging, log_level.upper(), logging.INFO)
        ),
        context_class=dict,
        logger_factory=structlog.PrintLoggerFactory(),
        cache_logger_on_first_use=True,
    )


def get_logger(name: str = "") -> structlog.BoundLogger:
    """Return a structlog logger; request_id/task_id auto-merged from contextvars."""
    return structlog.get_logger(name)


# ── Request context middleware ────────────────────────────────────────────────


class RequestContextMiddleware(BaseHTTPMiddleware):
    """Stamp every request with an id and propagate it via ContextVar + structlog.

    Accepts an inbound ``X-Request-ID`` header for cross-service tracing;
    generates a UUID otherwise. The id is echoed in the response header so
    clients can correlate logs.
    """

    async def dispatch(
        self, request: Request, call_next: RequestResponseEndpoint
    ) -> Response:
        rid = request.headers.get("X-Request-ID") or str(uuid.uuid4())
        token = _request_id.set(rid)
        structlog.contextvars.bind_contextvars(request_id=rid)
        try:
            response = await call_next(request)
        finally:
            _request_id.reset(token)
            structlog.contextvars.unbind_contextvars("request_id")
        response.headers["X-Request-ID"] = rid
        return response


# ── LLM call tracer ───────────────────────────────────────────────────────────


class LLMCallTracer:
    """In-memory ring buffer of recent LLM calls — surface for /providers/traces."""

    def __init__(self, max_traces: int = 1000) -> None:
        self._log = get_logger("llm_tracer")
        self._traces: List[Dict[str, Any]] = []
        self._max_traces = max_traces

    def start_trace(
        self,
        agent_name: str = "",
        model: str = "",
        task_id: str = "",
    ) -> Dict[str, Any]:
        return {
            "agent_name": agent_name,
            "model": model,
            "task_id": task_id or _task_id.get(""),
            "request_id": _request_id.get(""),
            "start_time": time.time(),
            "end_time": 0.0,
            "latency_ms": 0.0,
            "prompt_tokens": 0,
            "completion_tokens": 0,
            "cost_usd": 0.0,
            "status": "running",
            "error": None,
        }

    def end_trace(
        self,
        trace: Dict[str, Any],
        usage: Optional[Dict] = None,
        error: Optional[str] = None,
    ) -> Dict[str, Any]:
        trace["end_time"] = time.time()
        trace["latency_ms"] = round((trace["end_time"] - trace["start_time"]) * 1000, 1)

        if usage:
            trace["prompt_tokens"] = usage.get("prompt_tokens", 0)
            trace["completion_tokens"] = usage.get("completion_tokens", 0)
            trace["cost_usd"] = usage.get("cost_usd", 0.0)

        if error:
            trace["status"] = "error"
            trace["error"] = error
        else:
            trace["status"] = "completed"

        self._traces.append(trace)
        if len(self._traces) > self._max_traces:
            del self._traces[0 : len(self._traces) - self._max_traces]

        self._log.info(
            "llm_call",
            agent=trace["agent_name"],
            model=trace["model"],
            task_id=trace["task_id"],
            request_id=trace["request_id"],
            latency_ms=trace["latency_ms"],
            prompt_tokens=trace["prompt_tokens"],
            completion_tokens=trace["completion_tokens"],
            cost_usd=trace["cost_usd"],
            status=trace["status"],
        )

        return trace

    def get_traces(self, task_id: Optional[str] = None, limit: int = 100) -> List[Dict]:
        if task_id:
            return [t for t in self._traces if t["task_id"] == task_id][-limit:]
        return self._traces[-limit:]

    def get_summary(self, task_id: Optional[str] = None) -> Dict:
        traces = self.get_traces(task_id)
        if not traces:
            return {"total_calls": 0, "total_tokens": 0, "total_cost_usd": 0, "avg_latency_ms": 0}

        total_tokens = sum(t["prompt_tokens"] + t["completion_tokens"] for t in traces)
        total_cost = sum(t["cost_usd"] for t in traces)
        avg_latency = sum(t["latency_ms"] for t in traces) / len(traces)

        return {
            "total_calls": len(traces),
            "total_tokens": total_tokens,
            "total_cost_usd": round(total_cost, 6),
            "avg_latency_ms": round(avg_latency, 1),
            "by_agent": self._group_by(traces, "agent_name"),
            "by_model": self._group_by(traces, "model"),
        }

    @staticmethod
    def _group_by(traces: List[Dict], key: str) -> Dict:
        groups: Dict[str, Dict[str, Any]] = {}
        for t in traces:
            k = t.get(key, "unknown")
            if k not in groups:
                groups[k] = {"calls": 0, "tokens": 0, "cost_usd": 0.0}
            groups[k]["calls"] += 1
            groups[k]["tokens"] += t["prompt_tokens"] + t["completion_tokens"]
            groups[k]["cost_usd"] += t["cost_usd"]
        return groups


# ── Budget alert ──────────────────────────────────────────────────────────────


class BudgetAlert:
    """Emit structured alerts when a task crosses 50%/80%/100% of its budget."""

    def __init__(self, budget_usd: float = 5.0) -> None:
        self.budget_usd = budget_usd
        self._log = get_logger("budget_alert")
        self._alerted: Dict[str, bool] = {}

    def check(self, task_id: str, current_cost: float) -> Optional[Dict]:
        if not task_id or self.budget_usd <= 0:
            return None

        ratio = current_cost / self.budget_usd

        if ratio >= 1.0 and not self._alerted.get(f"{task_id}_100"):
            self._alerted[f"{task_id}_100"] = True
            alert = {
                "level": "critical", "task_id": task_id,
                "cost_usd": current_cost, "budget_usd": self.budget_usd, "ratio": ratio,
            }
            self._log.error("budget_exceeded", **alert)
            return alert
        if ratio >= 0.8 and not self._alerted.get(f"{task_id}_80"):
            self._alerted[f"{task_id}_80"] = True
            alert = {
                "level": "warning", "task_id": task_id,
                "cost_usd": current_cost, "budget_usd": self.budget_usd, "ratio": ratio,
            }
            self._log.warning("budget_warning", **alert)
            return alert
        if ratio >= 0.5 and not self._alerted.get(f"{task_id}_50"):
            self._alerted[f"{task_id}_50"] = True
            alert = {
                "level": "info", "task_id": task_id,
                "cost_usd": current_cost, "budget_usd": self.budget_usd, "ratio": ratio,
            }
            self._log.info("budget_info", **alert)
            return alert

        return None

    def reset(self, task_id: str) -> None:
        for k in list(self._alerted):
            if k.startswith(task_id):
                del self._alerted[k]
