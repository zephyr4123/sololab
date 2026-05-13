"""Shared FastAPI dependencies — module context, auth, etc.

Lives under `api/` to keep `sololab.core` free of HTTP framework imports.
"""

from __future__ import annotations

from fastapi import Depends, FastAPI, Request

from sololab.core.auth import verify_api_key
from sololab.core.module_registry import ModuleContext

__all__ = [
    "build_module_context",
    "get_module_context",
    "AuthDep",
]


def build_module_context(app: FastAPI) -> ModuleContext:
    """Construct a ModuleContext from the live app's wired services."""
    return ModuleContext(
        llm_gateway=app.state.llm_gateway,
        tool_registry=app.state.tool_registry,
        memory_manager=app.state.memory_manager,
        task_state_manager=app.state.task_state_manager,
        document_pipeline=app.state.document_pipeline,
        db_session_factory=app.state.db_session,
        cost_tracker=app.state.cost_tracker,
        llm_tracer=app.state.llm_tracer,
        budget_alert=app.state.budget_alert,
    )


def get_module_context(request: Request) -> ModuleContext:
    """FastAPI dependency form — rebuild context per request."""
    return build_module_context(request.app)


# Re-exported as a clean alias so route definitions read declaratively:
#   @router.post("/...", dependencies=[AuthDep])
AuthDep = Depends(verify_api_key)
