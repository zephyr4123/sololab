"""CodeLab 模块 - AI 编码助手（基于 OpenCode 引擎）。"""

import logging
from typing import Any, AsyncGenerator

from sololab.config.settings import get_settings
from sololab.core.module_registry import (
    ModuleBase,
    ModuleContext,
    ModuleManifest,
    ModuleRequest,
)
from sololab.modules.codelab.bridge import OpenCodeBridge

logger = logging.getLogger(__name__)


class CodeLabModule(ModuleBase):
    """CodeLab：基于 OpenCode 引擎的 AI 编码助手。

    通过 HTTP 桥接层调用 OpenCode Server 的 API，
    将 AI 编码能力集成到 SoloLab 平台。
    """

    def __init__(self) -> None:
        self._bridge: OpenCodeBridge | None = None
        # SoloLab session UUID → OpenCode session ID 映射
        # 前端只知道 SoloLab 的 UUID，但 bridge 调用需要 OpenCode 的 ses_xxx ID
        self._oc_sessions: dict[str, str] = {}

    def manifest(self) -> ModuleManifest:
        return ModuleManifest(
            id="codelab",
            name="CodeLab",
            version="0.1.0",
            description="AI-powered coding assistant based on OpenCode engine",
            icon="Code",
            entry_point="sololab.modules.codelab.module:CodeLabModule",
            required_tools=[],
            required_models=["reasoning"],
            config_schema={
                "type": "object",
                "properties": {
                    "opencode_url": {
                        "type": "string",
                        "default": "http://localhost:3100",
                        "description": "OpenCode server URL",
                    },
                    "default_model": {
                        "type": "string",
                        "default": "moonshot/kimi-k2.5",
                        "description": "Default LLM model (configured in opencode/opencode.jsonc)",
                    },
                    "timeout_seconds": {
                        "type": "integer",
                        "default": 300,
                        "description": "Request timeout in seconds",
                    },
                },
            },
        )

    async def on_load(self, ctx: ModuleContext) -> None:
        """初始化 OpenCode 桥接层。"""
        settings = get_settings()
        opencode_url = getattr(settings, "opencode_url", None) or "http://localhost:3100"
        opencode_password = getattr(settings, "opencode_server_password", None) or ""
        codelab_model = getattr(settings, "codelab_model", None) or "moonshotai-cn/kimi-k2.5"

        self._bridge = OpenCodeBridge(
            base_url=opencode_url,
            username="opencode",
            password=opencode_password if opencode_password else None,
            timeout=300,
            default_directory=None,
            default_model=codelab_model,
        )
        logger.info("CodeLab 模块已加载，OpenCode Server: %s", opencode_url)

    async def on_unload(self) -> None:
        """清理资源。"""
        if self._bridge:
            await self._bridge.close()
            self._bridge = None
        logger.info("CodeLab 模块已卸载")

    async def execute(
        self, request: ModuleRequest, ctx: ModuleContext
    ) -> AsyncGenerator[Any, None]:
        """处理编码请求：创建/复用会话，发送消息，流式返回结果。

        params 支持的参数：
        - session_id: 复用已有会话（可选）
        - directory: 项目目录路径（可选）
        - action: 操作类型（chat/abort/diff/files），默认 chat
        - permission_id + allowed: 回复权限请求
        """
        if not self._bridge:
            raise RuntimeError("Module not loaded")

        action = request.params.get("action", "chat")

        if action == "browse":
            yield await self._handle_browse(request)
            return

        if action == "health":
            yield await self._handle_health()
            return

        if action == "sessions":
            yield await self._handle_list_sessions(request)
            return

        if action == "abort":
            yield await self._handle_abort(request)
            return

        if action == "diff":
            yield await self._handle_diff(request)
            return

        if action == "permission":
            yield await self._handle_permission(request)
            return

        if action == "messages":
            yield await self._handle_messages(request)
            return

        # 默认: chat
        async for event in self._handle_chat(request, ctx):
            yield event

    async def _handle_health(self) -> dict:
        """健康检查。"""
        ok = await self._bridge.health_check()
        return {"type": "health", "ok": ok}

    async def _handle_list_sessions(self, request: ModuleRequest) -> dict:
        """列出会话（按项目容器路径过滤）。"""
        from datetime import datetime, timezone

        directory = self._to_container_path(request.params.get("directory"))
        raw_sessions = await self._bridge.list_sessions(directory=directory)

        sessions = []
        for s in raw_sessions:
            if s.get("parentID"):
                continue
            time_info = s.get("time", {})
            created_ts = time_info.get("created", 0)
            created_at = ""
            if created_ts:
                created_at = datetime.fromtimestamp(created_ts / 1000, tz=timezone.utc).isoformat()
            sessions.append({
                "id": s.get("id", ""),
                "title": s.get("title", "Untitled"),
                "createdAt": created_at,
            })
        return {"type": "sessions", "sessions": sessions}

    def _resolve_oc_sid(self, sololab_sid: str | None) -> str | None:
        """将 SoloLab session UUID 解析为 OpenCode session ID。"""
        if not sololab_sid:
            return None
        return self._oc_sessions.get(sololab_sid, sololab_sid)

    async def _handle_abort(self, request: ModuleRequest) -> dict:
        """中止会话。"""
        session_id = self._resolve_oc_sid(request.params.get("session_id"))
        if not session_id:
            return {"type": "error", "error": "session_id is required for abort"}
        await self._bridge.abort_session(session_id)
        return {"type": "aborted", "session_id": session_id}

    async def _handle_diff(self, request: ModuleRequest) -> dict:
        """获取会话 diff。"""
        session_id = self._resolve_oc_sid(request.params.get("session_id"))
        if not session_id:
            return {"type": "error", "error": "session_id is required for diff"}
        diff = await self._bridge.get_session_diff(session_id)
        return {"type": "diff", "session_id": session_id, "diff": diff}

    async def _handle_permission(self, request: ModuleRequest) -> dict:
        """回复权限请求。"""
        permission_id = request.params.get("permission_id")
        allowed = request.params.get("allowed", False)
        if not permission_id:
            return {"type": "error", "error": "permission_id is required"}
        await self._bridge.reply_permission(permission_id, allowed)
        return {"type": "permission_replied", "permission_id": permission_id, "allowed": allowed}

    async def _handle_messages(self, request: ModuleRequest) -> dict:
        """获取会话消息历史（从 OpenCode 获取）。"""
        session_id = self._resolve_oc_sid(request.params.get("session_id"))
        if not session_id:
            return {"type": "messages", "messages": []}
        try:
            messages = await self._bridge.get_messages(session_id)
            return {"type": "messages", "messages": messages}
        except Exception as e:
            logger.warning("获取消息历史失败: %s", e)
            return {"type": "messages", "messages": [], "error": str(e)}

    async def _handle_browse(self, request: ModuleRequest) -> dict:
        """Browse workspace directories (mounted at /workspace from WORKSPACE_DIR)."""
        import os

        MOUNT_ROOT = "/workspace"
        workspace_dir = os.environ.get("WORKSPACE_DIR", "")
        raw_path = request.params.get("path", "~")

        try:
            # Map host paths → container /workspace/...
            if raw_path == "~" or raw_path == workspace_dir:
                target = MOUNT_ROOT
            elif workspace_dir and raw_path.startswith(workspace_dir):
                rel = raw_path[len(workspace_dir):]
                target = MOUNT_ROOT + rel
            elif raw_path.startswith(MOUNT_ROOT):
                target = raw_path
            elif os.path.exists(raw_path):
                target = raw_path
            else:
                target = MOUNT_ROOT

            target = os.path.abspath(target)

            # Security: prevent path traversal outside workspace
            if not target.startswith(MOUNT_ROOT):
                target = MOUNT_ROOT

            def to_host_path(container_path: str) -> str:
                """Map /workspace/... back to host path for display."""
                if container_path.startswith(MOUNT_ROOT):
                    rel = container_path[len(MOUNT_ROOT):]
                    return workspace_dir + rel if workspace_dir else container_path
                return container_path

            entries = []
            for name in sorted(os.listdir(target)):
                if name.startswith("."):
                    continue
                full = os.path.join(target, name)
                if os.path.isdir(full):
                    is_project = any(
                        os.path.exists(os.path.join(full, m))
                        for m in [".git", "package.json", "pyproject.toml", "Cargo.toml", "go.mod", "pom.xml", "Makefile"]
                    )
                    entries.append({
                        "name": name,
                        "path": to_host_path(full),
                        "type": "directory",
                        "isProject": is_project,
                    })

            parent = os.path.dirname(target) if target != "/" and target != MOUNT_ROOT else None

            return {
                "type": "browse",
                "path": to_host_path(target),
                "parent": to_host_path(parent) if parent else None,
                "entries": entries,
            }
        except (OSError, PermissionError) as e:
            return {"type": "browse", "path": raw_path, "parent": None, "entries": [], "error": str(e)}

    @staticmethod
    def _to_container_path(host_path: str | None) -> str | None:
        """Map host path to OpenCode container path (/workspace/...)."""
        if not host_path:
            return None
        import os
        workspace_dir = os.environ.get("WORKSPACE_DIR", "")
        if workspace_dir and host_path.startswith(workspace_dir):
            return "/workspace" + host_path[len(workspace_dir):]
        return host_path

    async def _handle_chat(
        self, request: ModuleRequest, ctx: ModuleContext
    ) -> AsyncGenerator[dict, None]:
        """处理编码对话：创建/复用会话 → 发送消息 → 流式返回。

        注意两套 session ID 体系：
        - SoloLab session ID (UUID): 前端通过 params["session_id"] 传入
        - OpenCode session ID (ses_xxx): bridge 调用 OpenCode Server 时使用
        通过 self._oc_sessions 维护映射关系。
        """
        sololab_sid = request.params.get("session_id")
        directory = self._to_container_path(request.params.get("directory"))

        # 查找或创建 OpenCode 会话
        oc_sid = self._oc_sessions.get(sololab_sid) if sololab_sid else None

        if not oc_sid:
            session_data = await self._bridge.create_session(directory=directory)
            oc_sid = session_data.get("id") or session_data.get("sessionID")
            # 建立映射（SoloLab UUID → OpenCode ses_xxx）
            if sololab_sid:
                self._oc_sessions[sololab_sid] = oc_sid
            yield {
                "type": "session_created",
                "session_id": oc_sid,
                "session": session_data,
            }

        yield {"type": "status", "phase": "sending", "session_id": oc_sid}

        # 流式接收 Agent 响应，翻译 OpenCode 原生事件为前端格式
        done_sent = False
        total_cost = 0.0

        # ── 子 session 并行任务追踪 ──
        # 时序问题：子 session 事件（glob/read/grep）在父 session 的 task tool
        # metadata 更新（包含 child_sid）之前就开始到达。
        # 解决方案：
        # 1. 所有非父 session 的事件都缓存到 pending_child_events[evt_sid]
        # 2. 当父 session 的 task tool running 事件携带 child_sid 时，
        #    注册追踪并 flush 缓存的事件
        # 3. 后续到达的已追踪子 session 事件直接转发
        child_sessions: dict[str, dict] = {}  # child_sid → {agent, description}
        pending_child_events: dict[str, list] = {}  # unknown_sid → [events]

        async def _abort_all():
            """Abort 父 session + 所有已追踪子 session，防止 API 持续计费。"""
            for csid in list(child_sessions.keys()):
                try:
                    await self._bridge.abort_session(csid)
                except Exception:
                    pass
            try:
                await self._bridge.abort_session(oc_sid)
            except Exception:
                pass

        try:
          async for event in self._bridge.send_message(oc_sid, request.input, directory=directory):
            if ctx.cancel_event and ctx.cancel_event.is_set():
                await _abort_all()
                yield {"type": "cancelled", "session_id": oc_sid}
                return

            evt_sid = event.get("properties", {}).get("sessionID", "")
            etype = event.get("type", "")
            props = event.get("properties", {})

            # ── 子 session 事件处理 ──
            if evt_sid and evt_sid != oc_sid:
                # 累积子 session 的 cost
                if etype == "message.updated":
                    info = props.get("info", {})
                    if info.get("finish") and info.get("role") == "assistant":
                        total_cost += info.get("cost", 0)

                if evt_sid in child_sessions:
                    # 已追踪 → 直接转发
                    child_event = self._translate_child_event(event, evt_sid)
                    if child_event:
                        yield child_event
                else:
                    # 未追踪 → 缓存（等待父 session 的 metadata 注册）
                    if evt_sid not in pending_child_events:
                        pending_child_events[evt_sid] = []
                    pending_child_events[evt_sid].append(event)
                continue

            # ── 父 session 事件 ──

            # 累积 cost
            if etype == "message.updated":
                info = props.get("info", {})
                if info.get("finish") and info.get("role") == "assistant":
                    total_cost += info.get("cost", 0)

            # 检测 task 工具的状态变化，管理子 session 生命周期
            if etype == "message.part.updated":
                part = props.get("part", {})
                if part.get("type") == "tool" and part.get("tool") == "task":
                    state = part.get("state", {})
                    metadata = state.get("metadata") or {}
                    child_sid = metadata.get("sessionId", "")
                    status = state.get("status", "")
                    tool_input = state.get("input", {})

                    if status == "running" and child_sid and child_sid not in child_sessions:
                        # ── 新子 agent 注册 ──
                        agent_type = tool_input.get("subagent_type", "explore")
                        description = tool_input.get("description", "")
                        child_sessions[child_sid] = {
                            "agent": agent_type,
                            "description": description,
                        }
                        yield {
                            "type": "parallel_task_start",
                            "task_id": child_sid,
                            "agent": agent_type,
                            "description": description,
                        }

                        # ── Flush 缓存的子 session 事件 ──
                        buffered = pending_child_events.pop(child_sid, [])
                        for buffered_event in buffered:
                            child_event = self._translate_child_event(buffered_event, child_sid)
                            if child_event:
                                yield child_event

                    elif status == "completed" and child_sid and child_sid in child_sessions:
                        structured = metadata.get("structured", {})
                        yield {
                            "type": "parallel_task_done",
                            "task_id": child_sid,
                            "summary": structured.get("summary", ""),
                            "files_read": structured.get("filesRead", []),
                            "files_modified": structured.get("filesModified", []),
                            "errors": structured.get("errors", []),
                            "timed_out": metadata.get("timedOut", False),
                        }
                        child_sessions.pop(child_sid, None)
                        pending_child_events.pop(child_sid, None)

                    elif status == "error" and child_sid and child_sid in child_sessions:
                        error_msg = state.get("error", "Task failed")
                        yield {
                            "type": "parallel_task_done",
                            "task_id": child_sid,
                            "summary": "",
                            "errors": [error_msg],
                            "status": "error",
                        }
                        child_sessions.pop(child_sid, None)
                        pending_child_events.pop(child_sid, None)

                    # task 工具事件不转发为普通 tool 事件（避免空卡片）
                    continue

            translated = self._translate_event(event)
            if translated:
                if translated.get("type") == "done":
                    # 只接受来自当前会话的 done 信号
                    evt_sid = translated.get("session_id")
                    if evt_sid and evt_sid != oc_sid:
                        continue
                    translated["cost_usd"] = total_cost
                    translated["session_id"] = oc_sid
                    yield translated
                    done_sent = True
                    return

                yield translated

        except Exception as e:
            logger.error("_handle_chat 异常: %s", e)
            yield {"type": "error", "message": str(e)}
        finally:
            # 确保前端断开、异常、正常结束时都清理所有子 session
            if child_sessions:
                logger.info("清理 %d 个子 session", len(child_sessions))
                await _abort_all()

        if not done_sent:
            yield {"type": "done", "session_id": oc_sid, "cost_usd": total_cost}

    @staticmethod
    def _translate_event(event: dict) -> dict | None:
        """Translate OpenCode SSE events to SoloLab frontend format.

        关键：OpenCode 的 agent 循环中，一条用户消息可能产生多条 assistant 消息：
        - 消息1: LLM 决定调用工具 → finish="tool-calls" → 循环继续
        - 消息2: LLM 基于工具结果生成回答 → finish="stop" → 循环结束
        因此 message.updated(finish) 不能直接映射为 done。
        真正的完成信号是 session.status(idle)。
        """
        etype = event.get("type", "")
        props = event.get("properties", {})

        # Text streaming
        if etype == "message.part.delta":
            delta = props.get("delta", "")
            if delta:
                return {"type": "text", "content": delta}

        # Agent / model info from message updates
        # 注意：finish 字段不作为 done 信号，cost 在 _handle_chat 中累积
        if etype == "message.updated":
            info = props.get("info", {})
            if info.get("role") != "assistant":
                return None
            agent = info.get("agent", "")
            finish = info.get("finish")

            if not finish and agent:
                # 新的 assistant 消息开始（agent 开始思考）
                return {"type": "agent", "agent": agent, "action": "thinking"}
            # finish 存在时不发事件（cost/tokens 在 _handle_chat 中追踪）
            return None

        # Tool calls
        if etype == "message.part.updated":
            part = props.get("part", {})
            part_type = part.get("type", "")

            if part_type == "tool":
                tool_name = part.get("tool", "unknown")
                # task 工具由 _handle_chat 的并行任务追踪器处理，不在此转发
                # （避免产生空的 ToolCallCard）
                if tool_name == "task":
                    return None
                state = part.get("state", {})
                status = state.get("status", "running")
                tool_input = state.get("input", {})
                title = state.get("title", tool_name)
                output = state.get("output", "")
                metadata = state.get("metadata") or {}

                result: dict = {
                    "type": "tool",
                    "tool": tool_name,
                    "status": status,
                    "title": title,
                    "input": tool_input,
                    "output": output if status == "completed" else "",
                }

                # 透传 edit 工具的 fileDiff 数据（供前端渲染代码变更）
                if status == "completed" and tool_name == "edit":
                    file_diff = metadata.get("filediff")
                    if file_diff:
                        result["fileDiff"] = {
                            "file": file_diff.get("file", ""),
                            "additions": file_diff.get("additions", 0),
                            "deletions": file_diff.get("deletions", 0),
                            "before": file_diff.get("before", ""),
                            "after": file_diff.get("after", ""),
                        }

                # 透传 write 工具的文件存在状态
                if status == "completed" and tool_name == "write":
                    result["isNewFile"] = not metadata.get("exists", True)

                return result

            if part_type == "step-start":
                return {"type": "agent", "agent": "build", "action": "thinking"}

            if part_type == "step-finish":
                cost = part.get("cost", 0)
                return {"type": "status", "phase": "step_complete", "cost_usd": cost}

        # Session status — idle 表示 prompt 循环完成
        if etype == "session.status":
            status = props.get("status", {})
            if status.get("type") == "idle":
                return {"type": "done", "session_id": props.get("sessionID")}

        # Session title update
        if etype == "session.updated":
            info = props.get("info", {})
            title = info.get("title", "")
            if title:
                return {"type": "status", "phase": "session_update", "title": title}

        # Errors from OpenCode
        if etype == "error":
            return {"type": "error", "message": event.get("error", "Unknown error")}

        if etype == "session.error":
            error_obj = props.get("error", {})
            if isinstance(error_obj, dict):
                msg = (error_obj.get("data", {}).get("message", "")
                       or error_obj.get("name", "Unknown error"))
            else:
                msg = str(error_obj)
            return {"type": "error", "message": msg or "Unknown error"}

        return None

    @staticmethod
    def _translate_child_event(event: dict, child_sid: str) -> dict | None:
        """Translate child session (subtask) events for parallel task visualization.

        Only forwards tool call updates and text deltas — everything else is ignored.
        """
        etype = event.get("type", "")
        props = event.get("properties", {})

        # Child session tool calls → parallel_task_tool
        if etype == "message.part.updated":
            part = props.get("part", {})
            if part.get("type") == "tool":
                tool_name = part.get("tool", "unknown")
                # Don't forward nested task tool events from child (avoid recursion noise)
                if tool_name == "task":
                    return None
                state = part.get("state", {})
                status = state.get("status", "running")
                tool_input = state.get("input", {})
                title = state.get("title", tool_name)
                output = state.get("output", "")
                return {
                    "type": "parallel_task_tool",
                    "task_id": child_sid,
                    "tool": tool_name,
                    "status": status,
                    "title": title,
                    "input": tool_input,
                    "output": output if status == "completed" else "",
                }

        # Child session text streaming → parallel_task_text
        if etype == "message.part.delta":
            delta = props.get("delta", "")
            if delta:
                return {
                    "type": "parallel_task_text",
                    "task_id": child_sid,
                    "content": delta,
                }

        return None
