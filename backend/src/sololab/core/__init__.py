"""SoloLab core services.

Re-exports the dependency-injectable primitives most callers need:
gateways, registries, observability hooks, auth helpers.
"""

from sololab.core.auth import APIKeyAuth, verify_api_key
from sololab.core.cost_tracker import BudgetExceededError, CostTracker
from sololab.core.llm_gateway import LLMConfig, LLMGateway
from sololab.core.module_registry import (
    ModuleBase,
    ModuleContext,
    ModuleManifest,
    ModuleRegistry,
    ModuleRequest,
)
from sololab.core.observability import (
    BudgetAlert,
    LLMCallTracer,
    RequestContextMiddleware,
    get_logger,
    get_request_id,
    get_task_id,
    setup_logging,
    task_context,
)
from sololab.core.rate_limiter import RateLimitConfig, RateLimitMiddleware
from sololab.core.task_state_manager import TaskStateManager
from sololab.core.tool_registry import ToolBase, ToolRegistry, ToolResult

__all__ = [
    # auth
    "APIKeyAuth",
    "verify_api_key",
    # cost / budget
    "CostTracker",
    "BudgetExceededError",
    "BudgetAlert",
    # llm
    "LLMConfig",
    "LLMGateway",
    "LLMCallTracer",
    # modules
    "ModuleBase",
    "ModuleContext",
    "ModuleManifest",
    "ModuleRegistry",
    "ModuleRequest",
    # tools
    "ToolBase",
    "ToolRegistry",
    "ToolResult",
    # observability
    "RequestContextMiddleware",
    "get_logger",
    "get_request_id",
    "get_task_id",
    "setup_logging",
    "task_context",
    # rate limiting
    "RateLimitConfig",
    "RateLimitMiddleware",
    # task state
    "TaskStateManager",
]
