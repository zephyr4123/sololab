"""并发执行管理 - asyncio 并行执行、信号量限速、非阻塞外部调用。"""

import asyncio
import logging
from typing import Any, Callable, Coroutine, Dict, List, Optional, TypeVar

import aiohttp

logger = logging.getLogger(__name__)

T = TypeVar("T")


class RateLimiter:
    """基于信号量的 API 限速器。

    控制对外部 API 的并发请求数量，防止超出速率限制。
    """

    def __init__(self, max_concurrent: int = 5, requests_per_second: float = 10.0) -> None:
        self._semaphore = asyncio.Semaphore(max_concurrent)
        self._interval = 1.0 / requests_per_second if requests_per_second > 0 else 0
        self._last_request_time = 0.0

    async def acquire(self) -> None:
        """获取执行权限（等待信号量 + 速率限制）。"""
        await self._semaphore.acquire()
        if self._interval > 0:
            now = asyncio.get_event_loop().time()
            elapsed = now - self._last_request_time
            if elapsed < self._interval:
                await asyncio.sleep(self._interval - elapsed)
            self._last_request_time = asyncio.get_event_loop().time()

    def release(self) -> None:
        """释放执行权限。"""
        self._semaphore.release()

    async def __aenter__(self):
        await self.acquire()
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        self.release()
        return False


class ParallelExecutor:
    """并行任务执行器。

    支持有限并发、错误隔离、超时控制。
    """

    def __init__(self, max_concurrent: int = 10, timeout: float = 60.0) -> None:
        self.max_concurrent = max_concurrent
        self.timeout = timeout
        self._semaphore = asyncio.Semaphore(max_concurrent)

    async def run_all(
        self,
        tasks: List[Callable[[], Coroutine[Any, Any, T]]],
        return_exceptions: bool = True,
    ) -> List[T | Exception]:
        """并行执行所有任务，返回结果列表。

        Args:
            tasks: 协程工厂函数列表
            return_exceptions: 是否将异常作为结果返回（否则抛出）

        Returns:
            与 tasks 同序的结果列表
        """

        async def _wrapped(idx: int, task_fn: Callable) -> tuple:
            async with self._semaphore:
                try:
                    result = await asyncio.wait_for(task_fn(), timeout=self.timeout)
                    return idx, result
                except asyncio.TimeoutError:
                    logger.warning("任务 %d 超时 (%.1fs)", idx, self.timeout)
                    if return_exceptions:
                        return idx, TimeoutError(f"Task {idx} timed out after {self.timeout}s")
                    raise
                except Exception as e:
                    logger.warning("任务 %d 失败: %s", idx, e)
                    if return_exceptions:
                        return idx, e
                    raise

        results = await asyncio.gather(
            *[_wrapped(i, fn) for i, fn in enumerate(tasks)],
            return_exceptions=return_exceptions,
        )

        # 按原始顺序排列结果
        ordered = [None] * len(tasks)
        for item in results:
            if isinstance(item, Exception):
                # gather 自身捕获的异常
                ordered[0] = item  # fallback
            else:
                idx, result = item
                ordered[idx] = result
        return ordered

    async def run_with_progress(
        self,
        tasks: List[Callable[[], Coroutine[Any, Any, T]]],
        on_complete: Optional[Callable[[int, T], None]] = None,
    ) -> List[T | Exception]:
        """并行执行任务，支持进度回调。"""
        results = [None] * len(tasks)
        completed = 0

        async def _run(idx: int, task_fn: Callable):
            nonlocal completed
            async with self._semaphore:
                try:
                    result = await asyncio.wait_for(task_fn(), timeout=self.timeout)
                    results[idx] = result
                    completed += 1
                    if on_complete:
                        on_complete(completed, result)
                except Exception as e:
                    results[idx] = e
                    completed += 1

        await asyncio.gather(*[_run(i, fn) for i, fn in enumerate(tasks)])
        return results


class AsyncHTTPClient:
    """非阻塞 HTTP 客户端封装。

    基于 aiohttp，支持超时和重试。
    """

    def __init__(self, timeout: float = 10.0, max_retries: int = 2) -> None:
        self.timeout = aiohttp.ClientTimeout(total=timeout)
        self.max_retries = max_retries
        self._session: Optional[aiohttp.ClientSession] = None

    async def _get_session(self) -> aiohttp.ClientSession:
        if self._session is None or self._session.closed:
            self._session = aiohttp.ClientSession(timeout=self.timeout)
        return self._session

    async def get(self, url: str, headers: Optional[Dict] = None, **kwargs) -> Dict:
        """非阻塞 GET 请求。"""
        return await self._request("GET", url, headers=headers, **kwargs)

    async def post(
        self, url: str, json: Optional[Dict] = None, headers: Optional[Dict] = None, **kwargs
    ) -> Dict:
        """非阻塞 POST 请求。"""
        return await self._request("POST", url, json=json, headers=headers, **kwargs)

    async def _request(self, method: str, url: str, **kwargs) -> Dict:
        """执行 HTTP 请求，支持重试。"""
        last_error = None
        for attempt in range(self.max_retries + 1):
            try:
                session = await self._get_session()
                async with session.request(method, url, **kwargs) as resp:
                    if resp.status >= 400:
                        text = await resp.text()
                        raise aiohttp.ClientResponseError(
                            resp.request_info,
                            resp.history,
                            status=resp.status,
                            message=text,
                        )
                    content_type = resp.content_type or ""
                    if "json" in content_type:
                        return await resp.json()
                    return {"text": await resp.text(), "status": resp.status}
            except (aiohttp.ClientError, asyncio.TimeoutError) as e:
                last_error = e
                if attempt < self.max_retries:
                    wait = 2 ** attempt
                    logger.warning("HTTP %s %s 失败 (尝试 %d/%d): %s, %.1fs 后重试",
                                   method, url, attempt + 1, self.max_retries + 1, e, wait)
                    await asyncio.sleep(wait)
                continue

        raise RuntimeError(f"HTTP {method} {url} failed after {self.max_retries + 1} attempts: {last_error}")

    async def close(self) -> None:
        """关闭 HTTP 会话。"""
        if self._session and not self._session.closed:
            await self._session.close()
