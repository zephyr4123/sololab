"""WriterAgent — single-agent orchestrator for academic paper writing.

Architecture: multi-layer prompt system
  Layer 1  static system prompt        (prompts/system_prompt.py — role, rules, workflow)
  Layer 2  dynamic state anchor        (prompts/state.py — injected per turn)
  Layer 3  tool result augmentation    (prompts/state.py — post-tool guidance)
  Layer 4  agent-side invariant hooks  (this file — language lock, placeholder queue)

Implements a tool-loop pattern:
  LLM call → parse tool_calls → execute tools → feed augmented results back → repeat
until the LLM finishes without tool calls (paper complete or user query answered).

write_section is a streaming tool that yields SSE events during execution,
enabling real-time preview updates.
"""
from __future__ import annotations

import json
import logging
from typing import AsyncGenerator

from sololab.config.settings import Settings
from sololab.core.llm_gateway import LLMConfig, LLMGateway
from sololab.modules.writer.document import DocumentManager
from sololab.modules.writer.prompts.state import (
    augment_insert_figure_result,
    augment_write_section_result,
    build_state_anchor,
    detect_paper_language,
    extract_placeholders,
    merge_pending_placeholders,
    pop_pending_placeholder,
)
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
MAX_CONVERSATION_TURNS = 5  # How many prior turns to replay into context


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

        # Load the latest document state (used for state anchor + template resolution)
        doc_snapshot: dict | None = None
        if doc_id:
            doc_snapshot = await self.document_manager.get(doc_id)
            if doc_snapshot:
                template_id = doc_snapshot.get("template_id", template_id)
                template = self.template_registry.get(template_id) or template

        # Layer 1 — static system prompt (role, rules, workflow protocol)
        system_prompt = build_system_prompt(
            template=template,
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

        # Replay up to the last MAX_CONVERSATION_TURNS turns of prior conversation.
        # Each turn is the FULL message sequence (user → assistant → tool ... → assistant)
        # so tool_call IDs stay paired. The system prompt is always rebuilt fresh
        # so the latest doc state is reflected.
        prior_messages: list[dict] = []
        if doc_id:
            try:
                prior_turns = await self.document_manager.get_conversation(
                    doc_id, max_turns=MAX_CONVERSATION_TURNS
                )
                for turn in prior_turns:
                    prior_messages.extend(turn.get("messages", []))
            except Exception:  # noqa: BLE001
                logger.exception("Failed to load conversation history for doc %s", doc_id)

        # Layer 2 — dynamic state anchor, injected into the user message so it
        # sits in the LLM's most recent attention window (not diluted by prior
        # turn history). Only present when we have an actual document to anchor.
        meta = (doc_snapshot.get("metadata") if doc_snapshot else None) or {}
        language_lock = meta.get("language_lock")
        pending_placeholders: list[dict] = meta.get("pending_placeholders", []) or []

        if doc_snapshot:
            anchor = build_state_anchor(doc_snapshot, language_lock, pending_placeholders)
            user_content = f"{anchor}\n\n---\n\n# User Request\n\n{prompt}"
        else:
            user_content = prompt

        messages = [
            {"role": "system", "content": system_prompt},
            *prior_messages,
            {"role": "user", "content": user_content},
        ]
        new_turn_start = len(messages) - 1  # Slice index where this turn's messages begin
        turn_completed_cleanly = False

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
                # Persist the final assistant message so the next turn sees it
                final_msg = response.get("raw_assistant_message")
                if final_msg is not None:
                    messages.append(final_msg)
                turn_completed_cleanly = True
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

                # Layer 4 — post-tool state hooks. Soft guidance only: we update
                # metadata and augment the tool result string, but never reject
                # or silently rewrite the LLM's work.
                tool_result_str = await self._apply_state_hooks(
                    tool_name=tool_name,
                    tool_args=tool_args,
                    tool_result_str=tool_result_str,
                    doc_id=doc_id,
                )

                yield {"type": "tool", "tool": tool_name, "status": "complete"}

                # Append tool result to messages
                messages.append({
                    "role": "tool",
                    "tool_call_id": tc["id"],
                    "content": tool_result_str,
                })
        else:
            yield {"type": "agent", "action": "done", "content": "Reached maximum tool rounds. Paper may be incomplete."}

        # Persist this turn's messages so the next turn can replay them.
        # Only save on clean exit — partial turns can leave dangling tool_call
        # ids that would break OpenAI validation on the next call.
        if turn_completed_cleanly and doc_id:
            try:
                await self.document_manager.append_conversation_turn(
                    doc_id,
                    messages[new_turn_start:],
                    max_turns=MAX_CONVERSATION_TURNS,
                )
            except Exception:  # noqa: BLE001
                logger.exception("Failed to persist conversation turn for doc %s", doc_id)

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

    async def _apply_state_hooks(
        self,
        *,
        tool_name: str,
        tool_args: dict,
        tool_result_str: str,
        doc_id: str,
    ) -> str:
        """Post-tool invariant hooks + tool-result augmentation (Layers 3 & 4).

        - write_section: detect/lock language, extract placeholders into
          pending queue, enrich return with next-action guidance.
        - insert_figure: pop filled placeholder from queue, show remaining.
        - All other tools: pass through unchanged.

        Soft only — we never reject work or silently modify the LLM's output.
        """
        if not doc_id:
            return tool_result_str

        try:
            if tool_name == "write_section":
                return await self._hook_write_section(tool_args, tool_result_str, doc_id)
            if tool_name == "insert_figure":
                return await self._hook_insert_figure(tool_args, tool_result_str, doc_id)
        except Exception:  # noqa: BLE001
            logger.exception("State hook failed for tool '%s' — returning raw result", tool_name)
        return tool_result_str

    async def _hook_write_section(
        self, tool_args: dict, tool_result_str: str, doc_id: str
    ) -> str:
        section_id = tool_args.get("section_id", "")
        if not section_id:
            return tool_result_str

        fresh = await self.document_manager.get(doc_id)
        if not fresh:
            return tool_result_str
        section = next(
            (s for s in fresh.get("sections", []) if s.get("id") == section_id),
            None,
        )
        if not section or not section.get("content"):
            return tool_result_str

        meta = fresh.get("metadata") or {}
        current_lock = meta.get("language_lock")
        existing_pending = meta.get("pending_placeholders", []) or []

        # Language detection & lock
        detected = detect_paper_language(section["content"])
        language_violation: tuple[str, str] | None = None
        metadata_patch: dict = {}

        if detected:
            if not current_lock:
                metadata_patch["language_lock"] = detected
                logger.info(
                    "Language lock set to '%s' for doc %s (from section '%s')",
                    detected,
                    doc_id,
                    section.get("title"),
                )
            elif detected != current_lock:
                language_violation = (current_lock, detected)
                logger.warning(
                    "Language mismatch in write_section for doc %s: locked=%s, detected=%s",
                    doc_id,
                    current_lock,
                    detected,
                )

        # Placeholder extraction → pending queue
        placeholders = extract_placeholders(section["content"])
        if placeholders or any(p.get("section_id") == section_id for p in existing_pending):
            new_pending = merge_pending_placeholders(
                existing_pending,
                placeholders,
                section_id=section_id,
                section_title=section.get("title", ""),
            )
            metadata_patch["pending_placeholders"] = new_pending

        if metadata_patch:
            await self.document_manager.update_metadata(doc_id, metadata_patch)

        return augment_write_section_result(
            tool_result_str,
            placeholders=placeholders,
            section_id=section_id,
            section_title=section.get("title", ""),
            language_violation=language_violation,
        )

    async def _hook_insert_figure(
        self, tool_args: dict, tool_result_str: str, doc_id: str
    ) -> str:
        placeholder = (tool_args.get("placeholder") or "").strip()
        section_id = tool_args.get("section_id", "")

        fresh = await self.document_manager.get(doc_id)
        if not fresh:
            return tool_result_str
        meta = fresh.get("metadata") or {}
        existing_pending = meta.get("pending_placeholders", []) or []

        if placeholder and section_id:
            remaining = pop_pending_placeholder(existing_pending, placeholder, section_id)
            if len(remaining) != len(existing_pending):
                await self.document_manager.update_metadata(
                    doc_id, {"pending_placeholders": remaining}
                )
        else:
            remaining = existing_pending

        return augment_insert_figure_result(tool_result_str, remaining)
