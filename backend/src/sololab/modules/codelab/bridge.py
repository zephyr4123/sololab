"""OpenCode 桥接层 - 通过 HTTP 调用 OpenCode Server API。"""

import asyncio
import json
import logging
from typing import Any, AsyncGenerator, Dict, List, Optional

import aiohttp

logger = logging.getLogger(__name__)


class OpenCodeBridge:
    """SoloLab 后端与 OpenCode Server 之间的 HTTP 桥接。

    负责将 SoloLab 的 CodeLab 请求转发到 OpenCode Server 的 Hono API，
    并将响应流式返回给 SoloLab 前端。
    """

    def __init__(
        self,
        base_url: str = "http://localhost:3100",
        username: str = "opencode",
        password: Optional[str] = None,
        timeout: int = 300,
        default_directory: Optional[str] = None,
    ) -> None:
        self._base_url = base_url.rstrip("/")
        self._username = username
        self._password = password
        self._timeout = aiohttp.ClientTimeout(total=timeout)
        self._session: Optional[aiohttp.ClientSession] = None
        self._default_directory = default_directory

    async def _get_session(self) -> aiohttp.ClientSession:
        """获取或创建 aiohttp 会话（懒初始化）。"""
        if self._session is None or self._session.closed:
            auth = None
            if self._password:
                auth = aiohttp.BasicAuth(self._username, self._password)
            self._session = aiohttp.ClientSession(
                timeout=self._timeout,
                auth=auth,
            )
        return self._session

    async def close(self) -> None:
        """关闭 HTTP 会话。"""
        if self._session and not self._session.closed:
            await self._session.close()

    def _dir_params(self, directory: Optional[str] = None) -> Dict[str, str]:
        """构建带 directory 的查询参数（OpenCode 需要 workspace context）。"""
        d = directory or self._default_directory
        return {"directory": d} if d else {}

    def _dir_headers(self, directory: Optional[str] = None) -> Dict[str, str]:
        """构建带 directory 的 header（备选方式）。"""
        d = directory or self._default_directory
        return {"x-opencode-directory": d} if d else {}

    async def health_check(self) -> bool:
        """检查 OpenCode Server 是否可用。"""
        try:
            session = await self._get_session()
            async with session.get(f"{self._base_url}/global/session") as resp:
                return resp.status == 200
        except (aiohttp.ClientError, asyncio.TimeoutError) as e:
            logger.warning("OpenCode Server 健康检查失败: %s", e)
            return False

    # ── Session API ──────────────────────────────

    async def create_session(self, directory: Optional[str] = None) -> Dict[str, Any]:
        """创建新的编码会话。"""
        session = await self._get_session()
        params = self._dir_params(directory)
        async with session.post(
            f"{self._base_url}/session", params=params, json={}
        ) as resp:
            resp.raise_for_status()
            return await resp.json()

    async def get_session(self, session_id: str) -> Dict[str, Any]:
        """获取会话详情。"""
        session = await self._get_session()
        params = self._dir_params()
        async with session.get(
            f"{self._base_url}/session/{session_id}", params=params
        ) as resp:
            resp.raise_for_status()
            return await resp.json()

    async def list_sessions(
        self,
        directory: Optional[str] = None,
        limit: Optional[int] = None,
    ) -> List[Dict[str, Any]]:
        """列出编码会话。"""
        session = await self._get_session()
        params = self._dir_params(directory)
        if limit is not None:
            params["limit"] = str(limit)
        async with session.get(f"{self._base_url}/session", params=params) as resp:
            resp.raise_for_status()
            return await resp.json()

    async def delete_session(self, session_id: str) -> bool:
        """删除会话。"""
        session = await self._get_session()
        params = self._dir_params()
        async with session.delete(
            f"{self._base_url}/session/{session_id}", params=params
        ) as resp:
            resp.raise_for_status()
            return True

    # ── Message API ──────────────────────────────

    async def get_messages(self, session_id: str) -> List[Dict[str, Any]]:
        """获取会话消息列表。"""
        session = await self._get_session()
        params = self._dir_params()
        async with session.get(
            f"{self._base_url}/session/{session_id}/message", params=params
        ) as resp:
            resp.raise_for_status()
            return await resp.json()

    async def send_message(
        self,
        session_id: str,
        content: str,
    ) -> AsyncGenerator[Dict[str, Any], None]:
        """发送消息并流式接收 Agent 响应。

        使用 prompt_async 端点发送消息，然后通过 event 端点监听响应事件。
        """
        http_session = await self._get_session()

        # 发送 prompt（异步模式 — OpenCode 需要 parts 数组格式）
        params = self._dir_params()
        async with http_session.post(
            f"{self._base_url}/session/{session_id}/prompt_async",
            params=params,
            json={"parts": [{"type": "text", "text": content}]},
        ) as resp:
            resp.raise_for_status()

        # 监听 SSE 事件流
        async for event in self._stream_events(session_id):
            yield event

    async def _stream_events(
        self,
        session_id: str,
    ) -> AsyncGenerator[Dict[str, Any], None]:
        """监听会话的 SSE 事件流。"""
        http_session = await self._get_session()
        params = self._dir_params()
        url = f"{self._base_url}/event"
        if params:
            qs = "&".join(f"{k}={v}" for k, v in params.items())
            url = f"{url}?{qs}"
        try:
            async with http_session.get(url, timeout=aiohttp.ClientTimeout(total=0)) as resp:
                resp.raise_for_status()
                buffer = ""
                async for chunk in resp.content:
                    buffer += chunk.decode("utf-8", errors="replace")
                    while "\n\n" in buffer:
                        event_str, buffer = buffer.split("\n\n", 1)
                        event = self._parse_sse_event(event_str)
                        if event is None:
                            continue

                        yield event

                        # 检测会话是否结束
                        event_type = event.get("type", "")
                        if event_type in ("session.complete", "session.error"):
                            return
        except (aiohttp.ClientError, asyncio.TimeoutError) as e:
            logger.error("SSE 事件流断开: %s", e)
            yield {"type": "error", "error": str(e)}

    @staticmethod
    def _parse_sse_event(raw: str) -> Optional[Dict[str, Any]]:
        """解析 SSE 事件文本为字典。"""
        data_lines = []
        event_type = None
        for line in raw.strip().split("\n"):
            if line.startswith("data:"):
                data_lines.append(line[5:].strip())
            elif line.startswith("event:"):
                event_type = line[6:].strip()

        if not data_lines:
            return None

        data_str = "\n".join(data_lines)
        try:
            data = json.loads(data_str)
        except json.JSONDecodeError:
            data = {"raw": data_str}

        if event_type:
            data["type"] = event_type
        return data

    # ── Abort / Permission API ───────────────────

    async def abort_session(self, session_id: str) -> bool:
        """中止当前会话执行。"""
        session = await self._get_session()
        params = self._dir_params()
        async with session.post(
            f"{self._base_url}/session/{session_id}/abort", params=params
        ) as resp:
            resp.raise_for_status()
            return True

    async def reply_permission(
        self,
        permission_id: str,
        allowed: bool,
    ) -> bool:
        """回复权限请求。"""
        session = await self._get_session()
        params = self._dir_params()
        async with session.post(
            f"{self._base_url}/permission/reply",
            params=params,
            json={"id": permission_id, "allowed": allowed},
        ) as resp:
            resp.raise_for_status()
            return True

    async def list_permissions(self) -> List[Dict[str, Any]]:
        """列出待处理的权限请求。"""
        session = await self._get_session()
        params = self._dir_params()
        async with session.get(
            f"{self._base_url}/permission", params=params
        ) as resp:
            resp.raise_for_status()
            return await resp.json()

    # ── Diff API ─────────────────────────────────

    async def get_session_diff(self, session_id: str) -> Dict[str, Any]:
        """获取会话的代码差异。"""
        session = await self._get_session()
        params = self._dir_params()
        async with session.get(
            f"{self._base_url}/session/{session_id}/diff", params=params
        ) as resp:
            resp.raise_for_status()
            return await resp.json()

    # ── File API ─────────────────────────────────

    async def list_files(self, directory: Optional[str] = None) -> List[Dict[str, Any]]:
        """列出项目文件。"""
        session = await self._get_session()
        params = self._dir_params(directory)
        async with session.get(f"{self._base_url}/file", params=params) as resp:
            resp.raise_for_status()
            return await resp.json()

    async def read_file(self, path: str) -> Dict[str, Any]:
        """读取文件内容。"""
        session = await self._get_session()
        params = self._dir_params()
        params["path"] = path
        async with session.get(
            f"{self._base_url}/file/read", params=params,
        ) as resp:
            resp.raise_for_status()
            return await resp.json()
