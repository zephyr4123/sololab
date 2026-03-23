"""可观测性 - 结构化日志、消息追踪、费用监控。"""

import logging
import time
from contextvars import ContextVar
from typing import Any, Dict, List, Optional

import structlog

# 请求级上下文
_request_id: ContextVar[str] = ContextVar("request_id", default="")
_task_id: ContextVar[str] = ContextVar("task_id", default="")

# 配置 structlog
def setup_logging(log_level: str = "INFO", json_output: bool = True) -> None:
    """配置结构化日志系统。"""
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
    """获取结构化日志记录器。"""
    return structlog.get_logger(name)


class LLMCallTracer:
    """LLM 调用追踪器 - 记录每次调用的详细信息。

    追踪信息包括：
    - agent_name: 调用的智能体名称
    - model: 使用的模型
    - tokens: 输入/输出 token 数
    - latency: 响应延迟（秒）
    - cost_usd: 费用
    """

    def __init__(self) -> None:
        self._log = get_logger("llm_tracer")
        self._traces: List[Dict[str, Any]] = []

    def start_trace(
        self,
        agent_name: str = "",
        model: str = "",
        task_id: str = "",
    ) -> Dict[str, Any]:
        """开始追踪一次 LLM 调用。"""
        trace = {
            "agent_name": agent_name,
            "model": model,
            "task_id": task_id or _task_id.get(""),
            "start_time": time.time(),
            "end_time": 0.0,
            "latency_ms": 0.0,
            "prompt_tokens": 0,
            "completion_tokens": 0,
            "cost_usd": 0.0,
            "status": "running",
            "error": None,
        }
        return trace

    def end_trace(
        self,
        trace: Dict[str, Any],
        usage: Optional[Dict] = None,
        error: Optional[str] = None,
    ) -> Dict[str, Any]:
        """结束追踪，记录结果。"""
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

        # 结构化日志记录
        self._log.info(
            "llm_call",
            agent=trace["agent_name"],
            model=trace["model"],
            task_id=trace["task_id"],
            latency_ms=trace["latency_ms"],
            prompt_tokens=trace["prompt_tokens"],
            completion_tokens=trace["completion_tokens"],
            cost_usd=trace["cost_usd"],
            status=trace["status"],
        )

        return trace

    def get_traces(self, task_id: Optional[str] = None, limit: int = 100) -> List[Dict]:
        """获取追踪记录。"""
        if task_id:
            return [t for t in self._traces if t["task_id"] == task_id][-limit:]
        return self._traces[-limit:]

    def get_summary(self, task_id: Optional[str] = None) -> Dict:
        """获取追踪统计摘要。"""
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
        groups = {}
        for t in traces:
            k = t.get(key, "unknown")
            if k not in groups:
                groups[k] = {"calls": 0, "tokens": 0, "cost_usd": 0.0}
            groups[k]["calls"] += 1
            groups[k]["tokens"] += t["prompt_tokens"] + t["completion_tokens"]
            groups[k]["cost_usd"] += t["cost_usd"]
        return groups


class MessageTracer:
    """消息追踪器 - 追踪黑板消息的引用链。"""

    def __init__(self) -> None:
        self._references: Dict[str, List[str]] = {}  # message_id -> referenced_by
        self._log = get_logger("msg_tracer")

    def track_message(self, message_id: str, references: List[str] = []) -> None:
        """追踪消息及其引用关系。"""
        for ref_id in references:
            if ref_id not in self._references:
                self._references[ref_id] = []
            self._references[ref_id].append(message_id)

        self._log.debug(
            "message_tracked",
            message_id=message_id,
            references=references,
        )

    def get_reference_chain(self, message_id: str, depth: int = 10) -> List[str]:
        """获取消息的引用链（被谁引用）。"""
        chain = []
        visited = set()

        def _walk(mid: str, d: int) -> None:
            if d <= 0 or mid in visited:
                return
            visited.add(mid)
            referencing = self._references.get(mid, [])
            chain.extend(referencing)
            for ref in referencing:
                _walk(ref, d - 1)

        _walk(message_id, depth)
        return chain

    def get_orphan_messages(self, all_message_ids: List[str]) -> List[str]:
        """找出没有被任何消息引用的孤立消息。"""
        referenced = set()
        for refs in self._references.values():
            referenced.update(refs)
        # 也包括引用了其他消息的
        for mid in self._references:
            referenced.add(mid)
        return [mid for mid in all_message_ids if mid not in referenced]


class BudgetAlert:
    """预算告警 - 费用超过阈值时触发告警。"""

    def __init__(self, budget_usd: float = 5.0) -> None:
        self.budget_usd = budget_usd
        self._log = get_logger("budget_alert")
        self._alerted: Dict[str, bool] = {}  # task_id -> already_alerted

    def check(self, task_id: str, current_cost: float) -> Optional[Dict]:
        """检查费用是否超过预算阈值。"""
        ratio = current_cost / self.budget_usd if self.budget_usd > 0 else 0

        if ratio >= 1.0 and not self._alerted.get(f"{task_id}_100"):
            self._alerted[f"{task_id}_100"] = True
            alert = {"level": "critical", "task_id": task_id, "cost_usd": current_cost, "budget_usd": self.budget_usd, "ratio": ratio}
            self._log.error("budget_exceeded", **alert)
            return alert
        elif ratio >= 0.8 and not self._alerted.get(f"{task_id}_80"):
            self._alerted[f"{task_id}_80"] = True
            alert = {"level": "warning", "task_id": task_id, "cost_usd": current_cost, "budget_usd": self.budget_usd, "ratio": ratio}
            self._log.warning("budget_warning", **alert)
            return alert
        elif ratio >= 0.5 and not self._alerted.get(f"{task_id}_50"):
            self._alerted[f"{task_id}_50"] = True
            alert = {"level": "info", "task_id": task_id, "cost_usd": current_cost, "budget_usd": self.budget_usd, "ratio": ratio}
            self._log.info("budget_info", **alert)
            return alert

        return None

    def reset(self, task_id: str) -> None:
        """重置任务的告警状态。"""
        keys = [k for k in self._alerted if k.startswith(task_id)]
        for k in keys:
            del self._alerted[k]
