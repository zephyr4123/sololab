"""WriterAgent — single-agent orchestrator for academic paper writing.

Implements a tool-loop pattern:
  LLM call → parse tool_calls → execute tools → feed results back → repeat
until the LLM finishes without tool calls (paper complete or user query answered).

write_section is special: it's a streaming tool that yields SSE events
during execution, enabling real-time preview updates.
"""
from __future__ import annotations

import json
import logging
from typing import AsyncGenerator

from sololab.config.settings import Settings
from sololab.core.llm_gateway import LLMConfig, LLMGateway
from sololab.modules.writer.document import DocumentManager
from sololab.modules.writer.prompts.system_prompt import build_system_prompt
from sololab.modules.writer.sandbox.executor import SandboxExecutor
from sololab.modules.writer.templates.registry import TemplateRegistry
from sololab.modules.writer.tools import (
    STREAMING_TOOLS,
    WRITER_TOOLS,
    WriterToolContext,
    dispatch_tool,
)

logger = logging.getLogger(__name__)

MAX_TOOL_ROUNDS = 30  # Safety limit to prevent infinite loops


class WriterAgent:
    """Single-agent paper writing orchestrator."""

    def __init__(
        self,
        settings: Settings,
        document_manager: DocumentManager,
        template_registry: TemplateRegistry,
        sandbox_executor: SandboxExecutor | None,
        tool_registry=None,
        document_pipeline=None,
    ) -> None:
        # Create writer-specific LLM gateway (falls back to IdeaSpark config)
        base_url = settings.writer_base_url or settings.ideaspark_base_url
        api_key = settings.writer_api_key or settings.ideaspark_api_key
        model = settings.writer_model or settings.ideaspark_model

        self.llm = LLMGateway(LLMConfig(
            base_url=base_url,
            api_key=api_key,
            default_model=model,
        ))
        self.document_manager = document_manager
        self.template_registry = template_registry
        self.sandbox_executor = sandbox_executor
        self.tool_registry = tool_registry
        self.document_pipeline = document_pipeline
        self.settings = settings

    async def run(
        self,
        prompt: str,
        session_id: str,
        template_id: str = "nature",
        language: str = "auto",
        doc_id: str = "",
        cancel_event=None,
    ) -> AsyncGenerator[dict, None]:
        """Run the writing agent. Yields SSE event dicts.

        Args:
            prompt: User's writing request.
            session_id: Session ID for document association.
            template_id: Default template to use.
            language: Target language ("en", "zh", or "auto").
            doc_id: Existing document ID (for multi-turn editing).
            cancel_event: asyncio.Event for cancellation.
        """
        # Resolve template
        template = self.template_registry.get(template_id)
        if not template:
            template = self.template_registry.get("nature")

        # Check for existing document
        if not doc_id:
            existing = await self.document_manager.get_by_session(session_id)
            if existing:
                doc_id = existing["doc_id"]

        # Build document state summary
        doc_state = ""
        if doc_id:
            doc = await self.document_manager.get(doc_id)
            if doc:
                doc_state = _format_document_state(doc)
                template_id = doc.get("template_id", template_id)
                template = self.template_registry.get(template_id) or template

        # Build system prompt
        system_prompt = build_system_prompt(
            template=template,
            document_state=doc_state,
            language=language,
        )

        # Event accumulator for non-streaming tools
        pending_events: list[dict] = []

        def emit(event: dict) -> None:
            pending_events.append(event)

        # Tool context
        ctx = WriterToolContext(
            document_manager=self.document_manager,
            template_registry=self.template_registry,
            sandbox_executor=self.sandbox_executor,
            llm_gateway=self.llm,
            tool_registry=self.tool_registry,
            document_pipeline=self.document_pipeline,
            doc_id=doc_id,
            session_id=session_id,
            template_id=template_id,
            language=language if language != "auto" else "en",
            emit=emit,
        )

        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": prompt},
        ]

        total_cost = 0.0

        yield {"type": "agent", "action": "thinking", "content": "Analyzing your request..."}

        for round_num in range(MAX_TOOL_ROUNDS):
            # Check cancellation
            if cancel_event and cancel_event.is_set():
                yield {"type": "status", "status": "cancelled"}
                return

            # Call LLM
            try:
                response = await self.llm.generate(
                    messages=messages,
                    tools=WRITER_TOOLS,
                    temperature=0.7,
                    max_tokens=4096,
                )
            except Exception as e:
                logger.exception("LLM call failed in round %d", round_num)
                yield {"type": "error", "message": f"LLM call failed: {e}"}
                return

            total_cost += response["usage"].get("cost_usd", 0)

            # No tool calls → agent is done
            if not response.get("tool_calls"):
                content = response.get("content", "")
                if content:
                    yield {"type": "agent", "action": "done", "content": content}
                break

            # Append assistant message (with tool_calls) for multi-turn
            messages.append(response["raw_assistant_message"])

            # Execute each tool call
            for tc in response["tool_calls"]:
                tool_name = tc["function"]["name"]
                try:
                    tool_args = json.loads(tc["function"]["arguments"])
                except json.JSONDecodeError:
                    tool_args = {}

                yield {"type": "tool", "tool": tool_name, "status": "running", "input": tool_args}

                try:
                    result = await dispatch_tool(tool_name, tool_args, ctx)

                    if tool_name in STREAMING_TOOLS:
                        # Streaming tool — iterate the async generator
                        tool_result_str = ""
                        async for item in result:
                            if isinstance(item, dict):
                                yield item  # Forward SSE event
                            else:
                                tool_result_str = str(item)  # Final string result
                    else:
                        tool_result_str = str(result)
                        # Flush non-streaming tool events
                        for ev in pending_events:
                            yield ev
                        pending_events.clear()

                except Exception as e:
                    logger.exception("Tool '%s' failed", tool_name)
                    tool_result_str = f"Error executing {tool_name}: {e}"
                    yield {"type": "tool", "tool": tool_name, "status": "error", "error": str(e)}

                # Update doc_id if create_outline set it
                if ctx.doc_id and ctx.doc_id != doc_id:
                    doc_id = ctx.doc_id

                yield {"type": "tool", "tool": tool_name, "status": "complete"}

                # Append tool result to messages
                messages.append({
                    "role": "tool",
                    "tool_call_id": tc["id"],
                    "content": tool_result_str,
                })
        else:
            yield {"type": "agent", "action": "done", "content": "Reached maximum tool rounds. Paper may be incomplete."}

        # Final done event
        yield {
            "type": "done",
            "doc_id": doc_id,
            "cost_usd": total_cost,
            "word_count": await self._get_word_count(doc_id),
        }

    async def _get_word_count(self, doc_id: str) -> int:
        """Get total word count from document."""
        if not doc_id:
            return 0
        doc = await self.document_manager.get(doc_id)
        return doc.get("word_count", 0) if doc else 0


def _format_document_state(doc: dict) -> str:
    """Format document state for system prompt injection."""
    lines = [
        f"Title: {doc.get('title', 'Untitled')}",
        f"Template: {doc['template_id']} | Language: {doc['language']} | Status: {doc['status']}",
        f"Total words: {doc['word_count']}",
    ]

    if doc["sections"]:
        lines.append("Sections:")
        for sec in doc["sections"]:
            icon = {"empty": "○", "writing": "◐", "complete": "●"}.get(sec["status"], "?")
            lines.append(f"  {icon} [{sec['id']}] {sec['title']} — {sec.get('word_count', 0)} words")

    if doc["references"]:
        lines.append(f"References: {len(doc['references'])} cited")

    if doc["figures"]:
        lines.append(f"Figures: {len(doc['figures'])}")

    return "\n".join(lines)
